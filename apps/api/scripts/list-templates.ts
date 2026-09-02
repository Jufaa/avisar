/**
 * Lists the WhatsApp content templates this Twilio account can send, with the
 * SID each one needs.
 *
 * A trial account cannot get its own template approved by Meta, but it can
 * send the ones Twilio already had approved. This prints them so a real
 * message can reach a real phone today, instead of waiting on business
 * verification.
 *
 *   pnpm --filter @avisar/api templates
 */
import 'dotenv/config';
import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
  console.error('\n  Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN in apps/api/.env\n');
  process.exit(1);
}

const client = twilio(accountSid, authToken);

/** Pulls the {{n}} placeholders out of whatever shape the template uses. */
function placeholdersOf(types: Record<string, unknown>): string[] {
  const found = new Set<string>();

  for (const value of Object.values(types)) {
    const body = (value as { body?: string } | null)?.body;
    if (typeof body !== 'string') continue;

    for (const token of body.match(/\{\{(\w+)\}\}/g) ?? []) found.add(token);
  }

  return [...found].sort();
}

async function main(): Promise<void> {
  const templates = await client.content.v1.contents.list({ limit: 50 });

  if (templates.length === 0) {
    console.log('\n  This account has no content templates.\n');
    console.log('  Twilio Console -> Messaging -> Content Template Builder\n');
    return;
  }

  console.log(`\n  ${templates.length} content template(s) available\n`);

  for (const template of templates) {
    const types = (template.types ?? {}) as Record<string, unknown>;
    const placeholders = placeholdersOf(types);

    console.log(`  ${template.friendlyName}`);
    console.log(`    SID:       ${template.sid}`);
    console.log(`    Language:  ${template.language}`);
    console.log(`    Kind:      ${Object.keys(types).join(', ') || 'unknown'}`);
    console.log(`    Variables: ${placeholders.length > 0 ? placeholders.join(' ') : 'none'}`);
    console.log('');
  }

  console.log('  Copy the SID you want into TWILIO_CONTENT_SID in apps/api/.env,');
  console.log('  then restart the API. The .env is only read at boot.\n');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\n  Could not list templates: ${message}\n`);
  process.exit(1);
});
