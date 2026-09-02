import { formatDateInZone, formatTimeInZone } from '../../../shared/datetime.js';

export interface TemplateContext {
  patientName: string;
  professionalName: string;
  organizationName: string;
  startsAt: Date;
  timezone: string;
  link?: string;
}

/**
 * Order of the numbered variables in an approved WhatsApp content template.
 *
 * Meta does not accept free text for a business-initiated message: it accepts
 * an approved template plus positional values. This array is the contract
 * between our named placeholders and those positions, so a template built in
 * the provider's console with {{1}}..{{5}} lines up with what we send.
 */
export const TEMPLATE_VARIABLE_ORDER = [
  'nombre_paciente',
  'profesional',
  'fecha',
  'hora',
  'link',
] as const;

/** Every value the system knows how to substitute, keyed by placeholder name. */
export function templateValues(context: TemplateContext): Record<string, string> {
  return {
    nombre_paciente: context.patientName,
    profesional: context.professionalName,
    consultorio: context.organizationName,
    fecha: formatDateInZone(context.startsAt, context.timezone),
    hora: formatTimeInZone(context.startsAt, context.timezone),
    link: context.link ?? '',
  };
}

/**
 * The positional payload a content template expects: {"1": "...", "2": "..."}.
 */
export function templateVariables(context: TemplateContext): Record<string, string> {
  const values = templateValues(context);

  return Object.fromEntries(
    TEMPLATE_VARIABLE_ORDER.map((name, index) => [String(index + 1), values[name] ?? '']),
  );
}

/**
 * Replaces {placeholders} with real values.
 *
 * A placeholder the user invented but the system does not know is left
 * untouched rather than blanked: seeing `{telefono}` arrive verbatim in a test
 * message tells them exactly what went wrong. An empty gap tells them nothing.
 */
export function renderTemplate(body: string, context: TemplateContext): string {
  const values = templateValues(context);

  return body.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

/** Placeholders present in a template but not supported by the system. */
export function unknownVariables(body: string): string[] {
  const known = new Set(['nombre_paciente', 'profesional', 'consultorio', 'fecha', 'hora', 'link']);
  const found = body.match(/\{(\w+)\}/g) ?? [];

  return [...new Set(found.map((token) => token.slice(1, -1)))].filter((name) => !known.has(name));
}
