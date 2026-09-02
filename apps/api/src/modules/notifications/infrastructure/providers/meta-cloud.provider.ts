import type { NotificationProvider, OutboundMessage, SendResult } from '../../domain/notification-provider.js';

export interface MetaCloudOptions {
  /** Numeric id of the sending number, from the WhatsApp app dashboard. */
  phoneNumberId: string;
  accessToken: string;
  /**
   * Name of an approved template, e.g. `recordatorio_turno`.
   *
   * Without it the provider sends free text, which WhatsApp only delivers
   * inside the 24-hour window opened by a message from the patient. A
   * reminder is always business-initiated, so production needs a template.
   */
  templateName?: string;
  /** Language tag registered with the template, e.g. `es_AR` or `en_US`. */
  templateLanguage: string;
  /**
   * How many positional parameters the template declares.
   *
   * Meta rejects a mismatch outright, and its own `hello_world` sample has
   * none — hence a number rather than an assumption.
   */
  templateParamCount: number;
  /**
   * Whether the template ends in a dynamic URL button.
   *
   * A button is far easier to tap than a link buried in a paragraph, which
   * matters for the audience this product serves. Meta needs its suffix as a
   * separate component, so the provider has to be told the button exists.
   */
  templateHasUrlButton: boolean;
  apiVersion: string;
}

interface MetaSuccess {
  messages?: Array<{ id?: string }>;
}

interface MetaFailure {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    error_data?: { details?: string };
  };
}

/**
 * WhatsApp delivery straight through Meta's Cloud API.
 *
 * No reseller in the middle: the developer setup hands out a free test number
 * and a handful of verified recipients, which is what makes it possible to see
 * a real message land on a real phone without a paid plan.
 */
export class MetaCloudNotificationProvider implements NotificationProvider {
  readonly name = 'meta';
  readonly live = true;

  constructor(private readonly options: MetaCloudOptions) {}

  async send(message: OutboundMessage): Promise<SendResult> {
    const url = `https://graph.facebook.com/${this.options.apiVersion}/${this.options.phoneNumberId}/messages`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(this.payloadFor(message)),
      });

      const payload: unknown = await response.json();

      if (!response.ok) {
        const failure = payload as MetaFailure;
        const code = failure.error?.code;

        return {
          ok: false,
          error: describe(failure, response.status),
          retryable: isRetryable(code, response.status),
        };
      }

      const id = (payload as MetaSuccess).messages?.[0]?.id;

      // A 200 with no message id means Meta accepted nothing. Treating that as
      // success would mark the reminder SENT and never send it again.
      if (!id) return { ok: false, error: 'Meta accepted the request but returned no message id', retryable: true };

      return { ok: true, providerMessageId: id };
    } catch (error) {
      // Network-level failure: worth another attempt on the next tick.
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `Network error reaching Meta: ${detail}`, retryable: true };
    }
  }

  private payloadFor(message: OutboundMessage): Record<string, unknown> {
    const to = toMetaAddress(message.to);

    if (!this.options.templateName) {
      return {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message.body, preview_url: true },
      };
    }

    const variables = message.variables ?? {};
    const parameters = Array.from({ length: this.options.templateParamCount }, (_, index) => ({
      type: 'text',
      // Meta rejects an empty string, so a missing value becomes a dash.
      text: variables[String(index + 1)] || '-',
    }));

    const components: Array<Record<string, unknown>> = [];
    if (parameters.length > 0) components.push({ type: 'body', parameters });

    if (this.options.templateHasUrlButton && message.buttonParameter) {
      components.push({
        type: 'button',
        sub_type: 'url',
        index: '0',
        parameters: [{ type: 'text', text: message.buttonParameter }],
      });
    }

    return {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: this.options.templateName,
        language: { code: this.options.templateLanguage },
        // Meta rejects an empty array, so the key is omitted entirely.
        ...(components.length > 0 ? { components } : {}),
      },
    };
  }
}

/**
 * Meta wants the destination without a leading plus, and it canonicalises
 * Argentine mobiles *without* the `9` that WhatsApp uses internally: a phone
 * stored here as +54 9 358 418-1872 is registered on Meta's side as
 * 543584181872.
 *
 * Sending the 9 makes an already verified recipient look like an unknown one,
 * which comes back as error 131030 — an error whose text sends you looking in
 * entirely the wrong place. Twilio wants the opposite, which is exactly why
 * this belongs in the provider and not in the shared phone normalizer.
 */
export function toMetaAddress(e164: string): string {
  const digits = e164.replace(/\D/g, '');

  // 549 + 2-to-4 digit area code + subscriber = 13 digits.
  if (digits.startsWith('549') && digits.length === 13) return `54${digits.slice(3)}`;

  return digits;
}

/**
 * Meta's messages are terse and assume you know the platform. These are the
 * ones this product will actually hit, so they get an explanation.
 */
const EXPLAINED: Record<number, string> = {
  131026:
    'WhatsApp cannot deliver to that number. On a test number, the recipient must be one of the verified numbers in the app dashboard.',
  131030:
    'A test number can only reach the numbers on its allowed list. Add this one under "To" in the API Setup screen and verify it with the code.',
  131047:
    'More than 24 hours since the patient last wrote, so free text is not allowed. Configure META_TEMPLATE_NAME with an approved template.',
  131051: 'That message type is not supported for this number.',
  132000:
    'The template expects a different number of variables. Check META_TEMPLATE_PARAM_COUNT, and META_TEMPLATE_URL_BUTTON if the template has a dynamic URL button.',
  132001: 'No approved template with that name and language. Check META_TEMPLATE_NAME and META_TEMPLATE_LANGUAGE.',
  132015: 'The template was paused by Meta for poor quality.',
  190: 'The access token expired or was revoked. Generate a new one in the app dashboard.',
};

function describe(failure: MetaFailure, status: number): string {
  const code = failure.error?.code;
  const base = `[${code ?? status}] ${failure.error?.message ?? 'Unknown error'}`;
  const details = failure.error?.error_data?.details;
  const explanation = code !== undefined ? EXPLAINED[code] : undefined;

  return [base, details, explanation].filter(Boolean).join(' — ');
}

/**
 * A missing template or a dead token fails identically forever; retrying only
 * burns quota and delays the failure showing up in the log. Rate limits and
 * outages are worth another tick.
 */
function isRetryable(code: number | undefined, status: number): boolean {
  const permanent = new Set([
    131026, // undeliverable recipient
    131030, // recipient not on the test number's allowed list
    131047, // needs a template
    131051, // unsupported message type
    132000, // wrong parameter count
    132001, // template not found
    132015, // template paused
    190, // bad access token
  ]);

  if (code !== undefined && permanent.has(code)) return false;
  if (code === 130429 || code === 131056 || code === 80007) return true; // rate limits

  return status >= 500 || status === 429;
}
