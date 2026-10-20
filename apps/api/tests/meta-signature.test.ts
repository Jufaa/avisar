import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  verifyMetaSignature,
  verifySubscription,
} from '../src/modules/notifications/domain/meta-signature.js';

const SECRET = 'app-secret-value';

/** How Meta builds the header, reproduced so the tests sign the same way. */
function sign(rawBody: string, secret = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

describe('verifyMetaSignature', () => {
  const body = Buffer.from('{"object":"whatsapp_business_account"}', 'utf8');

  it('accepts a correctly signed body', () => {
    expect(verifyMetaSignature(body, sign(body.toString()), SECRET)).toBe(true);
  });

  /**
   * The whole point of signing the bytes rather than the parsed object. This
   * body is semantically identical to `body` but not byte-identical, and
   * re-serializing before checking would reject it for looking like broken
   * crypto.
   */
  it('signs the exact bytes, not a re-encoding of the same object', () => {
    const compact = Buffer.from('{"object":"whatsapp_business_account"}');
    const spaced = Buffer.from('{ "object": "whatsapp_business_account" }');

    expect(verifyMetaSignature(compact, sign(compact.toString()), SECRET)).toBe(true);
    expect(verifyMetaSignature(spaced, sign(compact.toString()), SECRET)).toBe(false);
  });

  it('rejects a body signed with a different secret', () => {
    expect(verifyMetaSignature(body, sign(body.toString(), 'someone-elses-secret'), SECRET)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const signature = sign(body.toString());
    const tampered = Buffer.from('{"object":"instagram"}', 'utf8');

    expect(verifyMetaSignature(tampered, signature, SECRET)).toBe(false);
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['without the prefix', 'deadbeef'],
    ['with the wrong algorithm', 'sha1=abc'],
    ['not hexadecimal', `sha256=${'z'.repeat(64)}`],
    ['too short', 'sha256=abcd'],
  ])('rejects a header that is %s', (_label, header) => {
    expect(verifyMetaSignature(body, header, SECRET)).toBe(false);
  });

  /**
   * timingSafeEqual throws when the two buffers differ in length, so a
   * malformed short header has to be turned away before it reaches the
   * comparison — a 500 here would make Meta retry a request forever.
   */
  it('rejects a truncated digest without throwing', () => {
    expect(() => verifyMetaSignature(body, `sha256=${'a'.repeat(63)}`, SECRET)).not.toThrow();
    expect(verifyMetaSignature(body, `sha256=${'a'.repeat(63)}`, SECRET)).toBe(false);
  });

  /** Only the digest is case-insensitive. The `sha256=` prefix is Meta's literal. */
  it('accepts an uppercase digest', () => {
    const signature = sign(body.toString());
    const uppercaseDigest = `sha256=${signature.slice('sha256='.length).toUpperCase()}`;

    expect(verifyMetaSignature(body, uppercaseDigest, SECRET)).toBe(true);
  });

  it('rejects an uppercase algorithm prefix', () => {
    expect(verifyMetaSignature(body, sign(body.toString()).toUpperCase(), SECRET)).toBe(false);
  });
});

describe('verifySubscription', () => {
  const token = 'our-verify-token';
  const query = {
    'hub.mode': 'subscribe',
    'hub.verify_token': token,
    'hub.challenge': 'challenge-value',
  };

  it('echoes the challenge back to a correct subscriber', () => {
    expect(verifySubscription(query['hub.mode'], token, query['hub.verify_token'], query['hub.challenge'])).toBe(
      'challenge-value',
    );
  });

  /**
   * Without this anyone could point their own app at our URL, pass the
   * handshake, and have their number subscribed to our account.
   */
  it('refuses a wrong verify token', () => {
    expect(verifySubscription('subscribe', token, 'guessed', 'challenge-value')).toBeNull();
  });

  it('refuses a missing verify token', () => {
    expect(verifySubscription('subscribe', token, undefined, 'challenge-value')).toBeNull();
  });

  it('refuses a mode other than subscribe', () => {
    expect(verifySubscription('unsubscribe', token, token, 'challenge-value')).toBeNull();
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['not a string', 42],
  ])('refuses a challenge that is %s', (_label, challenge) => {
    expect(verifySubscription('subscribe', token, token, challenge)).toBeNull();
  });
});
