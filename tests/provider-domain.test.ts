import { describe, it, expect } from "vitest";
import { normalizePhone, providerPayload } from "../packages/domain/src/index";
describe("контакты исполнителей", () => {
  it("принимает привычные варианты казахстанского номера", () => {
    expect(normalizePhone("8 (700) 123-45-67")).toBe("+77001234567");
    expect(normalizePhone("+7 700 123 45 67")).toBe("+77001234567");
    expect(normalizePhone("7001234567")).toBe("+77001234567");
  });
  it("не создаёт ссылку для звонка из произвольного текста", () => {
    for (const v of [
      "123",
      "javascript:alert(1)",
      "+7;call",
      "",
      "+70000000000000000",
    ])
      expect(() => normalizePhone(v)).toThrow();
  });
  it("отклоняет небезопасную ссылку и профиль без контакта", () => {
    expect(() =>
      providerPayload({ kind: "guide", contact_url: "javascript:alert(1)" }),
    ).toThrow();
    expect(() =>
      providerPayload({
        kind: "guide",
        contact_url: "https://user:password@example.com",
      }),
    ).toThrow();
    expect(() => providerPayload({ kind: "guide" })).toThrow("телефон");
  });
  it("для водителя требует автомобиль и пассажирскую вместимость", () => {
    expect(() =>
      providerPayload({
        kind: "driver",
        phone: "87001234567",
        vehicle: "",
        seats: "4",
      }),
    ).toThrow("автомобиль");
    expect(() =>
      providerPayload({
        kind: "driver",
        phone: "87001234567",
        vehicle: "Минивэн",
        seats: "0",
      }),
    ).toThrow();
    expect(
      providerPayload({
        kind: "driver",
        phone: "87001234567",
        vehicle: "Минивэн",
        seats: "6",
      }),
    ).toMatchObject({ phone: "+77001234567", seats: "6" });
  });
});
