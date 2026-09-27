const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { resolveAccess } = require("../shared/access");

/**
 * The parent portal. Parents sign in with an SMS code (Firebase phone auth) and see
 * their child's attendance, fees, payments and receipts, and nothing else.
 *
 * Why the portal reads through these callables instead of straight from Firestore:
 * rules can only allow or deny a whole document, and a student document carries
 * Aadhaar, address, medical notes and the other parent's details. The school chose
 * "basics only" for parents, so the server picks the fields. Attendance rows also
 * record which staff member marked them; parents get the status alone.
 *
 * Who counts as a parent: students/{id}.portalPhones, the E.164 form of fatherPhone
 * and motherPhone minus any parent an admin has removed (portalAccess.<role> false).
 * syncStudentPortalPhones keeps that array in step with the record so it can be
 * queried; every read re-derives it from the record as well, so a number edited or
 * removed a moment ago can't still get in while the trigger catches up.
 */

const TZ = "Asia/Kolkata";

/** 'YYYY-MM-DD' of an instant in IST, whatever the server's timezone. */
function istDay(date) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(date).reduce((acc, x) => ({ ...acc, [x.type]: x.value }), {});
  return `${p.year}-${p.month}-${p.day}`;
}

/** Local calendar day of a Date built by enrollment.mjs's parseDate. */
function localDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const toMillis = (v) => (v && typeof v.toMillis === "function") ? v.toMillis() : (typeof v === "number" ? v : null);

function studentName(s) {
  return s.name || `${s.firstName || ""} ${s.lastName || ""}`.trim() || "Student";
}

