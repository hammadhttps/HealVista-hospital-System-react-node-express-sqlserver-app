/**
 * End-to-end smoke test: every role, every surface, against a running API.
 *
 * This exists because typecheck and unit tests both passed while the Phase 5
 * analytics assistant threw on every single query — the tests mocked
 * `$queryRaw`, so nothing ever executed the SQL. Anything that only a real
 * server and a real database can prove belongs here.
 *
 *   node scripts/smoke-roles.mjs [baseUrl]
 *
 * Defaults to http://localhost:5000. Point it at the Render URL to verify a
 * deploy. Read-only: it never writes clinical data, and the one write it does
 * make (a chat message) goes to a demo thread.
 */
import { io } from "socket.io-client";

const BASE = (process.argv[2] || "http://localhost:5000").replace(/\/$/, "");
const PASSWORD = "demo1234";

const ACCOUNTS = {
  PATIENT: "alex@example.com",
  DOCTOR: "sarah@medicore.com",
  RECEPTIONIST: "reception@medicore.com",
  PHARMACIST: "tom@medicore.com",
  LAB_TECHNICIAN: "lab@medicore.com",
  ACCOUNTANT: "linda@medicore.com",
  ADMIN: "mark@medicore.com",
};

/**
 * What each role must be able to reach, and what it must not.
 *
 * `deny` matters as much as `allow`: a role test that only checks the happy
 * path passes just as well on a server with no authorisation at all.
 */
const SURFACES = {
  PATIENT: {
    allow: ["/api/dashboard", "/api/appointments", "/api/doctors", "/api/departments", "/api/chat/threads", "/api/notifications", "/api/search?q=al", "/api/me/export"],
    deny: ["/api/analytics/overview", "/api/admin/audit-logs", "/api/patients"],
  },
  DOCTOR: {
    allow: ["/api/dashboard", "/api/appointments", "/api/patients", "/api/queue/today", "/api/chat/threads", "/api/search?q=al", "/api/lab/orders"],
    deny: ["/api/admin/audit-logs", "/api/analytics/overview"],
  },
  RECEPTIONIST: {
    allow: ["/api/dashboard", "/api/appointments", "/api/patients", "/api/doctors", "/api/queue/today", "/api/search?q=al"],
    deny: ["/api/admin/audit-logs", "/api/analytics/overview"],
  },
  PHARMACIST: {
    allow: ["/api/dashboard", "/api/pharmacy/medicines", "/api/search?q=al"],
    deny: ["/api/admin/audit-logs", "/api/analytics/overview"],
  },
  LAB_TECHNICIAN: {
    allow: ["/api/dashboard", "/api/lab/orders", "/api/lab/tests", "/api/search?q=al"],
    deny: ["/api/admin/audit-logs", "/api/analytics/overview"],
  },
  ACCOUNTANT: {
    allow: ["/api/dashboard", "/api/bills", "/api/search?q=al"],
    deny: ["/api/admin/audit-logs", "/api/analytics/overview"],
  },
  ADMIN: {
    allow: ["/api/dashboard", "/api/analytics/overview", "/api/admin/audit-logs", "/api/patients", "/api/doctors", "/api/staff", "/api/departments", "/api/settings", "/api/search?q=al", "/api/bills"],
    deny: [],
  },
};

let passed = 0;
let failed = 0;
const failures = [];

function record(ok, label, detail) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push(`${label} — ${detail}`);
    console.log(`  ✗ ${label} — ${detail}`);
  }
}

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`login ${email}: ${res.status} ${JSON.stringify(body).slice(0, 160)}`);
  const token = body.data?.accessToken ?? body.data?.tokens?.accessToken ?? body.accessToken;
  if (!token) throw new Error(`login ${email}: no access token in ${JSON.stringify(body).slice(0, 160)}`);
  return token;
}

async function get(path, token) {
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  return { status: res.status, ms: Date.now() - started, text };
}

