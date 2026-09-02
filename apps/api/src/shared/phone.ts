import { ValidationError } from './errors.js';

const DEFAULT_COUNTRY_CODE = '54'; // Argentina

/**
 * Normalizes whatever the user typed into E.164.
 *
 * Argentina is the awkward case: WhatsApp requires the mobile prefix `9`
 * after the country code (+549 11 xxxx xxxx) while people write the number
 * with a leading 0 and/or a 15 in the middle (011 15-xxxx-xxxx). Both of
 * those are dropped here, once, at the edge — so the rest of the system only
 * ever sees one shape.
 */
export function normalizePhone(input: string, countryCode = DEFAULT_COUNTRY_CODE): string {
  const raw = input.trim();
  if (raw.length === 0) throw new ValidationError('The WhatsApp number is required');

  const hadPlus = raw.startsWith('+');
  let digits = raw.replace(/\D/g, '');

  if (digits.length === 0) throw new ValidationError('The WhatsApp number has no digits');

  if (!hadPlus) {
    // Local formats: 011 4444-5555, 0111544445555, 11 4444 5555
    if (digits.startsWith('0')) digits = digits.slice(1);
    if (!digits.startsWith(countryCode)) digits = countryCode + digits;
  }

  // Only reshape numbers that actually belong to +54. A number typed with a
  // different country code is already canonical and must be left alone.
  if (countryCode === '54' && digits.startsWith('54')) {
    let rest = digits.slice(2);
    // Drop the "15" mobile marker wherever it sits after the area code.
    rest = rest.replace(/^(\d{2,4})15(\d{6,8})$/, '$1$2');
    // WhatsApp needs the mobile 9 right after the country code.
    if (!rest.startsWith('9')) rest = `9${rest}`;
    digits = countryCode + rest;
  }

  if (digits.length < 10 || digits.length > 15) {
    throw new ValidationError('The WhatsApp number does not look complete');
  }

  return `+${digits}`;
}

/**
 * Argentine area codes are 2, 3 or 4 digits, and together with the subscriber
 * number they always add up to 10. Buenos Aires (11) is the only 2-digit one;
 * the list below holds the 3-digit codes, and everything else is 4.
 *
 * Display only — the stored value is always E.164.
 */
const AREA_CODE_3 = new Set([
  '220', '221', '223', '230', '236', '237', '249', '260', '261', '263', '264', '266',
  '280', '291', '297', '299', '341', '342', '343', '345', '348', '351', '353', '358',
  '362', '364', '370', '376', '379', '380', '381', '383', '385', '387', '388',
]);

function areaCodeLength(local: string): number {
  if (local.startsWith('11')) return 2;
  if (AREA_CODE_3.has(local.slice(0, 3))) return 3;
  return 4;
}

/** Human-friendly rendering for the agenda and patient list. */
export function formatPhoneForDisplay(e164: string): string {
  if (!e164.startsWith('+549')) return e164;

  const local = e164.slice(4);
  if (local.length !== 10) return e164;

  const area = local.slice(0, areaCodeLength(local));
  const subscriber = local.slice(area.length);

  return `+54 9 ${area} ${subscriber.slice(0, -4)}-${subscriber.slice(-4)}`;
}
