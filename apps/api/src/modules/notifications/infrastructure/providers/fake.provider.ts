import type { NotificationProvider, OutboundMessage, SendResult } from '../../domain/notification-provider.js';

/**
 * In-memory provider for tests. Records everything it was asked to send and
 * can be told to fail, so retry and give-up paths are testable without a
 * network or a clock.
 */
export class FakeNotificationProvider implements NotificationProvider {
  readonly name = 'fake';
  readonly live = false;
  readonly sent: OutboundMessage[] = [];

  private failure: { error: string; retryable: boolean } | null = null;

  failNextWith(error: string, retryable = true): void {
    this.failure = { error, retryable };
  }

  async send(message: OutboundMessage): Promise<SendResult> {
    if (this.failure) {
      const failure = this.failure;
      this.failure = null;
      return { ok: false, error: failure.error, retryable: failure.retryable };
    }

    this.sent.push(message);
    return { ok: true, providerMessageId: `fake-${this.sent.length}` };
  }

  reset(): void {
    this.sent.length = 0;
    this.failure = null;
  }
}
