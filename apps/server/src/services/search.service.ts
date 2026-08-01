import { prisma } from "../config/db.js";
import { writeAuditLog } from "../utils/audit.js";
import type {
  SavedSearchEntry,
  SearchHistoryEntry,
  SearchResponse,
  SearchResult,
  SearchResultGroup,
  SearchResultType,
} from "@healvista/shared";

/**
 * Global keyword search (Phase 6.3).
 *
 * Postgres full-text search over six entity types, backed by the GIN expression
 * indexes in `20260801040000_phase6_fulltext_search_indexes`. Every query below
 * reproduces its index's `to_tsvector('simple', …)` expression *exactly*, or the
 * index is not used and the search degrades to a sequential scan.
 *
 * `'simple'` — not `'english'` — is deliberate: no stemming means MRNs, bill
 * numbers, and order numbers match literally, and Urdu text behaves predictably.
 *
 * **Role filtering happens here, in SQL, before any row is returned.** Which
 * entity types a role may search at all is decided by `VISIBLE_TYPES`; which
 * *rows* within a type are decided by the scope predicates. A patient can only
 * ever match their own records. Post-filtering a shared result set would be a
 * cross-patient data leak, so it is never done.
 */

const DEFAULT_LIMIT = 5;

/** Which entity types each role may search. Anything absent is never queried. */
const VISIBLE_TYPES: Record<string, SearchResultType[]> = {
  // Sees only their own appointments, lab orders and invoices, plus the public
  // doctor directory. Never the patient directory.
  PATIENT: ["doctor", "appointment", "labOrder", "invoice"],
  DOCTOR: ["patient", "doctor", "appointment", "labOrder", "medicine"],
  // Front desk: demographics and scheduling, plus billing identity. No clinical
  // content and no medicines.
  RECEPTIONIST: ["patient", "doctor", "appointment", "invoice"],
  // Stock and dispensing only. Deliberately no patient, appointment or lab
  // access — a pharmacist searching "ibuprofen" gets medicines, not diagnoses.
  PHARMACIST: ["medicine"],
  LAB_TECHNICIAN: ["labOrder", "patient", "doctor"],
  ACCOUNTANT: ["invoice", "patient"],
  ADMIN: ["patient", "doctor", "appointment", "medicine", "labOrder", "invoice"],
};

/**
 * Which entity types a role may search. An unknown role gets nothing — the
 * default is deny, so adding a role without deciding its visibility cannot
 * silently expose the patient directory.
 */
export function visibleTypesForRole(role: string): SearchResultType[] {
  return VISIBLE_TYPES[role] ?? [];
}

const TYPE_LABELS: Record<SearchResultType, string> = {
  patient: "Patients",
  doctor: "Doctors",
  appointment: "Appointments",
  medicine: "Medicines",
  labOrder: "Lab orders",
  invoice: "Invoices",
};

/**
 * Builds a prefix `tsquery` string so search-as-you-type matches partial words.
 *
 * The raw input is never interpolated into SQL — this produces a plain string
 * that is passed to `to_tsquery` as a bound parameter. Anything that is not
 * alphanumeric is dropped, which also strips the `&|!():*` operators that would
 * otherwise let a user craft their own tsquery.
 */
export function toPrefixTsQuery(input: string): string | null {
  const tokens = input
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `${t}:*`).join(" & ");
}

interface Scope {
  patientId: string | null;
  doctorId: string | null;
}

/** Resolves the caller's own patient/doctor row once, for the scope predicates. */
async function resolveScope(userId: string, role: string): Promise<Scope> {
  const [patient, doctor] = [
    role === "PATIENT"
      ? await prisma.patient.findUnique({ where: { userId }, select: { id: true } })
      : null,
    role === "DOCTOR"
      ? await prisma.doctor.findUnique({ where: { userId }, select: { id: true } })
      : null,
  ];
  return { patientId: patient?.id ?? null, doctorId: doctor?.id ?? null };
}

