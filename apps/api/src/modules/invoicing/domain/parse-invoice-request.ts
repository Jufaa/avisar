/**
 * Turns a sentence into a filled-in form.
 *
 * "Facturale a Juan Pérez 3 sesiones de kinesiología a 25 mil" becomes a
 * draft with a name, a quantity, a concept and a price — which the person
 * then looks at and corrects. It never issues anything, and it is never
 * trusted: it saves typing, not judgement.
 *
 * Deliberately deterministic rather than a model call. It costs nothing, runs
 * offline, and behaves the same way twice — and it lives behind an endpoint
 * precisely so that swapping in a model later changes nothing in the client.
 */

export interface ParsedInvoiceRequest {
  receiverName: string | null;
  description: string | null;
  quantity: number | null;
  unitPrice: number | null;
  /** Fields the sentence did not carry, so the form can ask for them. */
  missing: Array<'receiverName' | 'description' | 'unitPrice'>;
}

/** Words that mean "multiply by". */
const MULTIPLIERS: Array<[RegExp, number]> = [
  [/\bmillones?\b/i, 1_000_000],
  [/\bmill[oó]n\b/i, 1_000_000],
  [/\bmil\b/i, 1_000],
  [/\blucas?\b/i, 1_000],
  [/\bpalos?\b/i, 1_000_000],
];

/** Units people bill by, used to spot a quantity rather than a price. */
const UNIT_WORDS =
  'sesion(?:es)?|sesión|sesiones|consultas?|clases?|horas?|turnos?|unidades?|unidad|tratamientos?|cortes?';

/**
 * Argentine number formatting: dots group thousands, a comma is the decimal
 * separator. "25.000,50" is twenty-five thousand and fifty cents, not twenty-
 * five point zero.
 */
function toNumber(raw: string): number {
  const cleaned = raw.replace(/\./g, '').replace(',', '.');
  return Number(cleaned);
}

/**
 * Reads the price out of the sentence.
 *
 * A bare "25" next to "sesiones" is a quantity, not a price, so only figures
 * that carry a currency sign, a multiplier word, or a magnitude no one bills
 * a single peso at are taken seriously.
 */
function findPrice(text: string): number | null {
  // `$ 25.000`, `25 mil`, `1,5 millones`, `30000`
  const pattern = /\$?\s*(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)\s*([a-zá-úñ]+)?/gi;

  let best: number | null = null;

  for (const match of text.matchAll(pattern)) {
    const [whole, digits, word = ''] = match;
    if (!digits) continue;

    let value = toNumber(digits);
    if (!Number.isFinite(value)) continue;

    const multiplier = MULTIPLIERS.find(([expression]) => expression.test(word));
    if (multiplier) value *= multiplier[1];

    const hasCurrency = whole.includes('$');
    const grouped = digits.includes('.');
    // A quantity like "3 sesiones" must never be mistaken for a price.
    const isUnitCount = new RegExp(`^(?:${UNIT_WORDS})$`, 'i').test(word);

    if (isUnitCount) continue;
    if (!hasCurrency && !multiplier && !grouped && value < 100) continue;

    // The largest plausible figure wins: in "3 sesiones a 25 mil" the price is
    // the one that survives this filter anyway, and in a sentence with several
    // numbers the money is almost always the biggest.
    if (best === null || value > best) best = value;
  }

  return best;
}

function findQuantity(text: string): number | null {
  const explicit = text.match(new RegExp(`\\b(\\d{1,4})\\s+(?:${UNIT_WORDS})\\b`, 'i'));
  if (explicit) return Number(explicit[1]);

  const leading = text.match(/^\s*(\d{1,4})\s+\D/);
  if (leading) return Number(leading[1]);

  return null;
}

/**
 * The person being invoiced.
 *
 * Anchored on "a" / "para", optionally through "paciente", and stopped at the
 * first word that starts the rest of the sentence. Capitalisation is not
 * required — people type in lowercase — so the stop words do the work.
 */
function findReceiver(text: string): string | null {
  // The anchor is an explicit space, not `\b`.
  //
  // JavaScript's `\b` is ASCII-only, so it sees a word boundary inside
  // "kinesiologí|a" and happily reads that trailing "a" as the preposition —
  // which turned "kinesiología a María Suárez" into the name "a María Suárez".
  //
  // "de" is not a stop word either: it belongs to plenty of real surnames.
  const match = text.match(
    /(?:^|[\s,;])(?:al?|para)\s+(?:el\s+|la\s+|los\s+)?(?:paciente\s+|cliente\s+|sr\.?\s+|sra\.?\s+)?([^\d$,;]+?)(?=\s+(?:por|con)\b|\s*[\d$,;]|\s*$)/i,
  );

  if (!match) return null;

  const captured = match[1];
  if (!captured) return null;

  const name = captured.trim().replace(/\s+/g, ' ');
  // "a 25 mil" and other prepositional debris are not names.
  if (name.length < 2 || /^(?:mil|millones?|pesos?|factura|facturar?)$/i.test(name)) return null;

  return name;
}

function findDescription(text: string, receiver: string | null): string | null {
  // "por <concepto>" is how people say it, as long as what follows is not money.
  //
  // The concept runs until the price, the receiver, or the end — but never
  // until "de", which is usually inside it ("sesión de kinesiología").
  const byPreposition = text.match(
    /\bpor\s+(?!\$|\d)([^\d$,;]+?)(?=\s+(?:a|para)\b|\s*[\d$,;]|\s*$)/i,
  );
  if (byPreposition?.[1]) {
    const value = byPreposition[1].trim();
    if (value.length >= 4 && value.toLowerCase() !== receiver?.toLowerCase()) return value;
  }

  // Otherwise the unit and whatever qualifies it: "3 sesiones de kinesiología".
  const byUnit = text.match(
    new RegExp(`\\b(?:\\d{1,4}\\s+)?((?:${UNIT_WORDS})(?:\\s+de\\s+[^\\d$,;]+?)?)(?=\\s+(?:a|por|para)\\b|\\s*[,;]|\\s*$)`, 'i'),
  );
  if (byUnit?.[1]) {
    const value = byUnit[1].trim();
    if (value.length >= 4) return value;
  }

  return null;
}

export function parseInvoiceRequest(input: string): ParsedInvoiceRequest {
  const text = input.trim().replace(/\s+/g, ' ');

  const receiverName = findReceiver(text);
  const unitPrice = findPrice(text);
  const quantity = findQuantity(text);
  const description = findDescription(text, receiverName);

  const missing: ParsedInvoiceRequest['missing'] = [];
  if (!receiverName) missing.push('receiverName');
  if (!description) missing.push('description');
  if (unitPrice === null) missing.push('unitPrice');

  return { receiverName, description, quantity, unitPrice, missing };
}
