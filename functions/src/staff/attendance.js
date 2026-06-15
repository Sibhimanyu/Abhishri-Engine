const {onCall, HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const ATTENDANCE_CONFIG = admin.firestore().collection("configs").doc("attendance");

function requireAuth(request) {
  if (!request.auth?.uid || !request.auth?.token?.email) {
    throw new HttpsError("unauthenticated", "User must be logged in.");
  }
}

async function getAllowedUser(email) {
  const snap = await admin.firestore().collection("allowed_users").doc(email.toLowerCase()).get();
  if (!snap.exists) throw new HttpsError("permission-denied", "User is not authorized.");
  return snap.data();
}

async function requireAdmin(request) {
  requireAuth(request);
  const email = request.auth.token.email.toLowerCase();
  const user = await getAllowedUser(email);
  if (!user.isAdmin) {
    throw new HttpsError("permission-denied", "Only admins can configure staff attendance.");
  }
  return email;
}

async function getAttendanceConfig() {
  const snap = await ATTENDANCE_CONFIG.get();
  const config = snap.exists ? snap.data() : {};

  return {
    schoolLatitude: Number(config.schoolLatitude),
    schoolLongitude: Number(config.schoolLongitude),
    allowedRadiusMeters: Number(config.allowedRadiusMeters || 100),
    maxAccuracyMeters: Number(config.maxAccuracyMeters || 150),
    timezone: config.timezone || "Asia/Kolkata",
    lateAfter: config.lateAfter || null,
  };
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatLocationDetails(location) {
  if (!location) return "none";
  const lat = Number(location.latitude);
  const lng = Number(location.longitude);
  const acc = Number(location.accuracy);
  const parts = [];
  if (Number.isFinite(lat) && Number.isFinite(lng)) parts.push(`${lat.toFixed(7)}, ${lng.toFixed(7)}`);
  if (Number.isFinite(acc)) parts.push(`accuracy ${Math.round(acc)}m`);
  return parts.length ? parts.join(" | ") : "invalid";
}

function getDateKey(timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getTimeKey(timezone) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

async function getOwnStaffProfile(email) {
  const snap = await admin.firestore().collection("staff")
      .where("email", "==", email.toLowerCase())
      .limit(1)
      .get();
  if (snap.empty) {
    throw new HttpsError("failed-precondition", "No staff profile is linked to this account.");
  }
  const doc = snap.docs[0];
  return {id: doc.id, ...doc.data()};
}

exports.updateStaffAttendanceConfig = onCall(async (request) => {
  const updatedBy = await requireAdmin(request);
  const data = request.data || {};
  const lat = Number(data.schoolLatitude);
  const lng = Number(data.schoolLongitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new HttpsError("invalid-argument", "Valid school latitude and longitude are required.");
  }

  const config = {
    schoolLatitude: lat,
    schoolLongitude: lng,
    allowedRadiusMeters: Number(data.allowedRadiusMeters || 100),
    maxAccuracyMeters: Number(data.maxAccuracyMeters || 150),
    timezone: data.timezone || "Asia/Kolkata",
    lateAfter: data.lateAfter || null,
    updatedBy,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await ATTENDANCE_CONFIG.set(config, {merge: true});
  return {success: true};
});

exports.selfMarkStaffAttendance = onCall(async (request) => {
  requireAuth(request);
  const email = request.auth.token.email.toLowerCase();
  await getAllowedUser(email);

  const config = await getAttendanceConfig();

  const location = request.data?.location || {};
  const lat = Number(location.latitude);
  const lng = Number(location.longitude);
  const accuracy = Number(location.accuracy);
  const schoolLat = Number(config.schoolLatitude);
  const schoolLng = Number(config.schoolLongitude);
  const hasSchoolLocation = Number.isFinite(schoolLat) && Number.isFinite(schoolLng);

  if (!hasSchoolLocation) {
    throw new HttpsError("failed-precondition", "School location is not configured yet. Ask an admin to set the school latitude and longitude.");
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new HttpsError(
        "failed-precondition",
        "Location access is required to mark attendance. Please allow location permission and try again.",
        {
          expectedSchoolLocation: {latitude: schoolLat, longitude: schoolLng},
          detectedLocation: formatLocationDetails(location),
        }
    );
  }

  const distanceMeters = haversineMeters(schoolLat, schoolLng, lat, lng);
  const allowedRadiusMeters = Number(config.allowedRadiusMeters || 100);
  const maxAccuracyMeters = Number(config.maxAccuracyMeters || 150);

  if (Number.isFinite(accuracy) && accuracy > maxAccuracyMeters) {
    throw new HttpsError(
        "failed-precondition",
        `Location accuracy is too poor to verify attendance. Accuracy: ${Math.round(accuracy)}m. Maximum allowed: ${maxAccuracyMeters}m.`,
        {
          expectedSchoolLocation: {latitude: schoolLat, longitude: schoolLng},
          detectedLocation: formatLocationDetails(location),
          distanceMeters: Math.round(distanceMeters),
          allowedRadiusMeters,
          maxAccuracyMeters,
        }
    );
  }

  if (distanceMeters > allowedRadiusMeters) {
    throw new HttpsError(
        "failed-precondition",
        `You are outside the school location radius. Expected school location: ${schoolLat.toFixed(7)}, ${schoolLng.toFixed(7)}. Your location: ${lat.toFixed(7)}, ${lng.toFixed(7)}. Distance: ${Math.round(distanceMeters)}m. Allowed radius: ${allowedRadiusMeters}m.`,
        {
          expectedSchoolLocation: {latitude: schoolLat, longitude: schoolLng},
          detectedLocation: {latitude: lat, longitude: lng, accuracy: Number.isFinite(accuracy) ? accuracy : null},
          distanceMeters: Math.round(distanceMeters),
          allowedRadiusMeters,
          maxAccuracyMeters,
        }
    );
  }

  const staff = await getOwnStaffProfile(email);
  const dateKey = getDateKey(config.timezone);
  const timeKey = getTimeKey(config.timezone);
  const status = config.lateAfter && timeKey > config.lateAfter ? "late" : "present";

  const attendanceRecord = {
    status,
    timestamp: admin.database.ServerValue.TIMESTAMP,
    markedBy: "self",
    markedByUid: request.auth.uid,
    markedByEmail: email,
    method: "location",
    location: {
      latitude: lat,
      longitude: lng,
      accuracy: Number.isFinite(accuracy) ? accuracy : null,
      schoolLatitude: schoolLat,
      schoolLongitude: schoolLng,
      distanceMeters: Math.round(distanceMeters),
      allowedRadiusMeters,
      maxAccuracyMeters,
    },
    device: request.data.device || null,
  };

  await admin.database().ref(`modules/staff_directory/attendance/${dateKey}/${staff.id}`).set(attendanceRecord);
  await admin.firestore().collection("audit_logs").add({
    action: "SELF_MARK_STAFF_ATTENDANCE",
    module: "staff_directory",
    targetId: staff.id,
    targetName: staff.name || email,
    performedBy: email,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
      details: {
        status,
        date: dateKey,
        method: attendanceRecord.method,
        location: attendanceRecord.location,
      },
  });

  return {
    success: true,
    staffId: staff.id,
    status,
    date: dateKey,
  };
});
