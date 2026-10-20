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