async function checkRole(role) {
  console.log(`\n${role}`);
  const token = await login(ACCOUNTS[role]);
  record(true, "login");

  const slow = [];
  for (const path of SURFACES[role].allow) {
    const { status, ms, text } = await get(path, token);
    // 404 is a pass only for a genuinely absent record, never for a missing
    // route — an unmounted router is exactly the production break we're hunting.
    record(status === 200, `GET ${path}`, `${status} ${text.slice(0, 120)}`);
    if (ms > 1000) slow.push(`${path} ${ms}ms`);
  }

  for (const path of SURFACES[role].deny) {
    const { status } = await get(path, token);
    record(status === 401 || status === 403, `DENY ${path}`, `expected 403, got ${status}`);
  }

  if (slow.length) console.log(`  ⚠ slow: ${slow.join(", ")}`);
  return token;
}

/**
 * The chat round-trip.
 *
 * Verifies the thing that was actually broken: a message POSTed by one user
 * arrives over the socket at the other, without a refresh. Unit tests cannot
 * see this — it needs two live socket connections and a real emit.
 */
async function checkChatRealtime(patientToken, doctorToken) {
  console.log("\nCHAT (real-time)");

  const threadsRes = await get("/api/chat/threads", patientToken);
  if (threadsRes.status !== 200) {
    record(false, "chat threads", `${threadsRes.status}`);
    return;
  }
  const threads = JSON.parse(threadsRes.text).data ?? [];
  if (threads.length === 0) {
    console.log("  ⚠ no chat threads seeded — skipping the round-trip");
    return;
  }
  const threadId = threads[0].id;

  const doctorSocket = io(`${BASE}/chat`, {
    auth: { token: doctorToken },
    transports: ["polling", "websocket"],
    withCredentials: true,
  });

  // Resolves to an outcome rather than rejecting: this promise is created long
  // before it is awaited, and a rejection in that window is an unhandled
  // rejection that kills the whole run — turning one failed assertion into no
  // results at all. The timeout is generous because a cold API can take seconds
  // to answer the POST that triggers the emit.
  const received = new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ error: "no chat:message within 30s" }), 30000);
    doctorSocket.on("chat:message", (msg) => {
      clearTimeout(timer);
      resolve({ msg });
    });
    doctorSocket.on("connect_error", (err) => {
      clearTimeout(timer);
      resolve({ error: `connect_error: ${err.message}` });
    });
  });

  await new Promise((resolve, reject) => {
    doctorSocket.on("connect", resolve);
    doctorSocket.on("connect_error", reject);
    setTimeout(() => reject(new Error("socket connect timeout")), 10000);
  }).then(
    () => record(true, "doctor socket connected"),
    (err) => record(false, "doctor socket connected", err.message),
  );

  doctorSocket.emit("chat:join", { threadId });
  // The join is authorised with a database round-trip, so the room membership
  // is not instant; sending immediately would race it.
  await new Promise((r) => setTimeout(r, 800));

  const body = `smoke ${Date.now()}`;
  const sendRes = await fetch(`${BASE}/api/chat/threads/${threadId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${patientToken}` },
    body: JSON.stringify({ content: body }),
  });
  record(sendRes.ok, "patient POSTs a message", `${sendRes.status}`);

  const outcome = await received;
  record(
    outcome.msg?.content === body,
    "doctor receives it over the socket",
    outcome.error ?? `got ${JSON.stringify(outcome.msg).slice(0, 120)}`,
  );

  doctorSocket.close();
}

async function main() {
  console.log(`Smoke test against ${BASE}`);

  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  console.log(`health: ${JSON.stringify(health)}`);

  const tokens = {};
  for (const role of Object.keys(SURFACES)) {
    try {
      tokens[role] = await checkRole(role);
    } catch (err) {
      record(false, `${role} suite`, err.message);
    }
  }

  if (tokens.PATIENT && tokens.DOCTOR) {
    await checkChatRealtime(tokens.PATIENT, tokens.DOCTOR);
  }

  console.log(`\n${"=".repeat(60)}\n${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
