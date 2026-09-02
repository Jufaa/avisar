import cron from 'node-cron';
import type { FastifyBaseLogger } from 'fastify';
import { env } from '../config/env.js';
import { prisma } from '../shared/prisma.js';
import { PrismaNotificationRepository } from '../modules/notifications/infrastructure/prisma-notification.repository.js';
import { TokenConfirmationLinkFactory } from '../modules/notifications/infrastructure/token-confirmation-link.js';
import { notificationProvider } from '../modules/notifications/infrastructure/providers/index.js';
import { dispatchDueReminders } from '../modules/notifications/application/dispatch-due-reminders.js';

const STALLED_AFTER_MINUTES = 10;

export interface ReminderJobHandle {
  stop(): void;
  /** Runs one tick immediately. Used by tests and by the manual trigger. */
  runOnce(): Promise<void>;
}

/**
 * The scheduled process that makes the product automatic.
 *
 * It owns no state of its own: everything it needs is a row in `notification`.
 * That is what lets the server restart, redeploy or crash without losing a
 * single reminder.
 */
export function startReminderJob(logger: FastifyBaseLogger): ReminderJobHandle {
  const repository = new PrismaNotificationRepository(prisma);
  const provider = notificationProvider();
  const links = new TokenConfirmationLinkFactory(prisma, env.WEB_APP_URL);

  let running = false;

  async function tick(): Promise<void> {
    // Overlapping ticks are pointless: SKIP LOCKED already keeps separate
    // processes safe, but a slow provider should not stack ticks in one.
    if (running) return;
    running = true;

    try {
      const summary = await dispatchDueReminders(
        {
          batchSize: env.REMINDER_BATCH_SIZE,
          maxDelayMinutes: env.REMINDER_MAX_DELAY_MINUTES,
          maxAttempts: env.REMINDER_MAX_ATTEMPTS,
        },
        { repository, provider, links },
      );

      if (summary.claimed > 0) {
        logger.info({ ...summary, provider: provider.name }, 'reminder tick');
      }
    } catch (error) {
      logger.error({ err: error }, 'reminder tick failed');
    } finally {
      running = false;
    }
  }

  // Anything left in SENDING belongs to a process that died mid-send.
  repository
    .recoverStalled(STALLED_AFTER_MINUTES)
    .then((count) => {
      if (count > 0) logger.warn({ count }, 'recovered reminders stuck in SENDING');
    })
    .catch((error: unknown) => logger.error({ err: error }, 'stalled recovery failed'));

  const task = cron.schedule(env.REMINDER_CRON, () => void tick());

  logger.info(
    { cron: env.REMINDER_CRON, provider: provider.name },
    'reminder job started',
  );

  return {
    stop: () => task.stop(),
    runOnce: tick,
  };
}