/** The signed-in parent's number, or an error for anyone who didn't sign in by phone. */
function callerPhone(auth) {
  if (!auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const phone = auth.token?.phone_number;
  if (!phone || auth.token?.firebase?.sign_in_provider !== "phone") {
    throw new HttpsError("permission-denied", "The parent portal is for parents signed in with their phone number.");
  }
  return phone;
}

/** Students this number may see, re-checked against each record (see the header). */
async function childrenFor(phone) {
  const { portalPhonesFor } = await import("../shared/phone.mjs");
  const snap = await admin.firestore().collection("students").where("portalPhones", "array-contains", phone).get();
  return snap.docs
    .filter(d => portalPhonesFor(d.data()).includes(phone))
    .sort((a, b) => studentName(a.data()).localeCompare(studentName(b.data())));
}

/**
 * Plan totals the way the portal always showed them: the full year for an active
 * student, only through the exit month for one who has left, and the dues engine's
 * own balance (functions/src/fees/triggers.js) whenever it has computed one.
 */
function feeSummary(plan, student, billingSchedule) {
  if (!plan || !Array.isArray(plan.components)) return null;
  const monthsCharged = billingSchedule(plan, student).chargeable.length;
  const isMonthly = c => c.frequency === "monthly";
  const sumOf = (pred, pick) => plan.components.filter(pred).reduce((a, c) => a + (Number(pick(c)) || 0), 0);
  const base = c => c.baseAmount !== undefined ? c.baseAmount : c.amount;
  const annualNetFee = sumOf(c => !isMonthly(c), c => c.amount) + sumOf(isMonthly, c => c.amount) * monthsCharged;
  const paid = Number(plan.paid) || 0;
  const discounted = Number(plan.discounted) || 0;
  const summary = student.financialSummary || {};
  return {
    components: plan.components
      .filter(c => Number(c.amount) > 0)
      .map(c => ({ uid: c.uid || null, name: c.name || "Fee", amount: Number(c.amount) || 0, frequency: c.frequency || "onetime" })),
    monthsCharged,
    totalAnnual: sumOf(c => !isMonthly(c), base) + sumOf(isMonthly, base) * monthsCharged,
    paid,
    due: typeof summary.annualRemaining === "number" ? summary.annualRemaining : Math.max(0, annualNetFee - paid - discounted),
  };
}

/** Standing payments only: no concessions, voids, or payments that were voided. */
function payments(txDocs, classifyIncomeTx) {
  return txDocs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(t => classifyIncomeTx(t) === "incoming" && !t.isVoided && Number(t.amount) > 0)
    .map(t => ({
      id: t.id,
      amount: Number(t.amount),
      method: t.method || "Cash",
      description: t.description || "Fee Payment",
      timestamp: toMillis(t.timestamp),
      breakdown: t.breakdown || null,
      breakdownNames: t.breakdownNames || null,
    }))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

/** Everything the portal shows for each of the caller's children, apart from attendance. */
exports.getParentPortal = onCall(async (request) => {
  const phone = callerPhone(request.auth);
  const { billingSchedule, isDiscontinued, getDiscontinuationDate, isOnRolls } = await import("../shared/enrollment.mjs");
  const { classifyIncomeTx } = await import("../shared/feeTx.mjs");

  const docs = await childrenFor(phone);
  const children = await Promise.all(docs.map(async (d) => {
    const s = d.data();
    const [planSnap, txSnap] = await Promise.all([
      d.ref.collection("fee_ledger").doc("plan_details").get(),
      d.ref.collection("transactions").get(),
    ]);
    const exit = getDiscontinuationDate(s);
    return {
      id: d.id,
      name: studentName(s),
      programme: s.studentType === "tuition" ? "Tuition" : "Preschool",
      enrollmentDate: s.enrollmentDate || null,
      // Stated plainly so a family whose child has left isn't shown a live-looking page.
      enrollment: isDiscontinued(s)
        ? { status: isOnRolls(s) ? "leaving" : "left", exitDate: exit ? localDay(exit) : null }
        : { status: "active", exitDate: null },
      fees: feeSummary(planSnap.exists ? planSnap.data() : null, s, billingSchedule),
      payments: payments(txSnap.docs, classifyIncomeTx),
    };
  }));

  logger.info("getParentPortal", { phoneTail: phone.slice(-4), children: children.length });
  return { phone, today: istDay(new Date()), children };
});

/** One month of a child's attendance: { 'YYYY-MM-DD': 'present' | 'absent' | 'late' }. */
exports.getParentAttendance = onCall(async (request) => {
  const phone = callerPhone(request.auth);
  const studentId = String(request.data?.studentId || "");
  const month = String(request.data?.month || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpsError("invalid-argument", "month must look like 2026-09.");

  const children = await childrenFor(phone);
  if (!children.some(d => d.id === studentId)) {
    throw new HttpsError("permission-denied", "This number isn't linked to that student.");
  }

  const today = istDay(new Date());
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${month}-${String(day).padStart(2, "0")}`;
    if (key <= today) days.push(key);
  }

  const db = admin.database();
  const statuses = {};
  await Promise.all(days.map(async (key) => {
    const snap = await db.ref(`modules/student_directory/attendance/${key}/${studentId}/status`).get();
    const status = snap.val();
    if (["present", "absent", "late"].includes(status)) statuses[key] = status;
  }));
  return { month, today, statuses };
});

/**
 * Admin-only: allow or remove one parent's portal access. The number stays on the
 * record; only sign-in stops. Written here rather than from the client so the flag
 * and portalPhones change together and the removal takes effect on the parent's
 * very next request, with an audit entry.
 */
exports.setParentPortalAccess = onCall(async (request) => {
  const access = await resolveAccess(request.auth);
  if (!access || !access.isAdmin) throw new HttpsError("permission-denied", "Only an admin can change parent portal access.");
  const { PARENT_ROLES, portalPhonesFor } = await import("../shared/phone.mjs");

  const studentId = String(request.data?.studentId || "");
  const role = String(request.data?.role || "");
  const allowed = request.data?.allowed === true;
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(studentId)) throw new HttpsError("invalid-argument", "studentId is missing or malformed.");
  if (!PARENT_ROLES.includes(role)) throw new HttpsError("invalid-argument", "role must be father or mother.");

  const db = admin.firestore();
  const ref = db.collection("students").doc(studentId);
  const result = await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Student not found.");
    const s = snap.data();
    const portalAccess = { ...(s.portalAccess || {}), [role]: allowed };
    const portalPhones = portalPhonesFor({ ...s, portalAccess });
    t.update(ref, { portalAccess, portalPhones });
    t.create(db.collection("audit_logs").doc(), {
      action: allowed ? "PARENT_PORTAL_ALLOWED" : "PARENT_PORTAL_REMOVED",
      module: "student_directory",
      targetId: studentId,
      targetName: studentName(s),
      performedBy: String(access.email || "").toLowerCase() || null,
      timestamp: FieldValue.serverTimestamp(),
      details: { role, phone: s[`${role}Phone`] || null },
    });
    return { portalAccess, portalPhones };
  });

  logger.info("setParentPortalAccess", { studentId, role, allowed, by: access.email });
  return result;
});

/**
 * Keep portalPhones in step with the record, whoever edits it (web profile, admission
 * form, the iOS app, imports). Writing the same array back is skipped, which is also
 * what stops this trigger re-entering on its own write.
 */
exports.syncStudentPortalPhones = onDocumentWritten("students/{studentId}", async (event) => {
  const after = event.data.after && event.data.after.exists ? event.data.after.data() : null;
  if (!after) return;
  const { portalPhonesFor } = await import("../shared/phone.mjs");
  const phones = portalPhonesFor(after);
  if (JSON.stringify(phones) === JSON.stringify(after.portalPhones || [])) return;
  await event.data.after.ref.update({ portalPhones: phones });
});