export async function globalSearch(
  userId: string,
  role: string,
  rawQuery: string,
  limit = DEFAULT_LIMIT,
  ipAddress?: string | null,
): Promise<SearchResponse> {
  const tsQuery = toPrefixTsQuery(rawQuery);
  const types = VISIBLE_TYPES[role] ?? [];
  if (!tsQuery || types.length === 0) {
    return { query: rawQuery, groups: [], total: 0 };
  }

  const scope = await resolveScope(userId, role);
  const groups: SearchResultGroup[] = [];

  for (const type of types) {
    const results = await runTypeSearch(type, tsQuery, role, scope, limit);
    if (results.length > 0) {
      groups.push({ type, label: TYPE_LABELS[type], results });
    }
  }

  const total = groups.reduce((sum, g) => sum + g.results.length, 0);

  // Searching the patient directory or a clinical record is a read of patient
  // data, so it is audited like any other. The query text is recorded, never the
  // rows returned.
  if (total > 0 && groups.some((g) => g.type === "patient" || g.type === "labOrder")) {
    await writeAuditLog({
      actorUserId: userId,
      action: "search.patient_data",
      targetType: "search",
      targetId: userId,
      ipAddress,
      metadata: { query: rawQuery, types: groups.map((g) => g.type), total },
    });
  }

  await recordHistory(userId, rawQuery);

  return { query: rawQuery, groups, total };
}

/**
 * One query per entity type. Each is a separate statement rather than a UNION so
 * the planner can use each table's own GIN index, and so a role that cannot see
 * a type never issues its query at all.
 */
async function runTypeSearch(
  type: SearchResultType,
  tsQuery: string,
  role: string,
  scope: Scope,
  limit: number,
): Promise<SearchResult[]> {
  switch (type) {
    case "patient": {
      const rows = await prisma.$queryRaw<
        Array<{ id: string; fullName: string; mrn: string; phone: string | null }>
      >`SELECT p.id, p."fullName", p.mrn, u.phone
         FROM patients p
         JOIN users u ON u.id = p."userId"
         WHERE p."deletedAt" IS NULL
           AND to_tsvector('simple', coalesce(p."fullName", '') || ' ' || coalesce(p."mrn", ''))
               @@ to_tsquery('simple', ${tsQuery})
         ORDER BY p."fullName" LIMIT ${limit}`;
      return rows.map((r) => ({
        type,
        id: r.id,
        title: r.fullName,
        subtitle: `MRN ${r.mrn}`,
        // Front desk and accounts see demographics; clinical detail is gated by
        // the patient detail page itself.
        meta: role === "RECEPTIONIST" || role === "ACCOUNTANT" ? r.phone : null,
        href: `/patients/${r.id}`,
      }));
    }

    case "doctor": {
      const rows = await prisma.$queryRaw<
        Array<{ id: string; fullName: string; department: string | null }>
      >`SELECT d.id, d."fullName",
              (SELECT dep.name
                 FROM doctor_departments dd
                 JOIN departments dep ON dep.id = dd."departmentId"
                WHERE dd."doctorId" = d.id
                ORDER BY dd."isPrimary" DESC
                LIMIT 1) AS department
         FROM doctors d
         WHERE d."deletedAt" IS NULL
           AND to_tsvector('simple', coalesce(d."fullName", ''))
               @@ to_tsquery('simple', ${tsQuery})
         ORDER BY d."fullName" LIMIT ${limit}`;
      return rows.map((r) => ({
        type,
        id: r.id,
        title: r.fullName,
        subtitle: r.department,
        href: `/doctors/${r.id}`,
      }));
    }

    case "appointment": {
      // A patient matches only their own; a doctor only their own panel.
      const rows = await prisma.$queryRaw<
        Array<{ id: string; appointmentNo: string; status: string; patientName: string }>
      >`SELECT a.id, a."appointmentNo", a.status::text AS status, p."fullName" AS "patientName"
         FROM appointments a
         JOIN patients p ON p.id = a."patientId"
         WHERE a."deletedAt" IS NULL
           AND to_tsvector('simple', coalesce(a."appointmentNo", ''))
               @@ to_tsquery('simple', ${tsQuery})
           AND (${scope.patientId}::text IS NULL OR a."patientId" = ${scope.patientId})
           AND (${scope.doctorId}::text IS NULL OR a."doctorId" = ${scope.doctorId})
         ORDER BY a."createdAt" DESC LIMIT ${limit}`;
      return rows.map((r) => ({
        type,
        id: r.id,
        title: r.appointmentNo,
        // A patient searching their own appointments does not need their own
        // name echoed back at them.
        subtitle: role === "PATIENT" ? null : r.patientName,
        meta: r.status,
        href: role === "PATIENT" ? "/patient/appointments" : `/consultation/${r.id}`,
      }));
    }

    case "medicine": {
      const rows = await prisma.$queryRaw<
        Array<{ id: string; name: string; genericName: string | null; quantity: number | null }>
      >`SELECT m.id, m.name, m."genericName", i.quantity
         FROM medicines m
         LEFT JOIN inventory i ON i."medicineId" = m.id
         WHERE m."deletedAt" IS NULL
           AND to_tsvector('simple', coalesce(m.name, '') || ' ' || coalesce(m."genericName", ''))
               @@ to_tsquery('simple', ${tsQuery})
         ORDER BY m.name LIMIT ${limit}`;
      return rows.map((r) => ({
        type,
        id: r.id,
        title: r.name,
        subtitle: r.genericName,
        meta: r.quantity === null ? null : `${r.quantity} in stock`,
        href: "/pharmacy",
      }));
    }

    case "labOrder": {
      const rows = await prisma.$queryRaw<
        Array<{ id: string; orderNumber: string; status: string; patientName: string }>
      >`SELECT lo.id, lo."orderNumber", lo.status::text AS status, p."fullName" AS "patientName"
         FROM lab_orders lo
         JOIN patients p ON p.id = lo."patientId"
         WHERE to_tsvector('simple', coalesce(lo."orderNumber", ''))
               @@ to_tsquery('simple', ${tsQuery})
           AND (${scope.patientId}::text IS NULL OR lo."patientId" = ${scope.patientId})
           AND (${scope.doctorId}::text IS NULL OR lo."doctorId" = ${scope.doctorId})
         ORDER BY lo."orderedAt" DESC LIMIT ${limit}`;
      return rows.map((r) => ({
        type,
        id: r.id,
        title: r.orderNumber,
        subtitle: role === "PATIENT" ? null : r.patientName,
        meta: r.status,
        href: role === "PATIENT" ? "/patient/lab-results" : "/lab",
      }));
    }

    case "invoice": {
      const rows = await prisma.$queryRaw<
        Array<{
          id: string;
          billNumber: string;
          status: string;
          balance: string;
          patientName: string;
        }>
      >`SELECT b.id, b."billNumber", b.status, b.balance::text AS balance,
              p."fullName" AS "patientName"
         FROM bills b
         JOIN patients p ON p.id = b."patientId"
         WHERE b."deletedAt" IS NULL
           AND to_tsvector('simple', coalesce(b."billNumber", ''))
               @@ to_tsquery('simple', ${tsQuery})
           AND (${scope.patientId}::text IS NULL OR b."patientId" = ${scope.patientId})
         ORDER BY b."createdAt" DESC LIMIT ${limit}`;
      return rows.map((r) => ({
        type,
        id: r.id,
        title: r.billNumber,
        subtitle: role === "PATIENT" ? null : r.patientName,
        meta: r.status,
        href: role === "PATIENT" ? "/patient/bills" : "/billing",
      }));
    }

    default:
      return [];
  }
}

