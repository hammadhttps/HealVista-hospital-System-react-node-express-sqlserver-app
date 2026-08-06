import { Prisma } from "@prisma/client";
import { prisma, prismaDirect } from "../config/db.js";
import { redis } from "../config/redis.js";
import { AppError } from "../utils/AppError.js";
import { writeAuditLog } from "../utils/audit.js";
import { dispatchNotification } from "./notification.service.js";
import type { Actor } from "./access.service.js";

/**
 * Pharmacy — inventory, dispensing, and batch recall.
 *
 * Two invariants hold this module together:
 *
 * 1. **Stock never goes negative.** Dispensing more than is on the shelf is an error,
 *    not a clamp to zero. Clamping silently makes the system disagree with the shelf,
 *    and the shelf is right.
 *
 * 2. **The ledger and the count move together, in one transaction.** Every change to
 *    `Inventory.quantity` writes an `InventoryTransaction` in the same transaction, so
 *    the two can never diverge. That ledger is also what makes recall possible: it
 *    records the batch number *and* the prescription, which is the join from "this
 *    batch is contaminated" to "these are the patients who received it". If the batch
 *    number lived only on the inventory row, it would be overwritten by the next
 *    delivery and recall would be impossible.
 */

/**
 * The stock floor, as a pure function.
 *
 * Extracted so it can be tested without a database: this returning `true` when it
 * should not is how stock goes negative, and that is worth pinning directly.
 */
export function hasSufficientStock(inStock: number, requested: number): boolean {
  return Number.isInteger(requested) && requested > 0 && inStock >= requested;
}

/** How much of a prescription line is still owed. */
export function remainingOnItem(item: {
  quantityPrescribed: number;
  quantityDispensed: number;
}): number {
  return Math.max(0, item.quantityPrescribed - item.quantityDispensed);
}

/**
 * Derives dispense status from the items themselves rather than from what this call
 * happened to dispense — another pharmacist may have handled part of it already.
 */
export function deriveDispenseStatus(
  items: { quantityPrescribed: number; quantityDispensed: number }[],
): "PENDING" | "PARTIAL" | "DISPENSED" {
  if (items.length === 0) return "PENDING";
  if (items.every((i) => i.quantityDispensed >= i.quantityPrescribed)) return "DISPENSED";
  if (items.some((i) => i.quantityDispensed > 0)) return "PARTIAL";
  return "PENDING";
}

async function requirePharmacist(actor: Actor) {
  const pharmacist = await prisma.pharmacist.findUnique({
    where: { userId: actor.userId },
    select: { id: true, fullName: true },
  });
  if (!pharmacist) throw new AppError("Pharmacist record not found", 404);
  return pharmacist;
}

// ─── Catalogue and stock ────────────────────────────────────────────────────

