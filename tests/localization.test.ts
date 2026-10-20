import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import catalogue from "../data/catalog.json";
import {
  cultureData,
  localizeListing,
  searchCatalogue,
  translate,
  type Listing,
} from "../packages/domain/src/index";
const listings: Listing[] = catalogue.map((item) => ({
  ...item,
  city: item.city as Listing["city"],
  latitude: null,
  longitude: null,
  checked_at: "2026-10-20T00:00:00Z",
  origin: "real_verified",
  price_minor: null,
  publication_status: "published",
  image_url: null,
}));
describe("bilingual public catalogue", () => {
  it("translates eight curated records without changing canonical categories, identifiers or source links", () => {
    for (const item of listings) {
      const kk = localizeListing(item, "kk");
      expect(kk.title).not.toBe(item.title);
      expect(kk.summary).not.toBe(item.summary);
      expect(kk.id).toBe(item.id);
      expect(kk.category).toBe(item.category);
      expect(kk.source_url).toBe(item.source_url);
      expect(localizeListing(item, "ru")).toBe(item);
    }
  });
  it("finds the same place in either language and preserves category filtering", () => {
    expect(
      searchCatalogue(listings, "semey", "Все", "Қоңыр әулие").map((x) => x.id),
    ).toEqual([listings[6].id]);
    expect(
      searchCatalogue(listings, "semey", "Все", "Абай музейі").map((x) => x.id),
    ).toContain(listings[0].id);
    expect(searchCatalogue(listings, "semey", "Музеи", "Қоңыр")).toHaveLength(
      0,
    );
  });
  it("does not replace edited or user-authored content with an old curated translation", () => {
    const edited = {
      ...listings[0],
      title: "Новое название",
      summary: "Новый текст",
      address: "Другой адрес",
    };
    expect(localizeListing(edited, "kk")).toEqual(edited);
    const ugc = { ...listings[0], id: "different-id" };
    expect(localizeListing(ugc, "kk")).toBe(ugc);
    expect(translate("Пользовательский текст", "kk")).toBe(
      "Пользовательский текст",
    );
  });
});
describe("traceable open data snapshot", () => {
  it("ties the bundled figures to the exact official XLSX and downloadable copy", () => {
    const source = readFileSync("data/open/culture-2025-source.xlsx");
    expect(createHash("sha256").update(source).digest("hex")).toBe(
      cultureData.sha256,
    );
    expect(
      readFileSync("apps/web/public/open/culture-2025-source.xlsx"),
    ).toEqual(source);
    expect(
      JSON.parse(
        readFileSync("apps/web/public/open/culture-2025.json", "utf8"),
      ),
    ).toEqual(cultureData);
    expect(cultureData.as_of).toBe("2026-01-01");
    expect(cultureData.regions.semey).toMatchObject({
      museums: 10,
      theatres: 2,
    });
    expect(cultureData.regions.almaty).toMatchObject({
      museums: 22,
      theatres: 7,
    });
    expect(new URL(cultureData.source_url).hostname).toBe("stat.gov.kz");
  });
});
