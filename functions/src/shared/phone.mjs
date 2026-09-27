/**
 * Which phone numbers may sign in to the parent portal for a student.
 *
 * Consumed by BOTH sides of the system (same reasoning as feeTx.mjs, which see):
 *   - backend:  functions/src/students/portal.js keeps students/{id}.portalPhones in
 *     step with the record, and answers the portal's reads for a signed-in number
 *   - frontend: the student profile shows admins which numbers currently have access
 *
 * Parents sign in with an SMS code, and Firebase reports the number as E.164
 * (+919876543210). Records hold whatever staff typed: "98765 43210", "098765-43210",
 * "+91 98765 43210", occasionally two numbers in one field. Everything is compared
 * in E.164 so the same phone always means the same parent.
 */

export const PARENT_ROLES = ['father', 'mother'];

/** One typed number as E.164, or null if it isn't a usable mobile number. */
export function normalizePhone(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  let digits = s.replace(/\D/g, '');
  const international = s.startsWith('+') || digits.startsWith('00');
  if (digits.startsWith('00')) digits = digits.slice(2);

  if (!international || digits.startsWith('91')) {
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    // Indian mobile numbers are 10 digits starting 6-9; landlines can't receive the code.
    return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
  }
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

/** Every usable number in a field that may hold more than one ("98765 43210 / 91234 56789"). */
export function phonesIn(raw) {
  const parts = String(raw ?? '').split(/[,/;|&]|\bor\b/i);
  return [...new Set(parts.map(normalizePhone).filter(Boolean))];
}

/**
 * An admin can take a parent's access away without deleting their number from the
 * record: portalAccess.father === false. Missing means allowed, so every student
 * that existed before the portal gets access for both parents.
 */
export function hasPortalAccess(student, role) {
  return student?.portalAccess?.[role] !== false;
}

/** The numbers allowed to sign in for this student, sorted so the stored array is stable. */
export function portalPhonesFor(student) {
  const phones = PARENT_ROLES
    .filter(role => hasPortalAccess(student, role))
    .flatMap(role => phonesIn(student?.[`${role}Phone`]));
  return [...new Set(phones)].sort();
}
