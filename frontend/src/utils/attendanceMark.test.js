import { describe, it, expect } from 'vitest';
import { tapAction, cleanNote, NOTE_MAX } from './attendanceMark';

describe('tapAction', () => {
  it('clears a status tapped a second time', () => {
    expect(tapAction('present', 'present')).toBe('clear');
    expect(tapAction('absent', 'absent')).toBe('clear');
    expect(tapAction('late', 'late')).toBe('clear');
  });

  it('saves Present straight away', () => {
    expect(tapAction('none', 'present')).toBe('save');
    expect(tapAction('absent', 'present')).toBe('save');
  });

  it('asks for a note before Absent or Late', () => {
    expect(tapAction('none', 'absent')).toBe('note');
    expect(tapAction('present', 'late')).toBe('note');
    expect(tapAction('absent', 'late')).toBe('note');
  });
});

describe('cleanNote', () => {
  it('treats blank notes as missing', () => {
    expect(cleanNote('   ')).toBe('');
    expect(cleanNote(undefined)).toBe('');
  });

  it('trims and caps the length', () => {
    expect(cleanNote('  Fever  ')).toBe('Fever');
    expect(cleanNote('x'.repeat(NOTE_MAX + 50))).toHaveLength(NOTE_MAX);
  });
});
