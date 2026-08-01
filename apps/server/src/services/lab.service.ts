import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import { writeAuditLog } from "../utils/audit.js";
import { assertClinicalAccess, getAccessiblePatientIds, type Actor } from "./access.service.js";
import { dispatchNotification } from "./notification.service.js";
import { addChargeToBill, removeChargeFromBill } from "./bill.service.js";

/**
 * Laboratory orders and results.
 *
 * Two rules dominate this module:
 *
 * 1. **A result is invisible to the patient until VERIFIED.** `COMPLETED` means a
 *    machine produced a number; `VERIFIED` means a pathologist looked at it and said
 *    it is real. Analysers produce artefacts — a haemolysed sample reads a potassium
 *    that would be an emergency if it were true. Showing that to a patient before
 *    anyone checks it causes real harm.
 *
 * 2. **CRITICAL notifies immediately**, the moment the value is entered — not on the
 *    doctor's next login, not in a digest, and not after verification. The
 *    verification step protects the *patient's* view; the ordering doctor needs to
 *    know now so they can act or repeat the sample.
 */

export type LabStatus =
  "ORDERED" | "SAMPLE_COLLECTED" | "TESTING" | "COMPLETED" | "VERIFIED" | "CANCELLED";

/** Legal forward transitions. A result cannot be entered on an uncollected sample. */
const TRANSITIONS: Record<LabStatus, LabStatus[]> = {
  ORDERED: ["SAMPLE_COLLECTED", "CANCELLED"],
  SAMPLE_COLLECTED: ["TESTING", "CANCELLED"],
  TESTING: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["VERIFIED", "TESTING"],
  VERIFIED: [],
  CANCELLED: [],
};

function assertTransition(from: LabStatus, to: LabStatus) {
  if (!TRANSITIONS[from].includes(to)) {
    throw new AppError(`A lab order cannot move from ${from} to ${to}`, 400);
  }
}

async function generateOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.labOrder.count();
  return `LAB-${year}-${String(count + 1).padStart(6, "0")}`;
}

async function requireLabTechnician(actor: Actor) {
  const tech = await prisma.labTechnician.findUnique({
    where: { userId: actor.userId },
    select: { id: true, fullName: true, canVerify: true },
  });
  if (!tech) throw new AppError("Lab technician record not found", 404);
  return tech;
}

// ─── Catalogue ──────────────────────────────────────────────────────────────

