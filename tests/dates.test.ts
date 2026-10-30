import { expect, it } from "vitest";
import { dateKey, entryTimestamp, storageDateKey } from "../lib/dates";

it("groups storage by the entry date in India across the UTC day boundary", () => {
  expect(storageDateKey(new Date("2026-10-25T18:29:59Z"))).toBe("2026-10-25");
  expect(storageDateKey(new Date("2026-10-25T18:30:00Z"))).toBe("2026-10-26");
});

it("saves an earlier local calendar day while preserving the time of day", () => {
  const now = new Date(2026, 9, 30, 9, 45, 12);
  const saved = new Date(entryTimestamp("2026-09-12", now));
  expect(dateKey(saved)).toBe("2026-09-12");
  expect(saved.getHours()).toBe(9);
  expect(saved.getMinutes()).toBe(45);
  expect(entryTimestamp(dateKey(now), now)).toBe(now.toISOString());
});
it("rejects empty, invalid and future entry dates", () => {
  const now = new Date(2026, 9, 30, 9);
  for (const day of ["", "invalid", "2026-02-30", "2026-10-31"])
    expect(() => entryTimestamp(day, now)).toThrow();
});
