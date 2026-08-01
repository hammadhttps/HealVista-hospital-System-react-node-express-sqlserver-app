/* Phase 4 exit-demo walk through the live API against the seeded Neon DB. */
const BASE = "http://localhost:5000/api";

async function api(method, path, token, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: "Bearer " + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { success: false, raw: text };
  }
  return { status: r.status, ...json };
}

async function login(email) {
  const r = await api("POST", "/auth/login", null, { email, password: "demo1234" });
  if (r.status !== 200) throw new Error(`login failed for ${email}: ${r.status}`);
  return r.data.accessToken;
}

let failures = 0;
function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  ✅ ${name}`);
  } else {
    failures++;
    console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`);
  }
}

(async () => {
  console.log("== Phase 4 demo walk ==");

  console.log("\n[setup] logins");
  const doc = await login("sarah@medicore.com");
  const rec = await login("reception@medicore.com");
  const lab = await login("lab@medicore.com");
  const pt = await login("alex@example.com");
  const pharm = await login("tom@medicore.com");
  const admin = await login("mark@medicore.com");
  console.log("  all roles logged in");

  console.log("\n[setup] doctor + patient ids");
  const me = await api("GET", "/auth/me", doc);
  const doctorId = me.data.doctor.id;
  const patientId = "999fa932-aed6-4c56-80dc-e314fa0da02b";
  console.log(`  doctorId=${doctorId} patientId=${patientId}`);

  console.log("\n[setup] availability + slots + walk-in appointment");
  // A re-run must not trip over the previous run's leftovers: an appointment still
  // in a live state holds its slot, which pushes the next free slot outside the
  // ±30 min check-in window. Cancel them so their slots free up again.
  const appts = await api("GET", "/appointments", rec);
  const leftovers = (appts.data || []).filter(
    (a) =>
      a.patientId === patientId &&
      ["CONFIRMED", "CHECKED_IN", "IN_CONSULTATION"].includes(a.status),
  );
  for (const a of leftovers) {
    await api("PATCH", `/appointments/${a.id}/cancel`, rec, { reason: "Demo cleanup" });
  }
  if (leftovers.length > 0) console.log(`  cancelled ${leftovers.length} leftover appointment(s)`);

  // Book a slot *today* within the check-in window (±30 min of start), so the
  // receptionist can actually check the walk-in in and the doctor can start it.
  const now = new Date();
  const todayDow = now.getUTCDay();
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const nextHalfHour = (Math.floor(nowMin / 30) + 1) * 30;
  const startHh = String(Math.floor(nextHalfHour / 60)).padStart(2, "0");
  const startMm = String(nextHalfHour % 60).padStart(2, "0");
  const availability = [
    {
      dayOfWeek: todayDow,
      startTime: `${startHh}:${startMm}`,
      endTime: `${String(Math.min(23, Math.floor((nextHalfHour + 180) / 60))).padStart(2, "0")}:00`,
      slotDurationMins: 30,
      isActive: true,
    },
  ];
  await api("PUT", `/doctors/${doctorId}/availability`, doc, availability);
  await api("POST", "/appointments/admin/generate-slots", admin, { doctorId });
  const dateStr = now.toISOString().slice(0, 10);
  const slots = await api("GET", `/doctors/${doctorId}/slots/${dateStr}`, rec);
  const free = (slots.data || []).find((s) => {
    if (s.isBooked) return false;
    const t = new Date(s.startTime).getTime();
    return t > now.getTime() && t <= now.getTime() + 30 * 60 * 1000;
  });
  check(
    "doctor has a free slot within the check-in window",
    !!free,
    JSON.stringify(slots).slice(0, 300),
  );
  const booked = await api("POST", "/appointments/walk-in", rec, {
    patientId,
    doctorId,
    slotId: free.id,
    reasonNote: "Phase 4 demo visit",
  });
  const appointmentId = booked.data?.appointment?.id || booked.data?.id;
  check(
    "walk-in appointment created",
    booked.status === 201 && !!appointmentId,
    String(booked.status),
  );

  const qrToken = booked.data?.qrToken || booked.data?.appointment?.qrToken;
  const checkedIn = await api("POST", "/appointments/check-in", rec, { qrToken });
  check("walk-in checked in (QR token)", checkedIn.status === 200, String(checkedIn.status));
  const started = await api("PATCH", `/appointments/${appointmentId}/start`, doc);
  check(
    "consultation started (IN_CONSULTATION)",
    started.status === 200 && started.data?.status === "IN_CONSULTATION",
    `${started.status} ${started.data?.status || ""}`,
  );

  console.log("\n[4.3] SOAP note from a template");
  await api("POST", "/note-templates", doc, {
    name: `URTI follow-up ${Date.now()}`,
    subjective: "Sore throat, dry cough x3 days",
    objective: "Temp normal, pharynx erythematous",
    assessment: "Viral upper respiratory tract infection",
    plan: "Rest, fluids, symptomatic care",
  });
  const templates = await api("GET", "/note-templates", doc);
  check("note template saved and listed", (templates.data || []).length >= 1);

  // appointment cannot be COMPLETED without a signed note
  const earlyComplete = await api("PATCH", `/appointments/${appointmentId}/complete`, doc);
  check(
    "appointment cannot be COMPLETED before the note is signed",
    earlyComplete.status === 400 || earlyComplete.status === 409,
    String(earlyComplete.status),
  );

  const noteSave = await api("PUT", `/appointments/${appointmentId}/note`, doc, {
    subjective: "Sore throat, dry cough x3 days",
    objective: "Temp 98.6F, pharynx erythematous",
    assessment: "Viral URTI",
    plan: "Rest, fluids",
    isDraft: false,
  });
  check("SOAP note saved", noteSave.status === 200, String(noteSave.status));
  const signed = await api("POST", `/appointments/${appointmentId}/note/sign`, doc);
  check(
    "note signed (signedAt set)",
    signed.status === 200 && !!signed.data?.signedAt,
    String(signed.status),
  );

  console.log("\n[4.4] allergy hard-block on prescribing");
  const existingAllergies = await api("GET", `/patients/${patientId}/allergies`, doc);
  const known = new Set((existingAllergies.data || []).map((a) => a.allergen));
  if (!known.has("Penicillin")) {
    await api("POST", `/patients/${patientId}/allergies`, doc, {
      allergen: "Penicillin",
      severity: "SEVERE",
      reaction: "Anaphylaxis",
    });
  }
  if (!known.has("Aspirin")) {
    await api("POST", `/patients/${patientId}/allergies`, doc, {
      allergen: "Aspirin",
      severity: "MODERATE",
      reaction: "Rash",
    });
  }
  const blocked = await api("POST", "/prescriptions", doc, {
    appointmentId,
    items: [
      {
        medicineName: "Penicillin V 250mg",
        dosage: "250mg",
        frequency: "tid x7d",
        durationDays: 7,
      },
    ],
  });
  check(
    "SEVERE penicillin allergy → 409 hard block",
    blocked.status === 409 && /SEVERE allergy/i.test(blocked.error || ""),
    `${blocked.status} ${blocked.error}`,
  );

  console.log("\n[4.4] moderate warning → acknowledgement recorded");
  const draft = await api("POST", "/prescriptions", doc, {
    appointmentId,
    isDraft: true,
    items: [
      {
        medicineName: "Aspirin 75mg",
        dosage: "75mg",
        frequency: "od",
        durationDays: 30,
        quantityPrescribed: 30,
      },
    ],
  });
  check(
    "draft prescription saved (warnings don't block drafts)",
    draft.status === 201,
    String(draft.status),
  );
  const rxId = draft.data.prescription?.id;
  const issueNoAck = await api("POST", `/prescriptions/${rxId}/issue`, doc, {
    acknowledgedWarnings: [],
  });
  check(
    "issue without acknowledgement → 409",
    issueNoAck.status === 409,
    String(issueNoAck.status),
  );

  const checkReport = await api("POST", "/prescriptions/check", doc, {
    appointmentId,
    medicines: ["Aspirin 75mg"],
  });
  const warningKey =
    checkReport.data?.acknowledgeable?.[0] && !checkReport.data?.blocking?.length
      ? (() => {
          const w = checkReport.data.acknowledgeable[0];
          return w.kind === "allergy"
            ? `allergy:${w.medicineName}:${w.allergen}`
            : `interaction:${w.drugA}:${w.drugB}`;
        })()
      : null;
  check(
    "dry-run returns an acknowledgeable warning key",
    !!warningKey,
    JSON.stringify(checkReport.data),
  );
  const issueAck = await api("POST", `/prescriptions/${rxId}/issue`, doc, {
    acknowledgedWarnings: [warningKey],
  });
  check(
    "issue with recorded acknowledgement → issued",
    issueAck.status === 200,
    String(issueAck.status),
  );

  console.log("\n[4.4] prescribe from a favourite");
  await api("POST", "/prescription-favourites", doc, {
    name: "Flu kit",
    items: [
      {
        medicineName: "Paracetamol 500mg",
        dosage: "500mg",
        frequency: "prn",
        durationDays: 5,
        quantityPrescribed: 20,
      },
    ],
  });
  const favs = await api("GET", "/prescription-favourites", doc);
  check("favourite saved", (favs.data || []).length >= 1);

  console.log("\n[4.7] doctor orders a blood panel");
  const catalog = await api("GET", "/lab/tests", doc);
  const bloodPanel = (catalog.data || []).filter((t) =>
    /blood|cbc|haem|panel/i.test(t.name + t.code),
  );
  const panel = bloodPanel.length >= 2 ? bloodPanel : (catalog.data || []).slice(0, 3);
  const order = await api("POST", "/lab/orders", doc, {
    patientId,
    appointmentId,
    labTestIds: panel.map((t) => t.id),
    notes: "Phase 4 demo blood panel",
  });
  const orderId = order.data?.id;
  check(
    "lab order created (charges flow to bill)",
    order.status === 201 && !!orderId,
    String(order.status),
  );

  console.log("\n[4.7] lab technician workflow + CRITICAL alert + verification gating");
  const worklist = await api("GET", "/lab/worklist", lab);
  const pending = (worklist.data || []).find((o) => o.id === orderId);
  check("order appears on the lab worklist", !!pending);
  const collected = await api("POST", `/lab/orders/${orderId}/collect`, lab);
  check(
    "sample collected (collector + timestamp recorded)",
    collected.status === 200 && !!collected.data?.sampleCollectedAt,
    String(collected.status),
  );
  const labStarted = await api("POST", `/lab/orders/${orderId}/start`, lab);
  check("testing started", labStarted.status === 200 && labStarted.data?.status === "TESTING");
  const itemIds = order.data.items.map((i) => i.id);
  const results = await api("POST", `/lab/orders/${orderId}/results`, lab, {
    results: itemIds.map((id, idx) => ({
      itemId: id,
      resultValue: idx === 0 ? "7.9" : "140",
      unit: idx === 0 ? "mmol/L" : "g/L",
      flag: idx === 0 ? "CRITICAL" : "NORMAL",
    })),
  });
  check(
    "results entered → COMPLETED",
    results.status === 200 && results.data?.status === "COMPLETED",
    String(results.status),
  );

  const patientBefore = await api("GET", `/lab/patients/${patientId}/orders`, pt);
  const beforeOrder = (patientBefore.data || []).find((o) => o.id === orderId);
  const hidden =
    beforeOrder &&
    beforeOrder.items.every((i) => i.resultValue === null) &&
    beforeOrder.items.every((i) => i.flag === null);
  check("patient sees NO values while order is COMPLETED (unverified)", !!hidden);

  const verify = await api("POST", `/lab/orders/${orderId}/verify`, lab);
  check(
    "pathologist (canVerify) verifies the order",
    verify.status === 200 && verify.data?.status === "VERIFIED",
    String(verify.status),
  );

  const patientAfter = await api("GET", `/lab/patients/${patientId}/orders`, pt);
  const afterOrder = (patientAfter.data || []).find((o) => o.id === orderId);
  const visible =
    afterOrder &&
    afterOrder.items.some((i) => i.resultValue !== null) &&
    afterOrder.items.some((i) => i.flag === "CRITICAL");
  check("patient sees values (incl. the CRITICAL flag) once VERIFIED", !!visible);

  console.log("\n[4.3] consultation completes now that the note is signed");
  const completed = await api("PATCH", `/appointments/${appointmentId}/complete`, doc);
  check("appointment COMPLETED", completed.status === 200, String(completed.status));

  console.log("\n[4.6] pharmacy: inventory floor + batch recall via the ledger");
  // A consultation issues ONE prescription (appointmentId is unique on the
  // prescription), so the pharmacy flow runs against a second visit — booking
  // another free slot today and prescribing on that appointment.
  const slots2 = await api("GET", `/doctors/${doctorId}/slots/${dateStr}`, rec);
  const free2 = (slots2.data || []).find((s) => !s.isBooked && s.id !== free.id);
  check("a second slot is available for the pharmacy visit", !!free2);
  const booked2 = await api("POST", "/appointments/walk-in", rec, {
    patientId,
    doctorId,
    slotId: free2.id,
    reasonNote: "Phase 4 demo pharmacy visit",
  });
  const pharmacyAppointmentId = booked2.data?.appointment?.id || booked2.data?.id;
  check(
    "second appointment booked for the pharmacy flow",
    booked2.status === 201 && !!pharmacyAppointmentId,
    String(booked2.status),
  );

  const meds = await api("GET", "/pharmacy/medicines", pharm);
  const catalogue = meds.data?.items || meds.data || [];
  const paracetamol = catalogue.find((m) => /paracetamol/i.test(m.name));
  check("paracetamol in catalogue", !!paracetamol, JSON.stringify(meds.data).slice(0, 150));
  const medId = paracetamol.id;

  // Prescribe a catalogue medicine WITH medicineId so dispensing writes a real
  // ledger row (batch + prescriptionId) that recall can trace back to the patient.
  const rxPharm = await api("POST", "/prescriptions", doc, {
    appointmentId: pharmacyAppointmentId,
    items: [
      {
        medicineId: medId,
        medicineName: paracetamol.name,
        dosage: "500mg",
        frequency: "od",
        durationDays: 5,
        quantityPrescribed: 10000,
      },
    ],
  });
  check(
    "paracetamol prescribed with medicineId",
    rxPharm.status === 201,
    `${rxPharm.status} ${rxPharm.error || ""}`,
  );
  const rxPharmId = rxPharm.data.prescription?.id;

  await api("POST", "/pharmacy/inventory/adjust", pharm, {
    medicineId: medId,
    changeAmount: 100,
    reason: "Demo restock",
    batchNumber: "BATCH-DEMO-1",
  });

  const rxPharmView = await api("GET", `/prescriptions/${rxPharmId}`, doc);
  const itemPharmId = rxPharmView.data?.items?.[0]?.id;
  check(
    "issued prescription line resolvable",
    !!itemPharmId,
    JSON.stringify(rxPharmView.data).slice(0, 200),
  );

  // Over-dispense: 5000 is within the 10000 prescribed but far beyond the ~1300
  // in stock, so the stock floor — not the prescription — must reject it.
  const over = await api("POST", `/pharmacy/prescriptions/${rxPharmId}/dispense`, pharm, {
    lines: [{ prescriptionItemId: itemPharmId, quantity: 5000, batchNumber: "BATCH-DEMO-1" }],
  });
  check(
    "dispensing beyond stock rejected",
    over.status === 400 || over.status === 409,
    `${over.status} ${over.error || ""}`,
  );

  // Dispense 10 within the restocked batch, then recall that batch.
  const dispense = await api("POST", `/pharmacy/prescriptions/${rxPharmId}/dispense`, pharm, {
    lines: [{ prescriptionItemId: itemPharmId, quantity: 10, batchNumber: "BATCH-DEMO-1" }],
  });
  check(
    "dispense succeeded within stock (ledger row + batch)",
    dispense.status === 200,
    `${dispense.status} ${dispense.error || ""}`,
  );

  const preview = await api("GET", `/pharmacy/recalls/preview/${medId}/BATCH-DEMO-1`, pharm);
  const previewData = preview.data || {};
  const found = (previewData.patients || []).some((p) => p.id === patientId);
  check(
    "batch recall preview finds the dispensed patient",
    preview.status === 200 && previewData.patientsAffected >= 1 && found,
    JSON.stringify(previewData).slice(0, 200),
  );

  const recall = await api("POST", "/pharmacy/recalls", pharm, {
    medicineId: medId,
    batchNumber: "BATCH-DEMO-1",
    reason: "Demo: suspected contamination",
  });
  check(
    "batch recall issued and counted affected patients",
    recall.status === 201 && recall.data?.patientsAffected >= 1,
    `${recall.status} ${JSON.stringify(recall.data).slice(0, 150)}`,
  );

  console.log(
    "\n" + (failures === 0 ? "🎉 ALL DEMO CHECKS PASSED" : `💥 ${failures} DEMO CHECK(S) FAILED`),
  );
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error("SCRIPT ERROR", e);
  process.exit(2);
});
