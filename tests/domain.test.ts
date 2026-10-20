import { describe, it, expect } from "vitest";
import {
  splitBudget,
  parseMoney,
  localToUtc,
  calendarIcs,
  canTransition,
  safeUrl,
  money,
} from "../packages/domain/src/index";
describe("точные суммы", () => {
  it("не использует float при вводе", () => {
    expect(parseMoney("100,01")).toBe(10001n);
    expect(parseMoney("0.10")).toBe(10n);
  });
  it.each(["-1", "1.001", "1e3", "", "Infinity", "100000000000"])(
    "отклоняет %s",
    (value) => expect(() => parseMoney(value)).toThrow(),
  );
  it("распределяет остаток детерминированно", () => {
    const r = splitBudget(
      [{ amount_minor: "10001", cost_kind: "shared" }],
      ["b", "a"],
    );
    expect(r.shares).toEqual({ a: "5001", b: "5000" });
  });
  it("сумма долей равна итогу для разных составов", () => {
    for (let n = 1; n < 50; n++) {
      const r = splitBudget(
        [
          { amount_minor: "10003", cost_kind: "shared" },
          { amount_minor: "233", cost_kind: "per_person" },
        ],
        Array.from({ length: n }, (_, i) => String(i)),
      );
      expect(Object.values(r.shares).reduce((a, b) => a + BigInt(b), 0n)).toBe(
        BigInt(r.total_minor),
      );
    }
  });
  it("обрабатывает отсутствие людей и отрицательные суммы", () => {
    expect(() => splitBudget([], [])).toThrow();
    expect(() =>
      splitBudget([{ amount_minor: "-1", cost_kind: "shared" }], ["a"]),
    ).toThrow();
  });
  it("сохраняет тиыны при отображении", () =>
    expect(money("10001")).toContain("100,01"));
});
describe("дата и календарь", () => {
  it("преобразует Алматы UTC+5 через границу суток", () =>
    expect(localToUtc("2026-11-01T01:00")).toBe("2026-10-31T20:00:00.000Z"));
  it("отклоняет несуществующую дату", () =>
    expect(() => localToUtc("2026-02-30T10:00")).toThrow());
  it("экспортирует отмену, версии, экранирование и корректные байтовые переносы", () => {
    const p = {
      id: "test",
      title: "Поездка, театр;\n" + "Казахстан ".repeat(15),
      starts_at: "2026-11-01T06:00:00Z",
      meeting_note: "У входа",
      version: 3,
      status: "cancelled" as const,
    };
    const ics = calendarIcs(p, new Date("2026-10-20T00:00:00Z"));
    expect(ics).toContain("UID:test@qayda");
    expect(ics).toContain("DTSTART:20261101T060000Z");
    expect(ics).toContain("SEQUENCE:33");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics.replace(/\r\n /g, "")).toContain(
      "SUMMARY:Поездка\\, театр\\;\\n",
    );
    for (const line of ics.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(ics).not.toContain("DTEND");
  });
});
describe("инварианты", () => {
  it("terminal state immutable", () => {
    expect(canTransition("completed", "proposed")).toBe(false);
    expect(canTransition("confirmed", "proposed")).toBe(true);
  });
  it("отклоняет опасные ссылки", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("https://u:p@example.com")).toBeNull();
    expect(safeUrl("https://example.com")).toBe("https://example.com/");
  });
});

it("calendar cancellation advances sequence without changing RSVP version", () => {
  const base = {
    id: "same-plan",
    title: "Встреча",
    starts_at: "2026-11-01T00:00:00Z",
    meeting_note: "У входа",
    version: 1,
  };
  const before = calendarIcs({ ...base, status: "confirmed" });
  const after = calendarIcs({ ...base, status: "cancelled" });
  expect(before).toContain("UID:same-plan@qayda");
  expect(after).toContain("UID:same-plan@qayda");
  const sequence = (ics: string) => Number(/SEQUENCE:(\d+)/.exec(ics)![1]);
  expect(sequence(after)).toBeGreaterThan(sequence(before));
});