export async function listTests(filters: { category?: string; search?: string } = {}) {
  return prisma.labTest.findMany({
    where: {
      isActive: true,
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: "insensitive" as const } },
              { code: { contains: filters.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

// ─── Ordering ───────────────────────────────────────────────────────────────

export async function createOrder(
  input: {
    patientId: string;
    appointmentId?: string;
    labTestIds: string[];
    notes?: string;
    isRetest?: boolean;
    retestOfId?: string;
    retestReason?: string;
  },
  actor: Actor,
) {
  const doctor = await prisma.doctor.findUnique({
    where: { userId: actor.userId },
    select: { id: true },
  });
  if (!doctor) throw new AppError("Doctor record not found", 404);

  await assertClinicalAccess(input.patientId, actor);

  if (input.labTestIds.length === 0) {
    throw new AppError("A lab order needs at least one test", 400);
  }

  const tests = await prisma.labTest.findMany({
    where: { id: { in: input.labTestIds }, isActive: true },
  });
  if (tests.length !== input.labTestIds.length) {
    throw new AppError("One or more tests are unavailable", 400);
  }

  const order = await prisma.labOrder.create({
    data: {
      orderNumber: await generateOrderNumber(),
      patientId: input.patientId,
      doctorId: doctor.id,
      appointmentId: input.appointmentId ?? null,
      notes: input.notes ?? null,
      isRetest: input.isRetest ?? false,
      retestOfId: input.retestOfId ?? null,
      retestReason: input.retestReason ?? null,
      items: {
        // The reference range is copied onto the item at order time. Ranges get
        // revised; a result must always be read against the range that was current
        // when it was measured, not whatever the catalogue says today.
        create: tests.map((t) => ({ labTestId: t.id, referenceRange: t.referenceRange })),
      },
    },
    include: { items: { include: { labTest: true } } },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "LAB_ORDER_CREATED",
    targetType: "lab_order",
    targetId: order.id,
    metadata: { patientId: input.patientId, tests: tests.map((t) => t.code) },
  });

  // The tests' charges flow to the bill — one line per test, on the visit's bill
  // when there is one, otherwise the patient's standing draft bill. Best-effort: a
  // billing hiccup must never fail an order a doctor has already acted on.
  for (const t of tests) {
    try {
      await addChargeToBill(
        {
          patientId: input.patientId,
          appointmentId: input.appointmentId,
          kind: "LAB",
          sourceId: order.id,
          description: `Lab — ${t.name} (${t.code})`,
          unitPrice: t.price,
        },
        actor.userId,
      );
    } catch (err) {
      console.error(`[lab] Failed to bill test ${t.code} on order ${order.id}:`, err);
    }
  }

  return order;
}

export async function cancelOrder(orderId: string, reason: string, actor: Actor) {
  const order = await prisma.labOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError("Lab order not found", 404);
  await assertClinicalAccess(order.patientId, actor);
  assertTransition(order.status as LabStatus, "CANCELLED");

  const cancelled = await prisma.labOrder.update({
    where: { id: orderId },
    data: { status: "CANCELLED", notes: reason },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "LAB_ORDER_CANCELLED",
    targetType: "lab_order",
    targetId: orderId,
    metadata: { patientId: order.patientId, reason },
  });

  // A cancelled order is no longer owed. Draft bills drop the lines; a bill that was
  // already finalised keeps them, and the money is unwound via refund instead.
  try {
    await removeChargeFromBill(orderId, "LAB");
  } catch (err) {
    console.error(`[lab] Failed to remove bill charges for cancelled order ${orderId}:`, err);
  }

  return cancelled;
}

/**
 * A doctor asks to re-run a previous order. The new order is linked via `retestOfId`
 * with the reason recorded on it, so the lab sees at a glance what is a fresh order
 * and what is chasing a doubtful value.
 */
export async function retestOrder(orderId: string, reason: string, actor: Actor) {
  if (!reason?.trim()) throw new AppError("A retest needs a reason", 400);

  const original = await prisma.labOrder.findUnique({
    where: { id: orderId },
    include: { items: { select: { labTestId: true } } },
  });
  if (!original) throw new AppError("Lab order not found", 404);

  // The doctor retesting must have clinical access to the patient too.
  await assertClinicalAccess(original.patientId, actor);

  return createOrder(
    {
      patientId: original.patientId,
      appointmentId: original.appointmentId ?? undefined,
      labTestIds: original.items.map((i) => i.labTestId).filter(Boolean),
      notes: `Retest requested — reason: ${reason.trim()}`,
      isRetest: true,
      retestOfId: orderId,
      retestReason: reason.trim(),
    },
    actor,
  );
}

// ─── Sample workflow ────────────────────────────────────────────────────────

export async function collectSample(orderId: string, actor: Actor) {
  const tech = await requireLabTechnician(actor);
  const order = await prisma.labOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError("Lab order not found", 404);
  assertTransition(order.status as LabStatus, "SAMPLE_COLLECTED");

  const updated = await prisma.labOrder.update({
    where: { id: orderId },
    data: {
      status: "SAMPLE_COLLECTED",
      sampleCollectedAt: new Date(),
      collectedById: tech.id,
    },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "LAB_SAMPLE_COLLECTED",
    targetType: "lab_order",
    targetId: orderId,
    metadata: { patientId: order.patientId },
  });

  return updated;
}

export async function startTesting(orderId: string, actor: Actor) {
  await requireLabTechnician(actor);
  const order = await prisma.labOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError("Lab order not found", 404);
  assertTransition(order.status as LabStatus, "TESTING");

  return prisma.labOrder.update({ where: { id: orderId }, data: { status: "TESTING" } });
}

export interface ResultInput {
  itemId: string;
  resultValue: string;
  unit?: string;
  flag?: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
}

/**
 * Enters results and moves the order to COMPLETED.
 *
 * A CRITICAL value alerts the ordering doctor here, before verification. The two
 * concerns are separate: verification gates what the *patient* sees; the doctor needs
 * the number now.
 */
export async function enterResults(orderId: string, results: ResultInput[], actor: Actor) {
  await requireLabTechnician(actor);

  const order = await prisma.labOrder.findUnique({
    where: { id: orderId },
    include: { items: true, doctor: { select: { userId: true, fullName: true } } },
  });
  if (!order) throw new AppError("Lab order not found", 404);
  assertTransition(order.status as LabStatus, "COMPLETED");

  const itemIds = new Set(order.items.map((i) => i.id));
  for (const r of results) {
    if (!itemIds.has(r.itemId)) {
      throw new AppError("Result submitted for a test not on this order", 400);
    }
    if (!r.resultValue?.trim()) {
      throw new AppError("A result needs a value", 400);
    }
  }

  // Results and the status change move together — a COMPLETED order with half its
  // results written is a report someone will read as if it were whole.
  const updated = await prisma.$transaction(async (tx) => {
    for (const r of results) {
      await tx.labOrderItem.update({
        where: { id: r.itemId },
        data: {
          resultValue: r.resultValue.trim(),
          unit: r.unit ?? null,
          flag: r.flag ?? null,
        },
      });
    }
    return tx.labOrder.update({
      where: { id: orderId },
      data: { status: "COMPLETED", completedAt: new Date() },
      include: { items: { include: { labTest: true } } },
    });
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "LAB_RESULTS_ENTERED",
    targetType: "lab_order",
    targetId: orderId,
    metadata: {
      patientId: order.patientId,
      flags: results.map((r) => r.flag ?? "NONE"),
    },
  });

  const critical = updated.items.filter((i) => i.flag === "CRITICAL");
  if (critical.length > 0) {
    await notifyCriticalResult(order.doctor.userId, orderId, order.patientId, critical);
  }

  return updated;
}

async function notifyCriticalResult(
  doctorUserId: string,
  orderId: string,
  patientId: string,
  criticalItems: { labTestId: string; resultValue: string | null }[],
) {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { fullName: true, mrn: true },
  });

  // Best-effort: a notification failure must not roll back a result that is already
  // recorded. It is audited either way, so the alert is recoverable; the result is
  // the thing that must not be lost.
  try {
    await dispatchNotification({
      userId: doctorUserId,
      type: "CRITICAL_RESULT",
      title: "CRITICAL lab result",
      message: `${patient?.fullName ?? "A patient"} (${patient?.mrn ?? "?"}) has ${
        criticalItems.length
      } critical result(s) requiring immediate review.`,
      linkUrl: `/lab/orders/${orderId}`,
      data: {
        orderId,
        mrn: patient?.mrn ?? "",
        patientName: patient?.fullName ?? "A patient",
        count: String(criticalItems.length),
      },
    });
  } catch (err) {
    console.error("[lab] Failed to dispatch CRITICAL result alert:", err);
  }

  await writeAuditLog({
    actorUserId: doctorUserId,
    action: "LAB_CRITICAL_ALERTED",
    targetType: "lab_order",
    targetId: orderId,
    metadata: { patientId, count: criticalItems.length },
  });
}

/**
 * Verification. Only a technician with `canVerify` — a pathologist — may do this, and
 * only they release the result to the patient.
 */
export async function verifyOrder(orderId: string, actor: Actor) {
  const tech = await requireLabTechnician(actor);
  if (!tech.canVerify) {
    throw new AppError("Only a pathologist may verify lab results", 403);
  }

  const order = await prisma.labOrder.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { labTest: { select: { name: true, code: true } } } },
      patient: { select: { userId: true, fullName: true } },
    },
  });
  if (!order) throw new AppError("Lab order not found", 404);
  assertTransition(order.status as LabStatus, "VERIFIED");

  if (order.items.some((i) => !i.resultValue)) {
    throw new AppError("Every test must have a result before the order is verified", 400);
  }

  const verified = await prisma.labOrder.update({
    where: { id: orderId },
    data: { status: "VERIFIED", verifiedAt: new Date(), verifiedById: tech.id },
  });

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "LAB_ORDER_VERIFIED",
    targetType: "lab_order",
    targetId: orderId,
    metadata: { patientId: order.patientId, verifiedBy: tech.fullName },
  });

  // A verified order is a finished document, so it becomes a MedicalRecord whose
  // text feeds the Phase 5 RAG pipeline. The record stores the report as text (no
  // Cloudinary asset exists), which the records viewer renders inline.
  const reportText =
    `Lab order ${order.orderNumber}\n` +
    order.items
      .map(
        (i) =>
          `${i.labTest.code} ${i.labTest.name}: ${i.resultValue ?? ""} ${i.unit ?? ""}${i.flag ? ` [${i.flag}]` : ""}`,
      )
      .join("\n");

  await prisma.medicalRecord.create({
    data: {
      patientId: order.patientId,
      fileUrl: `lab:${order.orderNumber}`,
      fileType: "text",
      title: `Lab report ${order.orderNumber}`,
      category: "lab_report",
      extractedText: reportText,
      uploadedById: actor.userId,
    },
  });

  // Only now does the patient learn there is anything to see.
  if (order.patient.userId) {
    try {
      await dispatchNotification({
        userId: order.patient.userId,
        type: "LAB_RESULT_READY",
        title: "Your lab results are ready",
        message: `Results for order ${order.orderNumber} have been verified and are now available.`,
        linkUrl: `/lab/orders/${orderId}`,
        data: { orderId, orderNumber: order.orderNumber },
      });
    } catch (err) {
      console.error("[lab] Failed to notify patient of verified results:", err);
    }
  }

  return verified;
}

