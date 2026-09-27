// The Tamil solar month and day, as stored on students and staff (tamilMonth / tamilDay)
// and matched for "Tamil birthday today". Shared so the web app's bell and the morning
// Cliq digest agree on whose birthday it is. Each side computes the Sun's tropical
// longitude with astronomy-engine and passes it in.

export const TAMIL_MONTHS = [
  'Chithirai', 'Vaikasi', 'Aani', 'Aadi', 'Aavani', 'Purattasi',
  'Aippasi', 'Karthigai', 'Margazhi', 'Thai', 'Maasi', 'Panguni',
];

/** Approximate Lahiri ayanamsa for a date. */
export const ayanamsaFor = (date) => 24.1 + (date.getUTCFullYear() + date.getUTCMonth() / 12.0 - 2000) * 0.0139694;

/** { tamilMonth, tamilDay } from the Sun's tropical ecliptic longitude on `date`. */
export function tamilSolarDate(sunTropicalLon, date) {
  const sidereal = (sunTropicalLon - ayanamsaFor(date) + 360) % 360;
  // The Sun moves about 0.9856 degrees a day; day 1 is the day it enters the sign.
  const tamilDay = Math.floor((sidereal % 30) / 0.98564) + 1;
  return { tamilMonth: TAMIL_MONTHS[Math.floor(sidereal / 30)], tamilDay: tamilDay.toString() };
}
