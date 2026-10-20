import { it, expect } from "vitest";
import { demoListings, searchCatalogue } from "../packages/domain/src/index";
it("supports city aliases without mixing city catalogs", () => {
  expect(
    searchCatalogue(demoListings, "almaty", "Все", "Семипалатинск").every(
      (l) => l.city === "semey",
    ),
  ).toBe(true);
  expect(searchCatalogue(demoListings, "semey", "Все", "Алма-Ата").length).toBe(
    4,
  );
  expect(
    searchCatalogue(demoListings, "semey", "Все", "неизвестное место"),
  ).toEqual([]);
});

it("finds place names with spaces, hyphens and Kazakh spelling", () => {
  const place = {
    ...demoListings[0],
    title: "Пещера Коныр-Аулие",
    summary: "Қоңыр әулие в области Абай",
    city: "semey" as const,
  };
  for (const query of ["коныр аулие", "Коныр-Аулие", "Қоңыр әулие"])
    expect(searchCatalogue([place], "semey", "Все", query)).toEqual([place]);
  expect(searchCatalogue([place], "almaty", "Все", "коныр аулие")).toEqual([]);
});
