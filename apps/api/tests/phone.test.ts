import { describe, expect, it } from 'vitest';
import { formatPhoneForDisplay, normalizePhone } from '../src/shared/phone.js';

describe('normalizePhone', () => {
  it('accepts the shapes people actually type', () => {
    const expected = '+5491144445555';

    expect(normalizePhone('+5491144445555')).toBe(expected);
    expect(normalizePhone('011 4444-5555')).toBe(expected);
    expect(normalizePhone('11 15 4444 5555')).toBe(expected);
    expect(normalizePhone('01115-4444-5555')).toBe(expected);
    expect(normalizePhone('  1144445555  ')).toBe(expected);
  });

  it('keeps an already normalized number untouched', () => {
    expect(normalizePhone('+5491144445555')).toBe('+5491144445555');
  });

  it('respects a non-Argentine number given in full', () => {
    expect(normalizePhone('+34600111222')).toBe('+34600111222');
  });

  it('rejects input with no usable digits', () => {
    expect(() => normalizePhone('no tengo')).toThrow();
    expect(() => normalizePhone('   ')).toThrow();
  });

  it('rejects a number that is too short to be real', () => {
    expect(() => normalizePhone('+5411')).toThrow();
  });
});

describe('formatPhoneForDisplay', () => {
  it('renders an Argentine mobile the way a human reads it', () => {
    expect(formatPhoneForDisplay('+5491144445555')).toBe('+54 9 11 4444-5555');
  });

  it('splits 3- and 4-digit area codes correctly, not just Buenos Aires', () => {
    // Rio Cuarto (358) and a 4-digit code. Getting these wrong is invisible
    // until a patient outside AMBA is loaded.
    expect(formatPhoneForDisplay('+5493584181872')).toBe('+54 9 358 418-1872');
    expect(formatPhoneForDisplay('+5492932401234')).toBe('+54 9 2932 40-1234');
  });

  it('leaves anything it does not recognize alone', () => {
    expect(formatPhoneForDisplay('+34600111222')).toBe('+34600111222');
  });
});
