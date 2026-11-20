import { describe, it, expect } from 'vitest';
import { plainText } from '../../../functions/src/shared/plainMessage.mjs';

describe('plainText', () => {
  it('puts the title first, then the text and any extra links', () => {
    expect(plainText({ title: 'T', text: 'Body', links: [{ label: 'Open', url: 'https://x' }] })).toBe('T\nBody\nOpen: https://x');
    expect(plainText({ title: '', text: 'Body' })).toBe('Body');
  });
});
