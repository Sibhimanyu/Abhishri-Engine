import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyCkhTwa6sG7mCx-RW1E2FWhKqB--yDRUmk",
    authDomain: "abhishri-academy.firebaseapp.com",
    databaseURL: "https://abhishri-academy-default-rtdb.firebaseio.com",
    projectId: "abhishri-academy",
    storageBucket: "abhishri-academy.firebasestorage.app",
    messagingSenderId: "932495146860",
    appId: "1:932495146860:web:d29df524eeff27e874fd49"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = getFirestore(app);

// Path to the downloaded content.md file
const filePath = '/Users/sibhimanyu/.gemini/antigravity-cli/brain/6a38542b-4b82-4ccb-86de-8f84e569cddf/.system_generated/steps/110/content.md';

async function run() {
  try {
    console.log("Reading calendar data...");
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    let currentMonth = null;
    let currentYear = null;

    const monthMap = {
      'JUNE': { m: 5, y: 2026 },
      'JULY': { m: 6, y: 2026 },
      'AUGUST': { m: 7, y: 2026 },
      'SEPTEMBER': { m: 8, y: 2026 },
      'OCTOBER': { m: 9, y: 2026 },
      'NOVEMBER': { m: 10, y: 2026 },
      'DECEMBER': { m: 11, y: 2026 },
      'JANUARY': { m: 0, y: 2027 },
      'FEBRUARY': { m: 1, y: 2027 },
      'MARCH': { m: 2, y: 2027 }
    };

    let parsedDays = [];
    let state = 'idle';

    let currentDayNum = null;
    let currentDayName = null;
    let currentEventLines = [];

    function saveCurrentDay() {
      if (currentDayNum !== null && currentMonth !== null && currentYear !== null) {
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(currentDayNum).padStart(2, '0')}`;
        const eventText = currentEventLines.join(' ').trim();

        parsedDays.push({
          dateStr,
          dayName: currentDayName,
          eventText
        });

        currentDayNum = null;
        currentDayName = null;
        currentEventLines = [];
      }
    }

    for (let line of lines) {
      const cleanLine = line.trim();
      if (!cleanLine) continue;

      const monthHeaderMatch = cleanLine.match(/^(JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JANUARY|FEBRUARY|MARCH)\s+(\d{4})$/i);
      if (monthHeaderMatch) {
        saveCurrentDay();
        const mName = monthHeaderMatch[1].toUpperCase();
        currentMonth = monthMap[mName].m;
        currentYear = monthMap[mName].y;
        state = 'idle';
        continue;
      }

      const dayHeaderMatch = cleanLine.match(/^(June|July|August|September|October|November|December|January|February|March)\s+(\d+)$/i);
      if (dayHeaderMatch) {
        saveCurrentDay();
        currentDayNum = parseInt(dayHeaderMatch[2]);
        state = 'expecting_day_name';
        continue;
      }

      if (state === 'expecting_day_name') {
        const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        if (daysOfWeek.includes(cleanLine.toLowerCase())) {
          currentDayName = cleanLine;
          state = 'expecting_event';
        }
        continue;
      }

      if (state === 'expecting_event') {
        currentEventLines.push(cleanLine);
      }
    }

    saveCurrentDay();

    console.log(`Parsed ${parsedDays.length} total days. Cleaning and filtering...`);

    // Process and enrich days
    const customDays = parsedDays.map(day => {
      let type = 'regular_day';
      let title = '';
      let description = '';

      const text = day.eventText;
      const isWeekend = ['saturday', 'sunday'].includes(day.dayName.toLowerCase());

      if (text) {
        if (text.toLowerCase().includes('holiday')) {
          type = 'holiday';
          title = text
            .replace(/-?\s*holiday\s*\(National\s*Holiday\)?/i, '')
            .replace(/-?\s*holiday/i, '')
            .replace(/^\(/, '')
            .replace(/\)$/, '')
            .trim();
          
          if (!title) {
            title = 'Holiday';
          }
        } else if (text.toLowerCase().includes('exam') || text.toLowerCase().includes('test')) {
          // Ignore examinations completely from the seeded calendar
          type = 'regular_day';
          title = '';
        } else {
          type = 'event';
          title = text;
        }
      } else if (isWeekend) {
        type = 'holiday';
        title = 'Holiday';
      }

      return {
        ...day,
        type,
        title,
        description
      };
    }).filter(day => day.type !== 'regular_day' || day.title);

    console.log(`Filtered down to ${customDays.length} custom calendar days. Logging in to Firebase...`);

    const userCredential = await signInWithEmailAndPassword(auth, "info@abhishriacademy.in", "***REDACTED-ROTATE-THIS-CREDENTIAL***");
    console.log("Logged in as Admin:", userCredential.user.uid);

    console.log("Seeding calendar days into Firestore...");
    let count = 0;
    for (const day of customDays) {
      const docRef = doc(firestore, 'school_calendar', day.dateStr);
      await setDoc(docRef, {
        type: day.type,
        title: day.title,
        description: day.description || '',
        updatedAt: new Date().toISOString(),
        updatedBy: 'System Seed'
      }, { merge: true });
      count++;
    }

    console.log(`Successfully seeded ${count} calendar days!`);
  } catch (err) {
    console.error("Seeding failed:", err);
  }
  process.exit(0);
}

run();
