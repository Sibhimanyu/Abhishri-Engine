import { describe, it, expect } from 'vitest';
import { parseMenuText, MENU_DAYS } from './menuImport';

const fullMenu = () => ({
  weekLabel: 'Week of 11 Aug 2026',
  days: Object.fromEntries(MENU_DAYS.map(d => [d, {
    morningDrink: [{ name: `${d} drink`, description: '', translation: '' }],
    lunch: [
      { name: 'Radish Sambar', description: '', translation: 'முள்ளங்கி சாம்பார்' },
      { name: 'Keerai Poriyal', description: '', translation: 'கீரை பொரியல்' },
      { name: 'Curd', description: '', translation: 'தயிர்' },
    ],
    eveningSnack: [{ name: 'Sundal', description: 'with coconut', translation: '' }],
  }])),
});

describe('parseMenuText', () => {
  it('parses a fenced reply with chat text around it', () => {
    const text = `Here's your menu:\n\n\`\`\`json\n${JSON.stringify(fullMenu(), null, 2)}\n\`\`\`\nLet me know if you need changes.`;
    const res = parseMenuText(text);
    expect(res.weekLabel).toBe('Week of 11 Aug 2026');
    expect(res.warnings).toEqual([]);
    expect(res.days.monday.lunch.map(i => [i.name, i.translation])).toEqual([
      ['Radish Sambar', 'முள்ளங்கி சாம்பார்'], ['Keerai Poriyal', 'கீரை பொரியல்'], ['Curd', 'தயிர்'],
    ]);
    expect(res.days.monday.eveningSnack).toEqual([{ name: 'Sundal', description: 'with coconut', translation: '' }]);
    expect(res.days.friday.morningDrink[0].name).toBe('friday drink');
  });

  it('accepts loose day and slot keys, string items, and a days array', () => {
    const text = JSON.stringify({
      days: [
        { day: 'Monday', 'Morning Drink': 'Ragi malt', Lunch: ['Idli', 'Chutney'], 'Evening snack': [] },
        { day: 'TUE', morning_drink: [], lunch: [{ item: 'Pongal' }], evening_snack: [] },
      ],
    });
    const res = parseMenuText(text);
    expect(res.days.monday.morningDrink).toEqual([{ name: 'Ragi malt', description: '', translation: '' }]);
    expect(res.days.monday.lunch.map(i => i.name)).toEqual(['Idli', 'Chutney']);
    expect(res.days.tuesday.lunch).toEqual([{ name: 'Pongal', description: '', translation: '' }]);
    expect(res.warnings).toContain('Wednesday is missing.');
  });

  it('repairs smart quotes and trailing commas', () => {
    const text = '{ “days”: { “monday”: { “lunch”: [{ “name”: “Rice”, “description”: “” },], }, }, }';
    const res = parseMenuText(text);
    expect(res.days.monday.lunch).toEqual([{ name: 'Rice', description: '', translation: '' }]);
    expect(res.warnings).toContain('Monday: Morning Drink is missing.');
  });

  it('accepts a "tamil" key for the translation', () => {
    const text = JSON.stringify({ days: { monday: { lunch: [{ name: 'Curd', tamil: 'தயிர்' }] } } });
    expect(parseMenuText(text).days.monday.lunch).toEqual([{ name: 'Curd', description: '', translation: 'தயிர்' }]);
  });

  it('reads holidays from a name, true, or a plain string day', () => {
    const menu = fullMenu();
    menu.days.wednesday = { holiday: 'Gandhi Jayanti', morningDrink: [], lunch: [], eveningSnack: [] };
    menu.days.thursday = { holiday: true };
    menu.days.friday = 'Holiday';
    menu.days.tuesday.holiday = '';
    const res = parseMenuText(JSON.stringify(menu));
    expect(res.days.wednesday).toMatchObject({ holiday: true, holidayNote: 'Gandhi Jayanti' });
    expect(res.days.thursday).toMatchObject({ holiday: true, holidayNote: '' });
    expect(res.days.friday).toMatchObject({ holiday: true, holidayNote: '' });
    expect(res.days.tuesday.holiday).toBe(false);
    expect(res.days.tuesday.lunch).toHaveLength(3);
    expect(res.warnings).toEqual([]);
  });

  it('drops blank items', () => {
    const menu = fullMenu();
    menu.days.monday.lunch.push({ name: '', description: '', translation: '' });
    expect(parseMenuText(JSON.stringify(menu)).days.monday.lunch).toHaveLength(3);
  });

  it('throws on text with no JSON or no items', () => {
    expect(() => parseMenuText('Monday: idli')).toThrow(/No menu found/);
    expect(() => parseMenuText('{ "days": {} }')).toThrow(/No menu items/);
    expect(() => parseMenuText('{ "days": { monday: } }')).toThrow(/valid JSON/);
  });
});