// ─── Reads ──────────────────────────────────────────────────────────────────

/**
 * Whether this actor may see result values on this order.
 *
 * Patients (and their guardians) see nothing until VERIFIED. Clinicians and lab staff
 * see results as soon as they exist — acting on an unverified critical value is the
 * whole point of alerting them.
 */
export function canSeeResults(actorRole: string, status: string): boolean {
  if (actorRole === "PATIENT") return status === "VERIFIED";
  return true;
}

/** Strips result values from an order the caller may see the existence but not the content of. */
function redactResults<T extends { items: unknown[]; status: string }>(order: T): T {
  return {
    ...order,
    items: (order.items as Record<string, unknown>[]).map((i) => ({
      ...i,
      resultValue: null,
      unit: null,
      flag: null,
    })),
  };
}

export async function getOrder(orderId: string, actor: Actor) {
  const order = await prisma.labOrder.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { labTest: true } },
      patient: { select: { fullName: true, mrn: true } },
      doctor: { select: { fullName: true } },
    },
  });
  if (!order) throw new AppError("Lab order not found", 404);
  await assertClinicalAccess(order.patientId, actor);

  await writeAuditLog({
    actorUserId: actor.userId,
    action: "LAB_ORDER_VIEWED",
    targetType: "lab_order",
    targetId: orderId,
    metadata: { patientId: order.patientId, status: order.status },
  });

  return canSeeResults(actor.role, order.status) ? order : redactResults(order);
}

