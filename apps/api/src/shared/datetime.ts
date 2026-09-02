/**
 * Timezone handling, without a date library.
 *
 * Instants are always stored in UTC (timestamptz). The only place a timezone
 * matters is when a human reads the value: the agenda in the browser, and the
 * WhatsApp message rendered on the server. `Intl` does that conversion
 * correctly, including DST, so nothing else needs to know about zones.
 */

const DATE_FORMATTERS = new Map<string, Intl.DateTimeFormat>();
const TIME_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function dateFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = DATE_FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('es-AR', {
      timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    DATE_FORMATTERS.set(timeZone, formatter);
  }
  return formatter;
}

function timeFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = TIME_FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('es-AR', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    TIME_FORMATTERS.set(timeZone, formatter);
  }
  return formatter;
}

/** "martes 3 de septiembre" */
export function formatDateInZone(instant: Date, timeZone: string): string {
  return dateFormatter(timeZone).format(instant);
}

/** "14:30" */
export function formatTimeInZone(instant: Date, timeZone: string): string {
  return timeFormatter(timeZone).format(instant);
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

export function subtractHours(instant: Date, hours: number): Date {
  return new Date(instant.getTime() - hours * 3_600_000);
}