/** Keeps the 20 most recent distinct queries per user. */
const HISTORY_LIMIT = 20;

async function recordHistory(userId: string, query: string): Promise<void> {
  try {
    await prisma.searchHistory.deleteMany({ where: { userId, query } });
    await prisma.searchHistory.create({ data: { userId, query } });

    const stale = await prisma.searchHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: HISTORY_LIMIT,
      select: { id: true },
    });
    if (stale.length > 0) {
      await prisma.searchHistory.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    }
  } catch {
    // History is a convenience. Never fail a search because it could not be recorded.
  }
}

export async function getSearchHistory(userId: string): Promise<SearchHistoryEntry[]> {
  const rows = await prisma.searchHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });
  return rows.map((r) => ({
    id: r.id,
    query: r.query,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function clearSearchHistory(userId: string): Promise<void> {
  await prisma.searchHistory.deleteMany({ where: { userId } });
}

export async function getSavedSearches(userId: string): Promise<SavedSearchEntry[]> {
  const rows = await prisma.savedSearch.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    query: r.query,
    label: r.label,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function saveSearch(
  userId: string,
  query: string,
  label?: string,
): Promise<SavedSearchEntry> {
  const row = await prisma.savedSearch.create({
    data: { userId, query, label: label ?? null },
  });
  return {
    id: row.id,
    query: row.query,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Scoped by `userId` so one user can never delete another's saved search. */
export async function deleteSavedSearch(userId: string, id: string): Promise<void> {
  await prisma.savedSearch.deleteMany({ where: { id, userId } });
}
