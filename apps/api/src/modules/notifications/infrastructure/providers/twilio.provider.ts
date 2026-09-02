import twilio from 'twilio';
import type { NotificationProvider, OutboundMessage, SendResult } from '../../domain/notification-provider.js';

export interface TwilioOptions {
  accountSid: string;
  authToken: string;
  from: string;
  /**
   * SID of an approved content template (starts with `HX`).
   *
   * Meta only allows a business to open a conversation with a template it has
   * approved, so most accounts reject free text outright with error 21654.
   * When this is set the provider sends the template plus positional values;
   * when it is not, it falls back to free text, which only works inside the
   * 24-hour window opened by a message from the patient.
   */
  contentSid?: string;
}

/**
 * Twilio WhatsApp delivery.
 *
 * The only file in the project that knows Twilio exists. Everything above it
 * talks to `NotificationProvider`, so replacing Twilio with Meta's Cloud API
 * later means adding a sibling of this file — not touching a use case.
 */
export class TwilioNotificationProvider implements NotificationProvider {
  readonly name = 'twilio';
  readonly live = true;

  private readonly client: twilio.Twilio;

  constructor(private readonly options: TwilioOptions) {
    this.client = twilio(options.accountSid, options.authToken);
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    try {
      const payload = {
        from: normalizeWhatsAppAddress(this.options.from),
        to: normalizeWhatsAppAddress(message.to),
        ...(this.options.contentSid
          ? {
              contentSid: this.options.contentSid,
              contentVariables: JSON.stringify(message.variables ?? {}),
            }
          : { body: message.body }),
      };

      const result = await this.client.messages.create(payload);

      return { ok: true, providerMessageId: result.sid };
    } catch (error) {
      const twilioError = error as { code?: number; message?: string; status?: number };

      return {
        ok: false,
        error: describe(twilioError),
        retryable: isRetryable(twilioError),
      };
    }
  }
}

function normalizeWhatsAppAddress(value: string): string {
  return value.startsWith('whatsapp:') ? value : `whatsapp:${value}`;
}

/**
 * Twilio's own message is accurate but assumes you know the platform. These
 * three are the ones a practice owner will actually hit, so they get an
 * explanation instead of a code.
 */
const EXPLAINED: Record<number, string> = {
  21654:
    'WhatsApp requires an approved template. Set TWILIO_CONTENT_SID with the SID of your content template.',
  63016:
    'WhatsApp does not allow free text more than 24 hours after the patient last wrote. An approved template is required.',
  21610: 'This patient asked WhatsApp to stop receiving your messages.',
};

function describe(error: { code?: number; message?: string }): string {
  const explanation = error.code !== undefined ? EXPLAINED[error.code] : undefined;
  const base = `[${error.code ?? 'unknown'}] ${error.message ?? 'Unknown error'}`;

  return explanation ? `${base} — ${explanation}` : base;
}

/**
 * A wrong number or an unapproved template will fail the same way forever;
 * retrying only burns quota. Rate limits and outages are worth another try.
 */
function isRetryable(error: { code?: number; status?: number }): boolean {
  const permanent = new Set([
    21211, // invalid 'To' number
    21408, // permission to send to this region not enabled
    21610, // recipient unsubscribed
    21654, // content template required or wrong
    63016, // freeform message outside the 24h window
    63018, // template not approved
  ]);

  if (error.code !== undefined && permanent.has(error.code)) return false;
  if (error.status !== undefined && error.status >= 400 && error.status < 500) return error.status === 429;

  return true;
}
