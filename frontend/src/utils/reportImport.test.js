import { describe, it, expect } from 'vitest';
import { parseReportText } from './reportImport';

describe('parseReportText', () => {
  it('parses a fenced reply with chat text around it', () => {
    const reply = `Here you go:\n\`\`\`json\n${JSON.stringify({
      date: '2026-09-28',
      highlights: [
        { activity: 'Circle Time', classroom: 'We talked about “My Family”.', home: 'Look at a family photo together.' },
        { activity: 'Story Time', classroom: '“The Thirsty Crow”.', home: '' },
      ],
    }, null, 2)}\n\`\`\``;
    expect(parseReportText(reply)).toEqual({
      date: '2026-09-28',
      highlights: [
        { activity: 'Circle Time', classroom: 'We talked about “My Family”.', home: 'Look at a family photo together.' },
        { activity: 'Story Time', classroom: '“The Thirsty Crow”.', home: '' },
      ],
    });
  });

  it('accepts loose keys and plain-string highlights', () => {
    const res = parseReportText(JSON.stringify({
      activities: [
        { Title: 'Phonics', 'In the classroom': 'Sound /m/.', 'At home': 'Play I spy.' },
        'Art — Leaf printing with paint.',
        'Numbers: Counting 1 to 5.',
      ],
    }));
    expect(res.highlights).toEqual([
      { activity: 'Phonics', classroom: 'Sound /m/.', home: 'Play I spy.' },
      { activity: 'Art', classroom: 'Leaf printing with paint.', home: '' },
      { activity: 'Numbers', classroom: 'Counting 1 to 5.', home: '' },
    ]);
    expect(res.date).toBe('');
  });

  it('ignores an invalid date and blank entries', () => {
    const res = parseReportText(JSON.stringify({ date: '2026-02-30', highlights: [{ activity: '', classroom: '', home: '' }, { activity: 'Art', classroom: 'Paint' }] }));
    expect(res.date).toBe('');
    expect(res.highlights).toHaveLength(1);
  });

  it('throws when nothing usable is pasted', () => {
    expect(() => parseReportText('Circle time was fun')).toThrow(/No report found/);
    expect(() => parseReportText('{ "highlights": [] }')).toThrow(/No highlights/);
  });
});
