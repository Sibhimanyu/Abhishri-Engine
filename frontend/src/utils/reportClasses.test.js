import { describe, it, expect } from 'vitest';
import { classSlug, reportId, cleanClasses, compareReports, studentsInClass, NO_CLASS, DEFAULT_CLASSES } from './reportClasses';

describe('reportId', () => {
  it('keeps the plain date for a report with no class', () => {
    expect(reportId('2026-10-05', '')).toBe('2026-10-05');
    expect(reportId('2026-10-05', undefined)).toBe('2026-10-05');
  });

  it('gives each class its own report per date', () => {
    expect(reportId('2026-10-05', 'Little Steps 1')).toBe('2026-10-05--little-steps-1');
    expect(reportId('2026-10-05', 'Little Steps 2')).not.toBe(reportId('2026-10-05', 'Little Steps 1'));
  });

  it('never contains "|", which Cliq button keys use as a separator', () => {
    expect(reportId('2026-10-05', 'A | B')).not.toContain('|');
  });

  it('gives every default class a distinct id', () => {
    expect(new Set(DEFAULT_CLASSES.map(classSlug)).size).toBe(DEFAULT_CLASSES.length);
  });
});

describe('cleanClasses', () => {
  it('drops blanks and repeats, and tidies spacing', () => {
    expect(cleanClasses(['  Wonder  Wings ', '', 'wonder wings', 'Little Steps 1'])).toEqual(['Wonder Wings', 'Little Steps 1']);
  });

  it('copes with a missing list', () => {
    expect(cleanClasses(undefined)).toEqual([]);
  });
});

describe('compareReports', () => {
  it('sorts newest date first, then by class', () => {
    const rows = [
      { date: '2026-10-04', className: 'Wonder Wings' },
      { date: '2026-10-05', className: 'Wonder Wings' },
      { date: '2026-10-05' },
      { date: '2026-10-05', className: 'Happy Explorers 1' },
    ];
    expect(rows.sort(compareReports).map(r => `${r.date} ${r.className || '-'}`)).toEqual([
      '2026-10-05 -',
      '2026-10-05 Happy Explorers 1',
      '2026-10-05 Wonder Wings',
      '2026-10-04 Wonder Wings',
    ]);
  });
});

describe('studentsInClass', () => {
  const classes = ['Little Steps 1', 'Wonder Wings'];
  const students = [
    { id: 'a', reportClass: 'Little Steps 1' },
    { id: 'b', reportClass: 'little steps 1' },
    { id: 'c', reportClass: 'Wonder Wings' },
    { id: 'd' },
    { id: 'e', reportClass: 'Old Class' },
  ];
  const ids = list => list.map(s => s.id);

  it('shows everyone when no class is picked', () => {
    expect(ids(studentsInClass(students, '', classes))).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('shows one class, matching by id', () => {
    expect(ids(studentsInClass(students, 'Little Steps 1', classes))).toEqual(['a', 'b']);
  });

  it('puts students in no class, or a removed one, under "no class"', () => {
    expect(ids(studentsInClass(students, NO_CLASS, classes))).toEqual(['d', 'e']);
  });
});
