import { describe, it, expect } from 'vitest';
import { parseMenuText, MENU_DAYS } from './menuImport';

const fullMenu = () => ({
  weekLabel: 'Week of 11 Aug 2026',
  days: Object.fromEntries(MENU_DAYS.map(d => [d, {
    morningDrink: [{ name: `${d} drink`, translation: '' }],
    lunch: [{ name: 'Rice', translation: 'சாதம்' }, { name: 'Sambar', translation: '' }],
    eveningSnack: [{ name: 'Sundal', translation: '' }],
  }])),
});

describe('parseMenuText', () => {
  it('parses a fenced reply with chat text around it', () => {
    const text = `Here's your menu:\n\n\`\`\`json\n${JSON.stringify(fullMenu(), null, 2)}\n\`\`\`\nLet me know if you need changes.`;
    const res = parseMenuText(text);
    expect(res.weekLabel).toBe('Week of 11 Aug 2026');
    expect(res.warnings).toEqual([]);
    expect(res.days.monday.lunch).toEqual([{ name: 'Rice', translation: 'சாதம்' }, { name: 'Sambar', translation: '' }]);
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
    expect(res.days.monday.morningDrink).toEqual([{ name: 'Ragi malt', translation: '' }]);
    expect(res.days.monday.lunch.map(i => i.name)).toEqual(['Idli', 'Chutney']);
    expect(res.days.tuesday.lunch).toEqual([{ name: 'Pongal', translation: '' }]);
    expect(res.warnings).toContain('Wednesday is missing.');
  });

  it('repairs smart quotes and trailing commas', () => {
    const text = '{ “days”: { “monday”: { “lunch”: [{ “name”: “Rice”, “translation”: “” },], }, }, }';
    const res = parseMenuText(text);
    expect(res.days.monday.lunch).toEqual([{ name: 'Rice', translation: '' }]);
    expect(res.warnings).toContain('Monday: Morning Drink is missing.');
  });

  it('drops blank items', () => {
    const menu = fullMenu();
    menu.days.monday.lunch.push({ name: '', translation: '' });
    expect(parseMenuText(JSON.stringify(menu)).days.monday.lunch).toHaveLength(2);
  });

  it('throws on text with no JSON or no items', () => {
    expect(() => parseMenuText('Monday: idli')).toThrow(/No menu found/);
    expect(() => parseMenuText('{ "days": {} }')).toThrow(/No menu items/);
    expect(() => parseMenuText('{ "days": { monday: } }')).toThrow(/valid JSON/);
  });
});
