import { env } from './config/env.js';
import { buildApp } from './app.js';
import { prisma } from './shared/prisma.js';
import { startReminderJob } from './jobs/reminder.job.js';

async function main(): Promise<void> {
  const app = await buildApp();
  const reminders = startReminderJob(app.log);

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    reminders.stop();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: env.PORT, host: env.HOST });

  app.log.info(
    `API ready on http://localhost:${env.PORT} — notifications: ${env.NOTIFICATION_PROVIDER}`,
  );
}

main().catch((error: unknown) => {
  console.error('Failed to start the API:', error);
  process.exit(1);
});
