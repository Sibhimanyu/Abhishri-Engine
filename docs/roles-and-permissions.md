# Roles and permissions

Who can do what in the staff app, and where that is decided. Live values are in
Firestore `permission_groups/{role}`; this file records them as of 2026-11-23. When you
change a role, update this file in the same PR.

## How access is resolved

1. **Access record:** `allowed_users/{email}` (a few older ones are keyed by UID) holds
   `role`, `isAdmin` and optionally `permissions` (a per-person override). Without a
   record the person sees "Access Unauthorized".
2. **Admin:** `isAdmin: true` or `role: 'admin'` can do everything, with no permission checks.
3. **Role group:** otherwise permissions come from `permission_groups/{role}.permissions`.
   In `firestore.rules`, `permFor()` grants an action if the per-person override **or** the
   group says `true`. A key that is missing from a group counts as `false`.
4. **Fallback:** if a role has no group document, built-in defaults apply. These defaults
   exist in four places that must stay in sync:
   - `frontend/src/context/AuthContext.jsx` `defaultPermissions()`
   - `firestore.rules` `defaultPerm()`
   - `functions/src/shared/access.js` `FALLBACK`
   - `functions/src/auth/permissionsMirror.js` `MODULE_ACTIONS` and `fallbackPerms()`

   When adding a permission key, add it to all four, or the mirror drops it.
5. **Roles the app lets in:** `admin`, `staff`, `teacher` and `pro` (the `authorizedRoles`
   list in `frontend/src/App.jsx`). There is a `coordinator` group, but that role is
   **not** in the list, so a coordinator account would be turned away.
6. **Editing roles:** there is no screen for it. `AdminUserPermissions.jsx` only sets a
   person's role and Super Admin flag, and shows a summary. Change
   `permission_groups/{role}` in Firestore (console or a script). The
   `onPermissionGroupWrite` function then mirrors the change.
7. **Parents** are not staff roles. They sign in only through the Arattai mini app
   (see `parent-portal.md`).

## Roles in plain words

| Role | Who it is for | In short |
|---|---|---|
| **admin** | School owners and managers | Everything, including permanently deleting payments, un-voiding, fee plans and settings. |
| **pro** | Front office | Students, staff and attendance (can edit), Smart Campus control. Fees: **log monthly payments and void them only**. No totals, dashboard, reports, All Transactions, discounts or Configure Payment. Own expenses and wallet. |
| **teacher** | Teachers, including the shared `staff@` classroom login | Student directory (view) and marking student attendance. No Staff Directory, staff attendance or Accounting. |
| **staff** | Other staff | View the staff and student directories and attendance. Own expenses and wallet. |
| **coordinator** | (unused; see "Roles the app lets in" above) | Directories and attendance (manage), fee dashboard, ledger and reports (view), WhatsApp send and broadcast. |

## Permission keys

| Module | Key | Allows |
|---|---|---|
| staff_directory | view / manage / delete | See, edit, delete staff records |
| student_directory | view / manage / delete | See, edit, delete students (`view` also exposes `students.financialSummary`, a student's own fee totals) |
| attendance | view / mark / edit | See, mark, change past attendance |
| fees_accounting | view | Fee screens with totals; reads all transactions |
| | view_dashboard | Fee dashboard and collection totals; collection-group reads |
| | ledger | Full ledger and fee collection lists with totals |
| | config | Fee plans, Configure Payment, discounts |
| | trans_add | Log payments. On its own it opens Fee Collection in **entry-only mode**: one student's ledger at a time, no totals |
| | trans_void | Void a payment (marks it voided and adds a reversal row in the same batch). Un-void is admin-only |
| | trans_delete | Edit (update) `collections` receipts; also used for staff wallet entries. Does **not** allow deleting transactions; only admins can |
| | exp_own / exp_all | Own expenses / everyone's expenses |
| | wallet_view_own / wallet_edit_own | Own staff wallet |
| | salaries_view / salaries_process | Salaries (in some groups only) |
| whatsapp_sender | access / broadcast / manage | WhatsApp sending |
| arattai_sender | access / broadcast / manage | Arattai sending. No group sets these, so they are false for everyone except admins |
| smart_campus | view / control / scenes / config | Smart Campus devices |

## Live values (`permission_groups`, 2026-11-23)

✓ means true; anything not listed is false.

| Key | pro | teacher | staff | coordinator |
|---|---|---|---|---|
| staff_directory | view, manage | — | view | view, manage |
| student_directory | view, manage | view | view | view, manage |
| attendance | view, mark, edit | view, mark | view | view, mark, edit |
| fees_accounting | trans_add, trans_void, exp_own, wallet_view_own | — | exp_own, wallet_view_own | view, view_dashboard, ledger, exp_own, wallet_view_own |
| whatsapp_sender | — | — | — | access, broadcast |
| smart_campus | view, control | — | — | view |

## Enforcement notes

- **Payments are an append-only ledger.** A posted transaction can only have `isVoided`
  flipped. Correcting one means void plus a new entry. Delete is admin-only in the rules.
- **Fee entry only (`trans_add` without view/ledger/view_dashboard):** the rules let it read
  `students/{id}/transactions` and `students/{id}/fee_ledger` one student at a time. The
  `{path=**}/transactions` collection-group rule (dashboards, totals, reports) does not
  include it. The screens use `frontend/src/utils/feeAccess.js` to decide what to show.
- **Known gap:** `students.financialSummary` (paid, annual fee, remaining) is readable by
  anyone with `student_directory.view`. The screens hide it from fee-entry-only roles;
  the database does not.
- **iOS app:** `Permissions.swift` has its own defaults. Its Fees tab needs `ledger` or
  `view`, so PRO doesn't see it, and it has no void button.
- **Rules and list queries:** a rule that calls a function on a document field (for
  example `field.lower() == authEmail()`) can't be proven for a `where(field == x)`
  query, so the whole list is denied. Compare the field directly as well.

## History

- 2026-09-28: email-only staff sign-in. Teachers limited to students and student attendance.
- 2026-11-23: PRO gets fee entry: log and void only (Heresay r_SAWW2dXt-Ua3idNB, PR #96).
  New key `trans_void`.
