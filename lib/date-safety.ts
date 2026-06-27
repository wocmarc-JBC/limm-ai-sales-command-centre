export const SINGAPORE_TIME_ZONE = "Asia/Singapore";
export const SINGAPORE_UTC_OFFSET = "+08:00";
export const MIN_SAFE_YEAR = 2000;

const dayMs = 24 * 60 * 60 * 1000;

function datePartsInSingapore(date: Date) {
  const parts = new Intl.DateTimeFormat("en-SG", {
    timeZone: SINGAPORE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day)
  };
}

function keyToUtcMs(key: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

export function singaporeNow() {
  return new Date();
}

export function isUnsafeEpochDate(value: string | Date | null | undefined) {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return datePartsInSingapore(date).year < MIN_SAFE_YEAR;
}

export function parseSafeDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (isUnsafeEpochDate(date)) return null;
  return date;
}

export function singaporeDateKey(value: string | Date = singaporeNow()) {
  const date = parseSafeDate(value);
  if (!date) return "";
  const parts = datePartsInSingapore(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function singaporeStartOfDay(value: string | Date = singaporeNow()) {
  const key = singaporeDateKey(value);
  return key ? new Date(`${key}T00:00:00${SINGAPORE_UTC_OFFSET}`) : null;
}

export function addSingaporeDays(value: string | Date, days: number) {
  const key = singaporeDateKey(value);
  const base = keyToUtcMs(key);
  if (base === null) return "";
  const next = new Date(base + days * dayMs);
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function daysBetweenSingaporeDates(target: string | Date | null | undefined, base: string | Date = singaporeNow()) {
  const targetKey = target ? singaporeDateKey(target) : "";
  const baseKey = singaporeDateKey(base);
  const targetMs = keyToUtcMs(targetKey);
  const baseMs = keyToUtcMs(baseKey);
  if (targetMs === null || baseMs === null) return null;
  return Math.round((targetMs - baseMs) / dayMs);
}

export function overdueDaysSingapore(dueDate: string | Date | null | undefined, today: string | Date = singaporeNow()) {
  const diff = daysBetweenSingaporeDates(dueDate, today);
  if (diff === null || diff >= 0) return 0;
  return Math.abs(diff);
}

export function isDueOnOrBeforeSingaporeDate(value: string | Date | null | undefined, today: string | Date = singaporeNow()) {
  const diff = daysBetweenSingaporeDates(value, today);
  return diff !== null && diff <= 0;
}

export function safeSingaporeDateLabel(value: string | Date | null | undefined, fallback = "Not set") {
  const date = parseSafeDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: SINGAPORE_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

export function safeSingaporeDateTimeLabel(value: string | Date | null | undefined, fallback = "Not set") {
  const date = parseSafeDate(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: SINGAPORE_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
