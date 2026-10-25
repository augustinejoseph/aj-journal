import { expect, it } from "vitest";
import { storageDateKey } from "../lib/dates";

it("groups storage by the entry date in India across the UTC day boundary", () => {
  expect(storageDateKey(new Date("2026-10-25T18:29:59Z"))).toBe("2026-10-25");
  expect(storageDateKey(new Date("2026-10-25T18:30:00Z"))).toBe("2026-10-26");
});
