import { describe, it, expect } from 'vitest';
import { statusInfo, filterTemplates, formFromRow, duplicateForm, variablesOf, rulesInput, insertAt, previewSegments, doubleBraces, newVariableName } from './templateUi';

const row = { id: '1', name: 'fee_reminder_notice', type: 'transaction', language: 'en', status: 'approved', description: 'd', title: 'Fee', body: 'Hi {{name}}, due. Bye', footer: '', placeholders: [{ name: 'name', sample: 'Meena' }] };

describe('templateUi', () => {
  it('maps statuses', () => {
    expect(statusInfo('approved').tone).toBe('green');
    expect(statusInfo('rejected').tone).toBe('red');
    expect(statusInfo('under_review').label).toBe('Under review');
    expect(statusInfo(undefined).label).toBe('Draft');
  });

  it('filters by text, category and status', () => {
    const list = [row, { ...row, id: '2', name: 'other_thing_here', type: 'promotion', status: 'draft', body: 'Sale' }];
    expect(filterTemplates(list, { q: 'sale' }).map((t) => t.id)).toEqual(['2']);
    expect(filterTemplates(list, { category: 'transaction' }).map((t) => t.id)).toEqual(['1']);
    expect(filterTemplates(list, { status: 'draft' }).map((t) => t.id)).toEqual(['2']);
    expect(filterTemplates(list, {})).toHaveLength(2);
  });

  it('builds forms and duplicates', () => {
    const f = formFromRow(row);
    expect(f.samples).toEqual({ name: 'Meena' });
    const d = duplicateForm(row);
    expect(d.id).toBe('');
    expect(d.name).toBe('fee_reminder_notice_copy');
    expect(d.body).toBe(row.body);
  });

  it('lists variables, used first then extra', () => {
    const f = { ...formFromRow(row), extra: ['name', 'spare'] };
    expect(variablesOf(f)).toEqual(['name', 'spare']);
    expect(rulesInput(f).placeholders).toEqual([{ name: 'name', sample: 'Meena' }, { name: 'spare', sample: '' }]);
  });

  it('inserts at the selection', () => {
    expect(insertAt('Hello world', 6, 11, '{{x}}')).toEqual({ value: 'Hello {{x}}', cursor: 11 });
    expect(insertAt('ab', undefined, undefined, 'Z')).toEqual({ value: 'abZ', cursor: 3 });
  });

  it('splits text into highlighted segments', () => {
    expect(previewSegments('Hi {{name}}, ok {{missing}}', { name: 'Meena' })).toEqual([
      { text: 'Hi ' }, { text: 'Meena', variable: 'name' }, { text: ', ok ' }, { text: '{{missing}}', variable: 'missing' },
    ]);
  });

  it('converts staff wording and cleans names', () => {
    expect(doubleBraces('Hi {requester}, {{x}}')).toBe('Hi {{requester}}, {{x}}');
    expect(newVariableName('Student Name')).toBe('student_name');
  });
});
