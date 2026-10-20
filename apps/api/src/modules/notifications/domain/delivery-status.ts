/**
 * Turns a Meta webhook body into delivery facts.
 *
 * Everything here is pure on purpose. The shape of a provider payload is the
 * one thing this project cannot control or see coming, so it gets tested
 * against recorded bodies instead of trusted to be well-formed.
 */

/** The subset of our enum the provider can move a row to. */
export type ReportedDelivery = 'DELIVERED' | 'READ' | 'UNDELIVERED';

export interface DeliveryEvent {
  /** The id the provider handed us at send time, which is how we find the row. */
  providerMessageId: string;
  status: ReportedDelivery;
  /** When the provider says it happened, not when we found out. */
  at: Date;
  /** The provider's own words when the message did not arrive. */
  error?: string;
}

/**
 * How strong a delivery claim is, so a late or replayed webhook cannot undo
 * better news. Meta does not guarantee ordering, and it does retry.
 */
const STRENGTH: Record<ReportedDelivery, number> = {
  UNDELIVERED: 1,
  DELIVERED: 2,
  READ: 3,
};

/**
 * Whether an incoming report should replace what the row already says.
 *
 * UNDELIVERED ranks lowest because it is the only report that could contradict
 * a delivery: if the message reached the phone, a later "failed" is noise, not
 * a correction.
 */
export function shouldApplyDelivery(
  current: 'UNKNOWN' | ReportedDelivery,
  incoming: ReportedDelivery,
): boolean {
  if (current === 'UNKNOWN') return true;
  return STRENGTH[incoming] > STRENGTH[current];
}

/**
 * Provider status names, which are not the ones we store. 'sent' is absent on
 * purpose: it means the provider accepted the request, which is all we already
 * knew when we recorded SENT, so acting on it would store the same fact twice.
 */
const REPORTED: Partial<Record<string, ReportedDelivery>> = {
  delivered: 'DELIVERED',
  read: 'READ',
  failed: 'UNDELIVERED',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Error codes arrive as numbers, not strings. Dropping them would leave the
 * support answer without the one field that identifies the cause.
 */
function optionalCode(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return optionalText(value);
}

/**
 * Meta reports the timestamp in seconds since the epoch, as a string.
 * A missing or unparseable one means "now", which is the least wrong answer:
 * the event did happen, we just do not know precisely when.
 */
function parseTimestamp(value: unknown): Date {
  if (typeof value === 'string' || typeof value === 'number') {
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds > 0) return new Date(seconds * 1000);
  }
  return new Date();
}

/** The first reason Meta gives, kept verbatim so a support answer has evidence. */
function parseError(status: Record<string, unknown>): string | undefined {
  const [first] = asArray(status.errors);
  if (!isRecord(first)) return undefined;
  const code = optionalCode(first.code);
  const message = optionalText(first.message);
  if (code && message) return `${code}: ${message}`;
  return message ?? code;
}

/**
 * Extracts every delivery report in a webhook body.
 *
 * Inbound patient messages share this endpoint and are deliberately dropped.
 * Reminders carry a link the patient taps, so there is no conversation for an
 * inbound message to be part of yet.
 */
export function parseDeliveryEvents(body: unknown): DeliveryEvent[] {
  if (!isRecord(body)) return [];
  if (body.object !== 'whatsapp_business_account') return [];

  const events: DeliveryEvent[] = [];

  for (const entry of asArray(body.entry)) {
    if (!isRecord(entry)) continue;

    for (const change of asArray(entry.changes)) {
      if (!isRecord(change)) continue;
      const value = change.value;
      if (!isRecord(value)) continue;
      if (value.messaging_product !== 'whatsapp') continue;

      for (const status of asArray(value.statuses)) {
        if (!isRecord(status)) continue;

        const providerMessageId = optionalText(status.id);
        const raw = optionalText(status.status);
        if (!providerMessageId || !raw) continue;

        const reported = REPORTED[raw];
        if (!reported) continue;

        const event: DeliveryEvent = {
          providerMessageId,
          status: reported,
          at: parseTimestamp(status.timestamp),
        };
        const error = parseError(status);
        if (error) event.error = error;
        events.push(event);
      }
    }
  }

  return events;
}