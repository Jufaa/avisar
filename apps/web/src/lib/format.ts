/**
 * Everything the user reads about time goes through here.
 * Instants arrive from the API as ISO strings in UTC and are rendered in the
 * browser's own timezone, which for a practice is its actual timezone.
 */

const WEEKDAY_LONG = new Intl.DateTimeFormat('es-AR', { weekday: 'long' });
const WEEKDAY_SHORT = new Intl.DateTimeFormat('es-AR', { weekday: 'short' });
const DAY_MONTH = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' });
const DAY_MONTH_SHORT = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit' });
const TIME = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
const FULL = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

export const formatTime = (value: string | Date): string => TIME.format(toDate(value));
export const formatDayMonth = (value: string | Date): string => DAY_MONTH.format(toDate(value));
export const formatDayMonthShort = (value: string | Date): string => DAY_MONTH_SHORT.format(toDate(value));
export const formatWeekday = (value: string | Date): string => WEEKDAY_LONG.format(toDate(value));
export const formatWeekdayShort = (value: string | Date): string => WEEKDAY_SHORT.format(toDate(value));
export const formatFull = (value: string | Date): string => FULL.format(toDate(value));

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "hoy" / "mañana" / "martes 3 de septiembre" — whichever a person would say. */
export function friendlyDay(value: string | Date): string {
  const date = startOfDay(toDate(value));
  const today = startOfDay(new Date());
  const days = Math.round((date.getTime() - today.getTime()) / 86_400_000);

  if (days === 0) return 'Hoy';
  if (days === 1) return 'Mañana';
  if (days === -1) return 'Ayer';

  return capitalize(`${formatWeekday(date)} ${formatDayMonth(date)}`);
}

export function startOfDay(value: string | Date): Date {
  const date = new Date(toDate(value));
  date.setHours(0, 0, 0, 0);
  return date;
}

export function endOfDay(value: string | Date): Date {
  const date = startOfDay(value);
  date.setDate(date.getDate() + 1);
  return date;
}

/** Weeks start on Monday, the way a practice reads its agenda. */
export function startOfWeek(value: string | Date): Date {
  const date = startOfDay(value);
  const weekday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - weekday);
  return date;
}

export function endOfWeek(value: string | Date): Date {
  const date = startOfWeek(value);
  date.setDate(date.getDate() + 7);
  return date;
}

export function addDays(value: string | Date, days: number): Date {
  const date = new Date(toDate(value));
  date.setDate(date.getDate() + days);
  return date;
}

/** Value for an <input type="datetime-local">, which expects local wall time. */
export function toDateTimeLocalValue(value: string | Date): string {
  const date = toDate(value);
  const pad = (n: number) => String(n).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Reads a datetime-local value back as a real instant. */
export function fromDateTimeLocalValue(value: string): Date {
  return new Date(value);
}

export function toDateInputValue(value: string | Date): string {
  const date = toDate(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