export async function searchMedicines(query: {
  search?: string;
  lowStockOnly?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;
  const lowStockOnly = query.lowStockOnly === "true";

  // The low-stock view has its own raw-SQL path because Prisma cannot compare two
  // columns in a `where`. It paginates in JS — a shelf at its reorder level is a
  // handful of rows, never a large result set.
  if (lowStockOnly) {
    const all = await listLowStock();
    const items = all.slice((page - 1) * pageSize, page * pageSize);
    return { items, total: all.length, page, pageSize };
  }

  const where: Prisma.MedicineWhereInput = {
    deletedAt: null,
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: "insensitive" as const } },
            { genericName: { contains: query.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.medicine.findMany({
      where,
      include: { inventory: true },
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.medicine.count({ where }),
  ]);

  return { items, total, page, pageSize };
}

/**
 * Barcode lookup — the scan-at-the-counter path. Deliberately exact-match: a fuzzy
 * barcode match would hand over the wrong drug.
 */
export async function findByBarcode(barcode: string) {
  const medicine = await prisma.medicine.findFirst({
    where: { barcode, deletedAt: null },
    include: { inventory: true },
  });
  if (!medicine) throw new AppError("No medicine found for that barcode", 404);
  return medicine;
}

export async function listLowStock() {
  // Prisma cannot compare two columns in a `where`, so the comparison is raw. It stays
  // in SQL rather than being filtered in JS so the query remains usable as stock grows.
  return prisma.$queryRaw<
    {
      medicineId: string;
      name: string;
      quantity: number;
      reorderLevel: number;
    }[]
  >`
    SELECT m.id AS "medicineId", m.name, i.quantity, i."reorderLevel"
    FROM inventory i
    JOIN medicines m ON m.id = i."medicineId"
    WHERE i.quantity <= i."reorderLevel" AND m."deletedAt" IS NULL
    ORDER BY (i.quantity::float / NULLIF(i."reorderLevel", 0)) ASC
  `;
}

/**
 * Adjusts stock — deliveries, corrections, disposals.
 *
 * `changeAmount` is signed. Count and ledger move in one transaction.
 */
export async function adjustStock(
  input: {
    medicineId: string;
    changeAmount: number;
    reason: string;
    batchNumber?: string;
    expiryDate?: string;
  },
  actor: Actor,
) {
  if (!Number.isInteger(input.changeAmount) || input.changeAmount === 0) {
    throw new AppError("Adjustment must be a non-zero whole number", 400);
  }
  if (!input.reason?.trim()) {
    throw new AppError("An inventory adjustment needs a reason", 400);
  }

  const result = await prismaDirect.$transaction(async (tx) => {
    const inventory = await tx.inventory.findUnique({
      where: { medicineId: input.medicineId },
    });
    if (!inventory) throw new AppError("This medicine has no inventory record", 404);

    const newQuantity = inventory.quantity + input.changeAmount;
    if (newQuantity < 0) {
      throw new AppError(
        `Adjustment would take stock negative (have ${inventory.quantity}, change ${input.changeAmount})`,
        400,
      );
    }

    const updated = await tx.inventory.update({
      where: { id: inventory.id },
      data: {
        quantity: newQuantity,
        ...(input.batchNumber ? { batchNumber: input.batchNumber } : {}),
        ...(input.expiryDate ? { expiryDate: new Date(input.expiryDate) } : {}),
      },
    });

    await tx.inventoryTransaction.create({
      data: {
        inventoryId: inventory.id,
        changeAmount: input.changeAmount,
        reason: input.reason.trim(),
        batchNumber: input.batchNumber ?? inventory.batchNumber,
        actorUserId: actor.userId,
      },
    });

    return updated;
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "INVENTORY_ADJUSTED",
    targetType: "medicine",
    targetId: input.medicineId,
    metadata: { changeAmount: input.changeAmount, reason: input.reason },
  });

  await checkLowStock(input.medicineId);
  return result;
}

// ─── Dispensing ─────────────────────────────────────────────────────────────

export interface DispenseLine {
  prescriptionItemId: string;
  quantity: number;
  batchNumber?: string;
}

/**
 * Dispenses against a prescription.
 *
 * Every stock decrement, ledger row, and dispensed-quantity update happens inside one
 * transaction. A partial failure that took stock down without recording what it went
 * to would be both an accounting hole and an un-recallable batch.
 */
export async function dispense(prescriptionId: string, lines: DispenseLine[], actor: Actor) {
  const pharmacist = await requirePharmacist(actor);

  if (lines.length === 0) throw new AppError("Nothing to dispense", 400);
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new AppError("Dispensed quantity must be a positive whole number", 400);
    }
  }

  const prescription = await prisma.prescription.findUnique({
    where: { id: prescriptionId },
    include: { items: true, appointment: { select: { patientId: true } } },
  });
  if (!prescription) throw new AppError("Prescription not found", 404);
  if (prescription.isDraft) {
    throw new AppError("This prescription has not been issued", 409);
  }
  if (prescription.dispenseStatus === "DISPENSED") {
    throw new AppError("This prescription is already fully dispensed", 409);
  }

  const itemsById = new Map(prescription.items.map((i) => [i.id, i]));
  for (const line of lines) {
    const item = itemsById.get(line.prescriptionItemId);
    if (!item) throw new AppError("Line does not belong to this prescription", 400);

    const remaining = remainingOnItem(item);
    if (line.quantity > remaining) {
      throw new AppError(
        `Cannot dispense ${line.quantity} of ${item.medicineName} — only ${remaining} remain on this prescription`,
        400,
      );
    }
  }

  const affectedMedicineIds: string[] = [];

  await prismaDirect.$transaction(async (tx) => {
    for (const line of lines) {
      const item = itemsById.get(line.prescriptionItemId)!;

      // An item without a linked medicine is dispensed off-system (an external
      // supply). It still updates the prescription, but there is no stock to move.
      if (item.medicineId) {
        const inventory = await tx.inventory.findUnique({
          where: { medicineId: item.medicineId },
        });
        if (!inventory) {
          throw new AppError(`${item.medicineName} has no inventory record`, 404);
        }
        // Refuse, never clamp. Clamping to zero would silently make the system
        // disagree with the shelf, and the shelf is right.
        if (!hasSufficientStock(inventory.quantity, line.quantity)) {
          throw new AppError(
            `Insufficient stock for ${item.medicineName}: ${inventory.quantity} in stock, ${line.quantity} requested`,
            409,
          );
        }

        await tx.inventory.update({
          where: { id: inventory.id },
          data: { quantity: inventory.quantity - line.quantity },
        });

        // batchNumber and prescriptionId together are what make recall possible.
        await tx.inventoryTransaction.create({
          data: {
            inventoryId: inventory.id,
            changeAmount: -line.quantity,
            reason: "dispense",
            batchNumber: line.batchNumber ?? inventory.batchNumber,
            prescriptionId,
            actorUserId: actor.userId,
          },
        });

        affectedMedicineIds.push(item.medicineId);
      }

      await tx.prescriptionItem.update({
        where: { id: item.id },
        data: { quantityDispensed: { increment: line.quantity } },
      });
    }

    // Recomputed from the items rather than inferred from this call — a second
    // pharmacist may have dispensed part of it already.
    const refreshed = await tx.prescriptionItem.findMany({ where: { prescriptionId } });

    await tx.prescription.update({
      where: { id: prescriptionId },
      data: { dispenseStatus: deriveDispenseStatus(refreshed) },
    });
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "PRESCRIPTION_DISPENSED",
    targetType: "prescription",
    targetId: prescriptionId,
    metadata: {
      patientId: prescription.appointment.patientId,
      pharmacistId: pharmacist.id,
      lines: lines.map((l) => ({
        itemId: l.prescriptionItemId,
        quantity: l.quantity,
        batchNumber: l.batchNumber ?? null,
      })),
    },
  });

  // Outside the transaction: a low-stock alert must not be able to roll back a
  // dispense that already happened.
  for (const medicineId of [...new Set(affectedMedicineIds)]) {
    await checkLowStock(medicineId);
  }

  return prisma.prescription.findUnique({
    where: { id: prescriptionId },
    include: { items: true },
  });
}

