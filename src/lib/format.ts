/** Formatting helpers. British English, unhurried. */

const DATE_FMT = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const DATETIME_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(iso?: string): string {
  if (!iso) return "date not recorded";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return DATE_FMT.format(d);
}

export function formatDateTime(iso?: string): string {
  if (!iso) return "time not recorded";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return DATETIME_FMT.format(d);
}

export function formatAge(age?: number): string {
  return age === undefined ? "age not recorded" : `${age}y`;
}

/** Whole months between two ISO instants, floored. */
export function monthsBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso);
  const b = new Date(toIso);
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  return b.getDate() < a.getDate() ? months - 1 : months;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
