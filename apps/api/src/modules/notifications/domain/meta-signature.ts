import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Authenticates a webhook body.
 *
 * Meta signs the exact bytes it sent with HMAC-SHA256 keyed on the app secret,
 * and hands the digest in X-Hub-Signature-256. Verifying that signature is the
 * only thing standing between this endpoint and anyone who learns the URL:
 * without it, a forged POST can mark a message as delivered when it never
 * arrived, which is the precise failure this feature exists to remove.
 */

const PREFIX = 'sha256=';

/**
 * The signature is computed over the bytes on the wire, not over a re-encoded
 * object. Re-serializing normalizes whitespace and unicode escapes, and the
 * digest stops matching — which is a confusing way to fail, so the caller has
 * to hand us the raw body instead of the parsed one.
 */
export function verifyMetaSignature(
  rawBody: Buffer,
  signatureHeader: string | string[] | undefined,
  appSecret: string,
): boolean {
  const header = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (!header || !header.startsWith(PREFIX)) return false;

  const received = header.slice(PREFIX.length);
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;

  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');

  // timingSafeEqual throws on a length mismatch, and the length is not secret.
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(received, 'hex');
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

/**
 * Meta's one-time subscription handshake: we echo the challenge only when the
 * token matches the one we chose, which stops anyone from pointing their app at
 * this URL and claiming it as theirs.
 */
export function verifySubscription(
  mode: unknown,
  verifyToken: unknown,
  token: unknown,
  challenge: unknown,
): string | null {
  if (mode !== 'subscribe' || verifyToken !== token) return null;
  if (typeof challenge !== 'string' || challenge.length === 0) return null;
  return challenge;
}