/** The pharmacy queue — issued prescriptions still owing stock. */
export async function listDispenseQueue(actor: Actor) {
  await requirePharmacist(actor);

  return prisma.prescription.findMany({
    where: {
      isDraft: false,
      deletedAt: null,
      dispenseStatus: { in: ["PENDING", "PARTIAL"] },
    },
    include: {
      items: true,
      appointment: {
        select: {
          patient: { select: { fullName: true, mrn: true } },
          doctor: { select: { fullName: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

// ─── Low stock ──────────────────────────────────────────────────────────────

/** Redis key guarding "one alert per item per day". */
function dailyAlertKey(scope: string, id: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return `alert:${scope}:${id}:${day}`;
}

/** Claims the daily alert slot for an item. Returns false if one already fired today. */
async function claimDailyAlert(scope: string, id: string): Promise<boolean> {
  if (!redis) return true;
  try {
    const claimed = await redis.set(dailyAlertKey(scope, id), "1", "EX", 86400 * 2, "NX");
    return claimed === "OK";
  } catch {
    // Redis down must not block an alert that is trying to be fired.
    return true;
  }
}

/** Notifies every pharmacist about one low item, at most once per day per item. */
async function dispatchLowStockAlert(medicineId: string) {
  const inventory = await prisma.inventory.findUnique({
    where: { medicineId },
    include: { medicine: { select: { name: true } } },
  });
  if (!inventory || inventory.quantity > inventory.reorderLevel) return 0;
  if (!(await claimDailyAlert("lowstock", medicineId))) return 0;

  const pharmacists = await prisma.pharmacist.findMany({ select: { userId: true } });
  for (const p of pharmacists) {
    await dispatchNotification({
      userId: p.userId,
      type: "LOW_STOCK_ALERT",
      title: "Low stock",
      message: `${inventory.medicine.name} is down to ${inventory.quantity} (reorder level ${inventory.reorderLevel}).`,
      linkUrl: `/pharmacy/inventory`,
      data: { medicineId, quantity: String(inventory.quantity) },
    });
  }
  return pharmacists.length;
}

/**
 * Alerts pharmacists when a medicine drops to its reorder level. Best-effort: a
 * notification failure must never undo the stock movement that triggered it.
 * Deduplicated to one alert per item per day (the hourly sweep shares the same key).
 */
export async function checkLowStock(medicineId: string) {
  try {
    await dispatchLowStockAlert(medicineId);
  } catch (err) {
    console.error("[pharmacy] Low-stock alert failed:", err);
  }
}

/**
 * Hourly sweep: every item at or below its reorder level, regardless of which
 * operation pushed it there. Deduplicated to one alert per item per day, so a
 * medicine sitting low for a week nags once, not 168 times.
 */
export async function scanLowStock(): Promise<number> {
  const low = await listLowStock();
  let dispatched = 0;
  for (const item of low) {
    try {
      dispatched += await dispatchLowStockAlert(item.medicineId);
    } catch (err) {
      // One broken notification must not stop the rest of the sweep.
      console.error(`[pharmacy] Sweep alert failed for ${item.medicineId}:`, err);
    }
  }
  return dispatched;
}

/**
 * Hourly sweep companion: items expiring within the horizon, one alert per item per
 * day. A batch sitting in the fridge for a fortnight warns daily, not hourly.
 */
export async function scanExpiring(withinDays = 90): Promise<number> {
  const expiring = await listExpiring(withinDays);
  const pharmacists = await prisma.pharmacist.findMany({ select: { userId: true } });
  if (pharmacists.length === 0) return 0;

  let dispatched = 0;
  for (const item of expiring) {
    if (!(await claimDailyAlert("expiry", item.id))) continue;
    const daysLeft = Math.max(
      0,
      Math.ceil((item.expiryDate!.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
    );
    for (const p of pharmacists) {
      await dispatchNotification({
        userId: p.userId,
        type: "EXPIRY_ALERT",
        title: "Stock expiring soon",
        message: `${item.medicine.name} expires in ${daysLeft} days (batch ${item.batchNumber ?? "unknown"}).`,
        linkUrl: `/pharmacy/inventory`,
        data: {
          inventoryId: item.id,
          medicine: item.medicine.name,
          daysLeft: String(daysLeft),
        },
      });
    }
    dispatched += pharmacists.length;
  }
  return dispatched;
}

// ─── Batch recall ───────────────────────────────────────────────────────────

/**
 * Finds every patient who received a given batch.
 *
 * This works only because the ledger records `batchNumber` alongside
 * `prescriptionId`. The inventory row's own batch number is whatever arrived most
 * recently, and tells you nothing about what was handed over three months ago.
 */
export async function findPatientsForBatch(medicineId: string, batchNumber: string) {
  const transactions = await prisma.inventoryTransaction.findMany({
    where: {
      batchNumber,
      reason: "dispense",
      prescriptionId: { not: null },
      inventory: { medicineId },
    },
    select: { prescriptionId: true, createdAt: true },
  });

  const prescriptionIds = [...new Set(transactions.map((t) => t.prescriptionId!).filter(Boolean))];
  if (prescriptionIds.length === 0) return [];

  const prescriptions = await prisma.prescription.findMany({
    where: { id: { in: prescriptionIds } },
    select: {
      id: true,
      appointment: {
        select: {
          patientId: true,
          patient: {
            select: {
              id: true,
              fullName: true,
              mrn: true,
              userId: true,
              user: { select: { phone: true } },
            },
          },
        },
      },
    },
  });

  // One row per patient, even if they received the batch more than once.
  const byPatient = new Map<string, (typeof prescriptions)[number]["appointment"]["patient"]>();
  for (const p of prescriptions) {
    byPatient.set(p.appointment.patientId, p.appointment.patient);
  }
  return [...byPatient.values()];
}

export async function recallBatch(
  input: { medicineId: string; batchNumber: string; reason: string },
  actor: Actor,
) {
  await requirePharmacist(actor);
  if (!input.reason?.trim()) throw new AppError("A recall needs a reason", 400);

  const patients = await findPatientsForBatch(input.medicineId, input.batchNumber);
  const medicine = await prisma.medicine.findUnique({
    where: { id: input.medicineId },
    select: { name: true },
  });

  let notified = 0;
  for (const patient of patients) {
    try {
      await dispatchNotification({
        userId: patient.userId,
        type: "BATCH_RECALL",
        title: "Important: medicine recall",
        message: `A batch of ${medicine?.name ?? "a medicine"} you were dispensed has been recalled. Reason: ${input.reason.trim()}. Please contact the hospital pharmacy.`,
        linkUrl: "/pharmacy/recalls",
        data: { batchNumber: input.batchNumber, medicine: medicine?.name ?? "" },
      });
      notified += 1;
    } catch (err) {
      // One unreachable patient must not stop the rest of the recall going out.
      console.error(`[pharmacy] Recall notification failed for patient ${patient.id}:`, err);
    }
  }

  const recall = await prisma.batchRecall.create({
    data: {
      medicineId: input.medicineId,
      batchNumber: input.batchNumber,
      reason: input.reason.trim(),
      patientsNotified: notified,
    },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "BATCH_RECALLED",
    targetType: "medicine",
    targetId: input.medicineId,
    metadata: {
      batchNumber: input.batchNumber,
      patientsAffected: patients.length,
      patientsNotified: notified,
      // Recorded because "we could not reach everyone" is the thing a regulator asks
      // about, and it must be visible without re-deriving it later.
      unreachable: patients.length - notified,
    },
  });

  return { recall, patientsAffected: patients.length, patientsNotified: notified };
}

export async function listRecalls() {
  return prisma.batchRecall.findMany({ orderBy: { recalledAt: "desc" }, take: 50 });
}

/** Stock movement history for one medicine — the audit view. */
export async function getStockHistory(medicineId: string) {
  const inventory = await prisma.inventory.findUnique({ where: { medicineId } });
  if (!inventory) throw new AppError("This medicine has no inventory record", 404);

  return prisma.inventoryTransaction.findMany({
    where: { inventoryId: inventory.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

/** Expiring stock, for the shelf sweep. */
export async function listExpiring(withinDays = 90) {
  const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
  return prisma.inventory.findMany({
    where: { expiryDate: { not: null, lte: cutoff }, quantity: { gt: 0 } },
    include: { medicine: { select: { name: true, barcode: true } } },
    orderBy: { expiryDate: "asc" },
  });
}

export type InventoryWithMedicine = Prisma.InventoryGetPayload<{
  include: { medicine: true };
}>;
