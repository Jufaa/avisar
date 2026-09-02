import type { NotificationProvider, OutboundMessage, SendResult } from '../../domain/notification-provider.js';

/**
 * Default provider for development.
 *
 * Prints the exact message that would reach the patient. The whole reminder
 * pipeline — rules, scheduling, the job, retries, the log — is exercised for
 * real; only the last hop is a terminal instead of WhatsApp. No credentials,
 * no cost, no waiting on template approval.
 */
export class ConsoleNotificationProvider implements NotificationProvider {
  readonly name = 'console';
  readonly live = false;

  async send(message: OutboundMessage): Promise<SendResult> {
    const border = '─'.repeat(60);
    console.log(
      [
        '',
        `┌${border}┐`,
        `  WHATSAPP → ${message.to}`,
        `  ref: ${message.reference}`,
        `├${border}┤`,
        message.body
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n'),
        `└${border}┘`,
        '',
      ].join('\n'),
    );

    return { ok: true, providerMessageId: `console-${message.reference}` };
  }
}
