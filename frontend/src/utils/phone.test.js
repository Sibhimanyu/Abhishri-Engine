import { describe, it, expect } from 'vitest';
import { normalizePhone, phonesIn, portalPhonesFor, hasPortalAccess } from '../../../functions/src/shared/phone.mjs';

/**
 * Parents sign in with an SMS code and Firebase reports their number as E.164; the
 * record holds whatever staff typed. If these disagree, a parent whose number is on
 * file is told it isn't registered.
 */
describe('normalizePhone', () => {
  it('reads the ways Indian mobiles get typed', () => {
    for (const raw of ['9876543210', '98765 43210', '098765-43210', '+91 98765 43210', '919876543210', '0091 9876543210', '(+91) 98765-43210']) {
      expect(normalizePhone(raw), raw).toBe('+919876543210');
    }
  });

  it('rejects numbers that cannot receive a code', () => {
    for (const raw of ['', null, undefined, 'N/A', '12345', '044 2345 6789', '5876543210', '98765432100']) {
      expect(normalizePhone(raw), String(raw)).toBeNull();
    }
  });

  it('keeps a foreign number when it is written with its country code', () => {
    expect(normalizePhone('+1 (415) 555-0100')).toBe('+14155550100');
    expect(normalizePhone('+971 50 123 4567')).toBe('+971501234567');
  });
});

describe('phonesIn', () => {
  it('finds each number in a field holding two', () => {
    expect(phonesIn('98765 43210 / 91234 56789')).toEqual(['+919876543210', '+919123456789']);
    expect(phonesIn('9876543210, 9876543210')).toEqual(['+919876543210']);
    expect(phonesIn('9876543210 or 9123456789')).toEqual(['+919876543210', '+919123456789']);
  });
});

describe('portalPhonesFor', () => {
  const student = { fatherPhone: '98765 43210', motherPhone: '+91 91234 56789' };

  it('allows both parents when access was never changed', () => {
    expect(portalPhonesFor(student)).toEqual(['+919123456789', '+919876543210']);
    expect(hasPortalAccess(student, 'father')).toBe(true);
  });

  it('drops a parent whose access an admin removed, and only that parent', () => {
    expect(portalPhonesFor({ ...student, portalAccess: { father: false } })).toEqual(['+919123456789']);
    expect(portalPhonesFor({ ...student, portalAccess: { father: false, mother: false } })).toEqual([]);
  });

  it('keeps a shared number when only one of the two parents holding it is removed', () => {
    expect(portalPhonesFor({ fatherPhone: '9876543210', motherPhone: '9876543210', portalAccess: { mother: false } }))
      .toEqual(['+919876543210']);
  });

  it('ignores missing and unusable numbers', () => {
    expect(portalPhonesFor({ fatherPhone: '', motherPhone: 'N/A' })).toEqual([]);
    expect(portalPhonesFor(null)).toEqual([]);
  });
});
