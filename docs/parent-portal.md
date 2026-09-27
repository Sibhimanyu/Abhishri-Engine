# Parent portal

Parents sign in on the web with the mobile number on their child's record and a one-time
SMS code, and see that child's attendance, fees, payments and receipts, plus the school
calendar and the latest weekly menu.

## What parents see, and why it goes through the server

- **Profile: basics only.** Name, programme, joining date, and whether enrollment has
  ended. Not Aadhaar, address, medical notes or the other parent's details.
- **Attendance** month by month (status only, not which staff member marked it).
- **Fees**: this year's plan, paid so far, balance (the dues engine's figure).
- **Payments** that still stand (no voids or concessions), each with its receipt.
- **School calendar** and **weekly menu** (the most recently saved one).

Firestore rules can only allow or deny a whole document, so parents never read student
data directly. `getParentPortal` and `getParentAttendance`
(`functions/src/students/portal.js`) check the signed-in number on every call and
return only the fields above.

## Who can sign in

`students/{id}.portalPhones`: the E.164 form of `fatherPhone` and `motherPhone`
(`functions/src/shared/phone.mjs`), minus any parent an admin has removed.
`syncStudentPortalPhones` keeps it current whenever a record is written, and every
portal call re-checks the record itself.

- Both parents' numbers work. A parent with several children sees all of them.
- **Removing access** is admin-only: Student profile → Family Information → *Remove
  access*. This sets `portalAccess.<father|mother> = false` through
  `setParentPortalAccess`, takes effect on the parent's next request, and is logged
  in `audit_logs`. The number stays on the record. Editing the number later does not
  restore access.
- Parent emails no longer grant any access. The student portal (student's own
  `studentEmail`) is unchanged.
- The iOS app is staff-only and doesn't show the parent sign-in: phone auth needs
  reCAPTCHA, which its bundled web view can't load.

## Going live

1. Firebase console → Authentication → Sign-in method → enable **Phone**.
2. Authentication → Settings → **SMS region policy** → allow India only. This stops
   SMS-pumping abuse from running up the bill.
3. Authentication → Settings → **Authorized domains**: make sure every domain the web
   app is served from is listed.
4. Deploy: `firebase deploy --only functions,firestore:rules,hosting`. Hosting carries
   the CSP change that lets reCAPTCHA load.
5. Backfill existing students (the trigger only runs on a write):
   `cd functions && node scripts/backfill_portal_phones.js --dry-run`, then without
   `--dry-run`. It also lists students with no usable parent mobile number.

Phone auth is billed per SMS on the Blaze plan. See the Firebase pricing page for the
current India rate.
