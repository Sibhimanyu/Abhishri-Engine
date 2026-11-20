# Parent portal

Parents sign in only through the Arattai mini app; they don't see fees. The number Arattai
shares must match a parent's number on their child's record. They see that child's
attendance, plus the school calendar and the latest weekly menu. SMS (phone-number)
sign-in is switched off, on the web login page and on the server.

## What parents see, and why it goes through the server

- **Profile: basics only.** Name, programme, joining date, and whether enrollment has
  ended. Not Aadhaar, address, medical notes or the other parent's details.
- **Attendance** month by month (status only, not which staff member marked it).
- **School calendar** and **weekly menu** (only menus an admin has approved; ones saved before approval existed still show).

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
- Emails grant no portal access, for parents or students. There is no student login.
- The iOS app is staff-only. The web login page is staff-only too (email or Google).

## Sign-in

Only Arattai custom tokens (`via=arattai` with `portalPhone`, minted by
`startArattaiMiniApp`) are accepted by `getParentPortal` and `getParentAttendance`. Phone-code
sessions get permission-denied. If Arattai shares no phone number, the mini app asks the
parent to reopen it and allow Abhishri Academy to see their number.
