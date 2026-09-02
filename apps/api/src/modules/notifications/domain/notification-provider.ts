/**
 * The contract between this application and whatever actually delivers a
 * WhatsApp message.
 *
 * Nothing in `application/` imports Twilio or Meta. It imports this. That is
 * the only reason the reminder feature can be built and tested today, and
 * switched between real providers by changing one environment variable.
 */

export interface OutboundMessage {
  /** Destination in E.164, e.g. +5491144445555. */
  to: string;
  /**
   * The message as a human reads it. This is what gets logged, shown in the
   * app and printed by the console provider.
   */
  body: string;
  /**
   * The same content as positional values ({"1": "...", "2": "..."}).
   *
   * Meta refuses free text for a business-initiated message and takes an
   * approved template plus these values instead. Providers that need a
   * template use this; providers that accept free text ignore it.
   */
  variables?: Record<string, string>;
  /**
   * Suffix for a template's dynamic URL button.
   *
   * The template owns the base (https://.../t/{{1}}), so only the token
   * travels. Providers without a button ignore it and use the full URL that is
   * already inside `body`.
   */
  buttonParameter?: string;
  /** Correlation id for logs; never sent to the provider. */
  reference: string;
}

export type SendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string; retryable: boolean };

export interface NotificationProvider {
  /** Human-readable name, surfaced in logs and in the settings screen. */
  readonly name: string;
  /**
   * Whether messages actually reach a patient's phone.
   *
   * The settings screen shows this: a practice must never be left guessing
   * whether the reminders it configured are really going out.
   */
  readonly live: boolean;
  send(message: OutboundMessage): Promise<SendResult>;
}
