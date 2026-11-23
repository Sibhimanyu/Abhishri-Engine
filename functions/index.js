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
exports.sendWhatsAppReaction = whatsappSend.sendWhatsAppReaction;
exports.sendWhatsAppBroadcast = whatsappSend.sendWhatsAppBroadcast;
exports.syncWhatsAppTemplates = whatsappSend.syncWhatsAppTemplates;
exports.checkWhatsAppWallet = whatsappSend.checkWhatsAppWallet;
exports.whatsappWebhook = whatsappWebhook.whatsappWebhook;
exports.pruneWhatsAppDebugLog = whatsappWebhook.pruneWhatsAppDebugLog;

// --- Arattai Module (sandbox until the Arattai Business API is published) ---
const arattaiSend = require("./src/arattai/send");
const arattaiWebhook = require("./src/arattai/webhook");

exports.checkArattaiAccount = arattaiSend.checkArattaiAccount;
exports.syncArattaiTemplates = arattaiSend.syncArattaiTemplates;
exports.sendArattaiMessage = arattaiSend.sendArattaiMessage;
exports.sendArattaiBroadcast = arattaiSend.sendArattaiBroadcast;
exports.simulateArattaiInbound = arattaiSend.simulateArattaiInbound;
exports.arattaiWebhook = arattaiWebhook.arattaiWebhook;
exports.pruneArattaiDebugLog = arattaiWebhook.pruneArattaiDebugLog;
exports.checkArattaiNotify = require("./src/arattai/notify").checkArattaiNotify;
exports.listStaffNotificationRecipients = require("./src/arattai/notify").listStaffNotificationRecipients;
exports.submitStaffTemplate = require("./src/arattai/staffTemplates").submitStaffTemplate;
exports.refreshStaffTemplates = require("./src/arattai/staffTemplates").refreshStaffTemplates;
exports.deleteStaffTemplate = require("./src/arattai/staffTemplates").deleteStaffTemplate;
exports.startArattaiMiniApp = require("./src/arattai/miniapp").startArattaiMiniApp;

// --- Staff notifications (see src/notify/dispatch.js) ---
exports.pruneNotificationLog = require("./src/notify/dispatch").pruneNotificationLog;

// --- Fees & Accounting Module ---
const feeTriggers = require("./src/fees/triggers");
exports.syncStudentFeeTotals = feeTriggers.syncStudentFeeTotals;
exports.syncFeePlanUpdates = feeTriggers.syncFeePlanUpdates;
exports.syncStudentEnrollmentChanges = feeTriggers.syncStudentEnrollmentChanges;
exports.syncStaffWalletBalance = feeTriggers.syncStaffWalletBalance;
exports.dailyFeeReconciliation = feeTriggers.dailyFeeReconciliation;
exports.dailyWalletReconciliation = feeTriggers.dailyWalletReconciliation;

const payments = require("./src/fees/payments");
exports.logPayment = payments.logPayment;

const feeAllocations = require("./src/fees/allocations");
exports.syncAllocations = feeAllocations.syncAllocations;

const feePeriods = require("./src/fees/periods");
exports.closePeriod = feePeriods.closePeriod;
exports.reopenPeriod = feePeriods.reopenPeriod;
exports.previewPeriod = feePeriods.previewPeriod;

const feeDeposits = require("./src/fees/deposits");
exports.createDeposit = feeDeposits.createDeposit;
exports.undepositedCash = feeDeposits.undepositedCash;

const feeRecon = require("./src/fees/reconciliation");
exports.importStatement = feeRecon.importStatement;
exports.autoMatchStatement = feeRecon.autoMatchStatement;
exports.setStatementLineMatch = feeRecon.setStatementLineMatch;

// --- Staff Attendance Module ---
const staffAttendance = require("./src/staff/attendance");
exports.selfMarkStaffAttendance = staffAttendance.selfMarkStaffAttendance;
exports.updateStaffAttendanceConfig = staffAttendance.updateStaffAttendanceConfig;

// --- Auth Triggers ---
const authTriggers = require("./src/auth/triggers");
exports.onUserDeleted = authTriggers.onUserDeleted;
exports.prepareStaffPasswordSetup = require("./src/auth/passwordSetup").prepareStaffPasswordSetup;

const permissionsMirror = require("./src/auth/permissionsMirror");
exports.onAllowedUserWrite = permissionsMirror.onAllowedUserWrite;
exports.onPermissionGroupWrite = permissionsMirror.onPermissionGroupWrite;
exports.dailyPermissionsMirror = permissionsMirror.dailyPermissionsMirror;

// --- Student Triggers ---
const studentTriggers = require("./src/students/triggers");
exports.onStudentDeleted = studentTriggers.onStudentDeleted;

// --- Parent Portal (phone sign-in) ---
const parentPortal = require("./src/students/portal");
exports.getParentPortal = parentPortal.getParentPortal;
exports.getParentAttendance = parentPortal.getParentAttendance;
exports.setParentPortalAccess = parentPortal.setParentPortalAccess;
exports.syncStudentPortalPhones = parentPortal.syncStudentPortalPhones;

// --- Staff notifications (approvals, access requests, birthdays; Arattai) ---
const notify = require("./src/notify/triggers");
exports.notifyOnMenuApproval = notify.notifyOnMenuApproval;
exports.notifyOnReportApproval = notify.notifyOnReportApproval;
exports.notifyOnAccessRequest = notify.notifyOnAccessRequest;
exports.notifyTamilBirthdays = notify.notifyTamilBirthdays;
exports.sendStaffNotificationTest = notify.sendStaffNotificationTest;

// Migration functions removed
