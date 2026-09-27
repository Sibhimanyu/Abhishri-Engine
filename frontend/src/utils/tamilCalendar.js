// Tamil calendar details for a school day: Tamil month and date, weekday, the
// 60-year cycle name, and the thithi at sunrise with when it ends. Computed with
// astronomy-engine for Chennai in IST, independent of the device's timezone.
// Checked against printed panchangams (e.g. 28 Sep 2026: புரட்டாசி 12,
// தேய்பிறை துவிதியை until 7.14 pm); the daily report still lets staff override it.
import { MoonPhase, SearchMoonPhase, SearchSunLongitude, SearchRiseSet, SunPosition, Observer, Body } from 'astronomy-engine';

const CHENNAI = new Observer(13.0827, 80.2707, 0);
const IST_MS = 5.5 * 3600e3;
const DAY_MS = 86400e3;

// Indexed by the sun's sidereal sign: Mesha (0) is Chithirai.
export const TAMIL_MONTHS_TA = ['சித்திரை', 'வைகாசி', 'ஆனி', 'ஆடி', 'ஆவணி', 'புரட்டாசி', 'ஐப்பசி', 'கார்த்திகை', 'மார்கழி', 'தை', 'மாசி', 'பங்குனி'];
export const WEEKDAYS_TA = ['ஞாயிறு', 'திங்கள்', 'செவ்வாய்', 'புதன்', 'வியாழன்', 'வெள்ளி', 'சனி'];
const WEEKDAYS_EN = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTHS_EN = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

// The 60-year cycle; the Tamil year starting in April 1987 was பிரபவ (index 0).
export const TAMIL_YEARS_TA = [
  'பிரபவ', 'விபவ', 'சுக்ல', 'பிரமோதூத', 'பிரசோற்பத்தி', 'ஆங்கீரச', 'ஸ்ரீமுக', 'பவ', 'யுவ', 'தாது',
  'ஈஸ்வர', 'வெகுதானிய', 'பிரமாதி', 'விக்கிரம', 'விஷு', 'சித்திரபானு', 'சுபானு', 'தாரண', 'பார்த்திப', 'விய',
  'சர்வசித்து', 'சர்வதாரி', 'விரோதி', 'விக்ருதி', 'கர', 'நந்தன', 'விஜய', 'ஜய', 'மன்மத', 'துன்முகி',
  'ஹேவிளம்பி', 'விளம்பி', 'விகாரி', 'சார்வரி', 'பிலவ', 'சுபகிருது', 'சோபகிருது', 'குரோதி', 'விசுவாவசு', 'பராபவ',
  'பிலவங்க', 'கீலக', 'சௌமிய', 'சாதாரண', 'விரோதகிருது', 'பரிதாபி', 'பிரமாதீச', 'ஆனந்த', 'ராட்சச', 'நள',
  'பிங்கள', 'காளயுக்தி', 'சித்தார்த்தி', 'ரௌத்திரி', 'துன்மதி', 'துந்துபி', 'ருத்ரோத்காரி', 'ரக்தாட்சி', 'குரோதன', 'அட்சய',
];

// Thithis 1–14 of either fortnight; the 15th is பௌர்ணமி (full moon) or அமாவாசை (new moon).
const TITHIS_TA = ['பிரதமை', 'துவிதியை', 'திருதியை', 'சதுர்த்தி', 'பஞ்சமி', 'சஷ்டி', 'சப்தமி', 'அஷ்டமி', 'நவமி', 'தசமி', 'ஏகாதசி', 'துவாதசி', 'திரயோதசி', 'சதுர்த்தசி'];

// Lahiri ayanamsa, linear from its J2000 value; well under a minute of arc off over this century.
const ayanamsa = (date) => 23.85306 + ((date.getTime() - Date.UTC(2000, 0, 1, 12)) / (365.25 * DAY_MS)) * (50.2388 / 3600);
const siderealSun = (date) => (SunPosition(date).elon - ayanamsa(date) + 360) % 360;

// IST wall-clock parts of an instant.
const istParts = (date) => {
  const d = new Date(date.getTime() + IST_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes() };
};
const istDayNumber = (date) => Math.floor((date.getTime() + IST_MS) / DAY_MS);

const clock = (h, min) => `${h % 12 || 12}.${String(min).padStart(2, '0')}`;
const dayPart = (h) => (h < 12 ? 'காலை' : h < 16 ? 'மதியம்' : h < 19 ? 'மாலை' : 'இரவு');

/**
 * Tamil calendar details for an IST calendar date ('YYYY-MM-DD').
 * Returns { day, monthYear, weekday, weekdayTa, tamilMonth, tamilDate, yearName, tithi, paksha, tithiEnds }.
 */
export function tamilCalendarFor(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const midnight = new Date(Date.UTC(y, m - 1, d) - IST_MS);
  const dayNo = istDayNumber(midnight);
  const sunrise = SearchRiseSet(Body.Sun, CHENNAI, +1, midnight, 1).date;
  const sunset = SearchRiseSet(Body.Sun, CHENNAI, -1, midnight, 1).date;

  // Tamil month: the sign the sun is in at sunset. The month's first day is the day the
  // sun entered it if that happened before sunset, otherwise the day after.
  const sign = Math.floor(siderealSun(sunset) / 30);
  const target = (sign * 30 + ayanamsa(sunset)) % 360;
  const sankranti = SearchSunLongitude(target, new Date(sunset.getTime() - 33 * DAY_MS), 34).date;
  const sankrantiDay = istDayNumber(sankranti);
  const sankrantiSunset = SearchRiseSet(Body.Sun, CHENNAI, -1, new Date(sankrantiDay * DAY_MS - IST_MS), 1).date;
  const firstDay = sankranti < sankrantiSunset ? sankrantiDay : sankrantiDay + 1;
  const tamilDate = dayNo - firstDay + 1;

  // The Tamil year starts with சித்திரை (mid-April); மார்கழி–பங்குனி dates early in the year belong to the previous one.
  const tamilYear = sign >= 8 && m <= 4 ? y - 1 : y;
  const yearName = TAMIL_YEARS_TA[(((tamilYear - 1987) % 60) + 60) % 60];

  // Thithi at sunrise: each is 12° of moon–sun elongation. Waxing for the first 15.
  const index = Math.floor(MoonPhase(sunrise) / 12);
  const waxing = index < 15;
  const n = index % 15;
  const tithi = n === 14 ? (waxing ? 'பௌர்ணமி' : 'அமாவாசை') : TITHIS_TA[n];
  const end = SearchMoonPhase(((index + 1) * 12) % 360, sunrise, 3).date;
  const nextSunrise = SearchRiseSet(Body.Sun, CHENNAI, +1, new Date(sunrise.getTime() + 3600e3), 2).date;
  const e = istParts(end);
  let tithiEnds;
  if (end >= nextSunrise) tithiEnds = 'நாள் முழுவதும்';
  else if (istDayNumber(end) > dayNo) tithiEnds = `நாளை அதிகாலை ${clock(e.h, e.min)} வரை`;
  else tithiEnds = `${dayPart(e.h)} ${clock(e.h, e.min)} வரை`;

  const weekdayIdx = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return {
    day: d,
    monthYear: `${MONTHS_EN[m - 1]} ${y}`,
    weekday: WEEKDAYS_EN[weekdayIdx],
    weekdayTa: WEEKDAYS_TA[weekdayIdx],
    tamilMonth: TAMIL_MONTHS_TA[sign],
    tamilDate,
    yearName,
    tithi,
    paksha: waxing ? 'வளர்பிறை' : 'தேய்பிறை',
    tithiEnds,
  };
}
