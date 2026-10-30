export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Keep storage folders stable across local and production server timezones.
export const storageDateKey = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

// Interpret the picker as a local calendar day, not UTC midnight.
export function entryTimestamp(day: string, now = new Date()): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
    throw new Error("Choose an entry date.");
  const [year, month, date] = day.split("-").map(Number);
  const selected = new Date(now);
  selected.setFullYear(year, month - 1, date);
  if (dateKey(selected) !== day || day > dateKey(now))
    throw new Error("Choose today or an earlier date.");
  return selected.toISOString();
}
