const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

/**
 * Syncs user permissions from Firestore (allowedUsers) to Realtime Database.
 * Uses UID for more robust and faster security rule checks.
 */
exports.syncPermissionsToRTDB = onDocumentWritten("allowedUsers/{email}", async (event) => {
    const email = event.params.email.toLowerCase();
    const data = event.data.after.data();
    const rtdb = admin.database();

    try {
        // Find the Firebase Auth user by email to get their UID
        let uid = null;
        try {
            const userRecord = await admin.auth().getUserByEmail(email);
            uid = userRecord.uid;
        } catch (authError) {
            // User might not have signed up yet, that's okay.
            // We'll store by encoded email as a fallback if needed, 
            // but for primary security we want the UID.
            console.log(`User ${email} hasn't registered yet. Sync will complete when they first sign in.`);
        }

        const encodedEmail = email.replace(/\./g, ",");
        const payload = data ? {
            email: email,
            isAdmin: !!data.isAdmin,
            permissions: data.permissions || {},
            updatedAt: admin.database.ServerValue.TIMESTAMP
        } : null;

        // 1. Always store by encoded email for reference
        await rtdb.ref(`authorized_emails/${encodedEmail}`).set(payload);

        // 2. If we have a UID, store it there for the security rules to use auth.uid
        if (uid) {
            await rtdb.ref(`authorized_users/${uid}`).set(payload);
        }
        
        console.log(`Synced RTDB perms for ${email} (UID: ${uid || 'N/A'})`);
    } catch (error) {
        console.error(`Error syncing permissions for ${email}:`, error);
    }
});
