import { describe, it, expect } from 'vitest';
import { parseReportText, parsePlainReport } from './reportImport';

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
    expect(() => parseReportText('   ')).toThrow(/No highlights/);
    expect(() => parseReportText('{ "highlights": [] }')).toThrow(/No highlights/);
    expect(() => parseReportText('```json\n{ "highlights": [ }\n```')).toThrow(/valid JSON/);
  });
});

describe('parseReportText with staff\'s own text', () => {
  it('reads one activity per block, with an at-home part', () => {
    const res = parseReportText(`Daily Report
Date: 05/10/2026

Circle Time
We talked about the rainy season and sang a song.
At home: Ask your child to name three things that need rain.

Art: We made paper boats.
Home - Float the boat in a bucket of water.

- Free play in the garden`);
    expect(res.date).toBe('2026-10-05');
    expect(res.highlights).toEqual([
      { activity: 'Circle Time', classroom: 'We talked about the rainy season and sang a song.', home: 'Ask your child to name three things that need rain.' },
      { activity: 'Art', classroom: 'We made paper boats.', home: 'Float the boat in a bucket of water.' },
      { activity: '', classroom: 'Free play in the garden', home: '' },
    ]);
  });

  it('joins wrapped lines and accepts labelled classroom text', () => {
    const res = parsePlainReport(`Story Time:
In the classroom: We read
The Very Hungry Caterpillar.
Try at home:
Count fruits together.`);
    expect(res.highlights).toEqual([
      { activity: 'Story Time', classroom: 'We read The Very Hungry Caterpillar.', home: 'Count fruits together.' },
    ]);
    expect(res.date).toBe('');
  });

  it('keeps a single sentence as classroom text', () => {
    expect(parseReportText('Circle time was fun').highlights).toEqual([{ activity: '', classroom: 'Circle time was fun', home: '' }]);
  });
});
