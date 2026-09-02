import { normalizePhone } from '../../../shared/phone.js';
import { AppError } from '../../../shared/errors.js';
import { renderTemplate, templateVariables } from '../domain/render-template.js';
import type { NotificationProvider } from '../domain/notification-provider.js';

export interface SendTestMessageInput {
  phone: string;
  templateBody: string;
  organizationName: string;
  timezone: string;
  userName: string;
}

/**
 * Lets the user see the actual message before trusting it with a real patient.
 * This is the single most reassuring screen in the product for someone who is
 * not comfortable with software.
 */
export async function sendTestMessage(
  input: SendTestMessageInput,
  provider: NotificationProvider,
): Promise<{ body: string; providerMessageId: string }> {
  const to = normalizePhone(input.phone);

  const context = {
    patientName: input.userName,
    professionalName: input.userName,
    organizationName: input.organizationName,
    startsAt: new Date(Date.now() + 86_400_000),
    timezone: input.timezone,
    link: '(el link real va acá)',
  };

  // A real-looking token so a dynamic URL button renders during a test.
  const sampleToken = 'prueba';

  const body = renderTemplate(input.templateBody, context);

  const result = await provider.send({
    to,
    body,
    variables: templateVariables(context),
    buttonParameter: sampleToken,
    reference: 'test-message',
  });

  if (!result.ok) {
    throw new AppError(502, 'PROVIDER_ERROR', `The message could not be sent: ${result.error}`);
  }

  return { body, providerMessageId: result.providerMessageId };
}
