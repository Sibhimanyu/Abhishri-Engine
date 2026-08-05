/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const { setGlobalOptions } = require("firebase-functions");
const admin = require("firebase-admin");

// Global Config
setGlobalOptions({ maxInstances: 10 });

// Initialize Firebase Admin globally
// Note: Submodules might also check/init, but doing it here ensures it's ready.
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// --- WhatsApp Module ---
const whatsappSend = require("./src/whatsapp/send");
const whatsappWebhook = require("./src/whatsapp/webhook");

exports.sendWhatsAppMessage = whatsappSend.sendWhatsAppMessage;
exports.sendWhatsAppBroadcast = whatsappSend.sendWhatsAppBroadcast;
exports.syncWhatsAppTemplates = whatsappSend.syncWhatsAppTemplates;
exports.checkWhatsAppWallet = whatsappSend.checkWhatsAppWallet;
exports.whatsappWebhook = whatsappWebhook.whatsappWebhook;

// --- Fees & Accounting Module ---
const feeTriggers = require("./src/fees/triggers");
exports.syncStudentFeeTotals = feeTriggers.syncStudentFeeTotals;
exports.syncFeePlanUpdates = feeTriggers.syncFeePlanUpdates;
exports.syncStaffWalletBalance = feeTriggers.syncStaffWalletBalance;
exports.dailyFeeReconciliation = feeTriggers.dailyFeeReconciliation;

// --- Staff Attendance Module ---
const staffAttendance = require("./src/staff/attendance");
exports.selfMarkStaffAttendance = staffAttendance.selfMarkStaffAttendance;
exports.updateStaffAttendanceConfig = staffAttendance.updateStaffAttendanceConfig;

// --- Global Attendance Aggregation ---
const attendanceAggregate = require("./src/attendance/aggregate");
exports.aggregateDailyAttendance = attendanceAggregate.aggregateDailyAttendance;

// --- Auth Triggers ---
const authTriggers = require("./src/auth/triggers");
exports.onUserCreated = authTriggers.onUserCreated;
exports.onUserDeleted = authTriggers.onUserDeleted;

const permissionsMirror = require("./src/auth/permissionsMirror");
exports.onAllowedUserWrite = permissionsMirror.onAllowedUserWrite;
exports.onPermissionGroupWrite = permissionsMirror.onPermissionGroupWrite;

// --- Student Triggers ---
const studentTriggers = require("./src/students/triggers");
exports.onStudentDeleted = studentTriggers.onStudentDeleted;

// Migration functions removed
