import { describe, it, expect } from 'vitest';
import { tamilCalendarFor, TAMIL_YEARS_TA } from './tamilCalendar';

describe('tamilCalendarFor', () => {
  it('matches the printed panchangam for 28 Sep 2026', () => {
    expect(tamilCalendarFor('2026-09-28')).toEqual({
      day: 28,
      monthYear: 'SEPTEMBER 2026',
      weekday: 'MONDAY',
      weekdayTa: 'திங்கள்',
      tamilMonth: 'புரட்டாசி',
      tamilDate: 12,
      yearName: 'பராபவ',
      tithi: 'துவிதியை',
      paksha: 'தேய்பிறை',
      tithiEnds: 'இரவு 7.14 வரை',
    });
  });

  it('starts the Tamil year on 14 April 2026 (Chithirai 1, Parabhava)', () => {
    const newYear = tamilCalendarFor('2026-04-14');
    expect([newYear.tamilMonth, newYear.tamilDate, newYear.yearName]).toEqual(['சித்திரை', 1, 'பராபவ']);
    const eve = tamilCalendarFor('2026-04-13');
    expect([eve.tamilMonth, eve.yearName]).toEqual(['பங்குனி', 'விசுவாவசு']);
  });

  it('keeps January in the previous Tamil year', () => {
    expect(tamilCalendarFor('2026-01-05').yearName).toBe('விசுவாவசு');
    expect(tamilCalendarFor('2025-12-20').yearName).toBe('விசுவாவசு');
  });

  it('counts Purattasi from the 17 Sep 2026 sankranti', () => {
    expect(tamilCalendarFor('2026-09-17').tamilDate).toBe(1);
    expect(tamilCalendarFor('2026-09-16').tamilMonth).toBe('ஆவணி');
  });

  it('has the full 60-year cycle', () => {
    expect(TAMIL_YEARS_TA).toHaveLength(60);
    expect(new Set(TAMIL_YEARS_TA).size).toBe(60);
  });

  it('names the full moon and new moon', () => {
    const days = Array.from({ length: 31 }, (_, i) => tamilCalendarFor(`2026-10-${String(i + 1).padStart(2, '0')}`).tithi);
    expect(days).toContain('அமாவாசை');
    expect(days).toContain('பௌர்ணமி');
  });
});
