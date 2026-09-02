import 'dotenv/config';
import { z } from 'zod';

/**
 * Every environment variable the API reads is declared here and nowhere else.
 * A missing or malformed value crashes the process at boot, not at 3 a.m.
 * while a reminder is being sent.
 */
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3333),
    HOST: z.string().default('0.0.0.0'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    WEB_APP_URL: z.string().url().default('http://localhost:5173'),

    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().default('30d'),

    NOTIFICATION_PROVIDER: z.enum(['console', 'twilio', 'meta', 'fake']).default('console'),

    REMINDER_CRON: z.string().default('* * * * *'),
    REMINDER_MAX_DELAY_MINUTES: z.coerce.number().int().positive().default(120),
    REMINDER_BATCH_SIZE: z.coerce.number().int().positive().default(50),
    REMINDER_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),

    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_WHATSAPP_FROM: z.string().optional(),
    /** SID of an approved content template (HX...). Required by most accounts. */
    TWILIO_CONTENT_SID: z.string().startsWith('HX', 'A content SID starts with HX').optional(),

    META_PHONE_NUMBER_ID: z.string().optional(),
    META_ACCESS_TOKEN: z.string().optional(),
    /** Approved template name. Without it, only free text inside the 24h window. */
    META_TEMPLATE_NAME: z.string().optional(),
    META_TEMPLATE_LANGUAGE: z.string().default('es_AR'),
    /** Meta rejects a parameter-count mismatch; `hello_world` declares none. */
    META_TEMPLATE_PARAM_COUNT: z.coerce.number().int().min(0).max(10).default(5),
    /** True when the template ends in a dynamic URL button that takes the token. */
    META_TEMPLATE_URL_BUTTON: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    META_API_VERSION: z.string().default('v21.0'),

    /**
     * fake = simulated CAE, no account and no cost. The default on purpose:
     * the whole feature is built and demonstrated against it, and nobody pays
     * a provider until a real customer is on the other side.
     */
    INVOICING_PROVIDER: z.enum(['fake', 'tusfacturas']).default('fake'),
    TUSFACTURAS_API_KEY: z.string().optional(),
    TUSFACTURAS_API_TOKEN: z.string().optional(),
    TUSFACTURAS_USER_TOKEN: z.string().optional(),
    TUSFACTURAS_BASE_URL: z.string().url().default('https://www.tusfacturas.app/app/api/v2'),
  })
  .superRefine((value, ctx) => {
    // A shipped example secret is not a secret. Anyone who has read the repo
    // could mint a token for any account, so production refuses to start.
    if (value.NODE_ENV === 'production') {
      if (/change-me|example|secret|password/i.test(value.JWT_SECRET)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'JWT_SECRET still looks like the placeholder. Generate one with: openssl rand -hex 32',
        });
      }

      if (value.WEB_APP_URL.startsWith('http://')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'WEB_APP_URL must use https in production: the patient confirmation link travels over it',
        });
      }
    }

    // Each live provider declares what it cannot start without. Failing here
    // means failing at boot with a readable list, not at 3 a.m. mid-send.
    const required = {
      twilio: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM'],
      meta: ['META_PHONE_NUMBER_ID', 'META_ACCESS_TOKEN'],
    } as const;

    const keys = required[value.NOTIFICATION_PROVIDER as keyof typeof required];

    if (keys) {
      const missing = keys.filter((key) => !value[key as keyof typeof value]);

      if (missing.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `NOTIFICATION_PROVIDER=${value.NOTIFICATION_PROVIDER} requires: ${missing.join(', ')}`,
        });
      }
    }

    // Same contract for invoicing: the day someone switches this on, they find
    // out at boot what is missing, not when a patient is waiting for a receipt.
    if (value.INVOICING_PROVIDER === 'tusfacturas') {
      const invoicingKeys = [
        'TUSFACTURAS_API_KEY',
        'TUSFACTURAS_API_TOKEN',
        'TUSFACTURAS_USER_TOKEN',
      ] as const;

      const missing = invoicingKeys.filter((key) => !value[key]);

      if (missing.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `INVOICING_PROVIDER=tusfacturas requires: ${missing.join(', ')}`,
        });
      }
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((issue) => `  - ${issue.path.join('.') || 'env'}: ${issue.message}`);
  console.error(`\nInvalid environment configuration:\n${lines.join('\n')}\n`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
