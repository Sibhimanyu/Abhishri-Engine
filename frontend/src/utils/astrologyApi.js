import axios from 'axios';
import { AstroTime, Observer, Body, Equator, Ecliptic } from 'astronomy-engine';

export const TAMIL_NATCHATRAMS = [
  'Aswini', 'Bharani', 'Karthigai', 'Rohini', 'Mirugasiridam', 'Thiruvathirai',
  'Punarpoosam', 'Poosam', 'Ayilyam', 'Magam', 'Pooram', 'Uthiram',
  'Hastham', 'Chithirai', 'Swathi', 'Visakam', 'Anusham', 'Kettai',
  'Moolam', 'Pooradam', 'Uthiradam', 'Thiruvonam', 'Avittam', 'Sadayam',
  'Poorattadhi', 'Uthirattadhi', 'Revathi'
];

export const TAMIL_MONTHS = [
  'Chithirai', 'Vaikasi', 'Aani', 'Aadi', 'Aavani', 'Purattasi',
  'Aippasi', 'Karthigai', 'Margazhi', 'Thai', 'Maasi', 'Panguni'
];

export async function calculateNakshatra(dob, time, city) {
  try {
    let lat = 0;
    let lon = 0;

    // Fetch accurate Latitude and Longitude for the birth city
    if (city) {
      try {
        const response = await axios.get('https://nominatim.openstreetmap.org/search', {
          params: { q: city, format: 'json', limit: 1 },
          headers: { 'User-Agent': 'AbhishriEngine/1.0 (student-admission)' }
        });
        if (response.data && response.data.length > 0) {
          lat = parseFloat(response.data[0].lat);
          lon = parseFloat(response.data[0].lon);
        } else {
          console.warn(`Could not find coordinates for city: ${city}, defaulting to geocentric.`);
        }
      } catch (geoError) {
        console.error('Error fetching city coordinates:', geoError);
      }
    }

    // Parse date (YYYY-MM-DD) and time (HH:MM)
    const [year, month, day] = dob.split('-').map(Number);
    const [hour, minute] = time.split(':').map(Number);
    
    // Construct Date using the browser's local timezone
    // (This assumes the entered time matches the device's timezone)
    const dateObj = new Date(year, month - 1, day, hour, minute);
    
    const astroTime = new AstroTime(dateObj);
    // Use topocentric coordinates (precise location on Earth) instead of geocentric
    const observer = new Observer(lat, lon, 0); 
    
    // --- Moon Calculation (for Nakshatra) ---
    const moonEq = Equator(Body.Moon, astroTime, observer, true, true);
    const moonEcl = Ecliptic(moonEq.vec);
    const moonTropicalLon = moonEcl.elon;

    // Calculate approximate Lahiri Ayanamsa
    const yearDecimal = dateObj.getUTCFullYear() + dateObj.getUTCMonth() / 12.0;
    const ayanamsa = 24.1 + (yearDecimal - 2000) * 0.0139694;
    
    const moonSiderealLon = (moonTropicalLon - ayanamsa + 360) % 360;
    const nakshatraIndex = Math.floor(moonSiderealLon / (360 / 27));
    const nakshatra = TAMIL_NATCHATRAMS[nakshatraIndex];

    // --- Sun Calculation (for Tamil Solar Date) ---
    const sunEq = Equator(Body.Sun, astroTime, observer, true, true);
    const sunEcl = Ecliptic(sunEq.vec);
    const sunTropicalLon = sunEcl.elon;
    
    const sunSiderealLon = (sunTropicalLon - ayanamsa + 360) % 360;
    const monthIndex = Math.floor(sunSiderealLon / 30);
    const degreesPassed = sunSiderealLon % 30;
    
    // Sun moves ~0.9856 degrees per day. Add 1 for the current day.
    const approxDay = Math.floor(degreesPassed / 0.98564) + 1;
    const tamilMonth = TAMIL_MONTHS[monthIndex];

    return { nakshatra, tamilMonth, tamilDay: approxDay.toString() };
  } catch (error) {
    console.error('Error calculating Nakshatra and Tamil Date:', error);
    return { nakshatra: null, tamilMonth: null, tamilDay: null };
  }
}

export function getCurrentTamilDate() {
  try {
    const dateObj = new Date();
    const astroTime = new AstroTime(dateObj);
    // Use an approximate observer for India (Chennai) for current date calculation
    const observer = new Observer(13.0827, 80.2707, 0);
    
    // Calculate approximate Lahiri Ayanamsa
    const yearDecimal = dateObj.getUTCFullYear() + dateObj.getUTCMonth() / 12.0;
    const ayanamsa = 24.1 + (yearDecimal - 2000) * 0.0139694;

    const sunEq = Equator(Body.Sun, astroTime, observer, true, true);
    const sunEcl = Ecliptic(sunEq.vec);
    const sunTropicalLon = sunEcl.elon;
    
    const sunSiderealLon = (sunTropicalLon - ayanamsa + 360) % 360;
    const monthIndex = Math.floor(sunSiderealLon / 30);
    const degreesPassed = sunSiderealLon % 30;
    
    // Sun moves ~0.9856 degrees per day. Add 1 for the current day.
    const approxDay = Math.floor(degreesPassed / 0.98564) + 1;
    
    return {
      tamilMonth: TAMIL_MONTHS[monthIndex],
      tamilDay: approxDay.toString()
    };
  } catch (error) {
    console.error('Error getting current Tamil date:', error);
    return null;
  }
}