export async function listPatientOrders(patientId: string, actor: Actor) {
  await assertClinicalAccess(patientId, actor);

  const orders = await prisma.labOrder.findMany({
    where: { patientId },
    include: {
      items: { include: { labTest: { select: { name: true, code: true } } } },
      doctor: { select: { fullName: true } },
    },
    orderBy: { orderedAt: "desc" },
  });

  return orders.map((o) => (canSeeResults(actor.role, o.status) ? o : redactResults(o)));
}

/** The lab's own worklist — everything not yet finished, oldest first. */
export async function listWorklist(actor: Actor, status?: LabStatus) {
  await requireLabTechnician(actor);

  return prisma.labOrder.findMany({
    where: {
      status: status ?? { in: ["ORDERED", "SAMPLE_COLLECTED", "TESTING", "COMPLETED"] },
    },
    include: {
      items: { include: { labTest: { select: { name: true, code: true, sampleType: true } } } },
      patient: { select: { fullName: true, mrn: true } },
      doctor: { select: { fullName: true } },
    },
    orderBy: { orderedAt: "asc" },
  });
}

/** A doctor's or patient's orders across patients they are entitled to see. */
export async function listMyOrders(actor: Actor) {
  const allowed = await getAccessiblePatientIds(actor);

  // Scope goes in the WHERE clause. Fetching broadly and filtering afterwards is a
  // breach one forgotten line away.
  const orders = await prisma.labOrder.findMany({
    where: allowed === null ? {} : { patientId: { in: allowed } },
    include: {
      items: { include: { labTest: { select: { name: true, code: true } } } },
      patient: { select: { fullName: true, mrn: true } },
    },
    orderBy: { orderedAt: "desc" },
    take: 100,
  });

  return orders.map((o) => (canSeeResults(actor.role, o.status) ? o : redactResults(o)));
}
