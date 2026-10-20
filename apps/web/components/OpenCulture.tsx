"use client";
import { cultureData, type City } from "@qayda/domain";
import { usePreferences } from "./Preferences";

export function OpenCulture({
  city,
  onCategory,
  expanded = false,
}: {
  city: City;
  onCategory: (category: string) => void;
  expanded?: boolean;
}) {
  const { t } = usePreferences();
  const region = cultureData.regions[city];
  return (
    <section className="open-culture" aria-labelledby="culture-heading">
      <div className="section-title">
        <div>
          <span className="eyebrow">{t("Открытые данные")}</span>
          <h2 id="culture-heading">{t("Культура региона в цифрах")}</h2>
          <p>{t(region.name)}</p>
        </div>
        <a
          href={expanded ? cultureData.source_url : `/open-data?city=${city}`}
          target={expanded ? "_blank" : undefined}
          rel={expanded ? "noreferrer" : undefined}
          className="link"
        >
          {t("Источник и таблица")} ↗
        </a>
      </div>
      <div className="culture-facts">
        <div>
          <strong>{region.museums}</strong> <span>{t("музеев")}</span>
          <a
            href={
              expanded
                ? `/explore?city=${city}&category=${encodeURIComponent("Музеи")}`
                : "#ideas"
            }
            className="button secondary"
            onClick={() => onCategory("Музеи")}
          >
            {t("Посмотреть музеи")}
          </a>
        </div>
        <div>
          <strong>{region.theatres}</strong> <span>{t("театров")}</span>
          <a
            href={
              expanded
                ? `/explore?city=${city}&category=${encodeURIComponent("Театры")}`
                : "#ideas"
            }
            className="button secondary"
            onClick={() => onCategory("Театры")}
          >
            {t("Посмотреть театры")}
          </a>
        </div>
      </div>
      <p>
        {t("Данные БНС на 1 января 2026 года")}.{" "}
        {t("В каталоге Qayda показана только часть мест.")}
      </p>
      {expanded && (
        <div className="data-provenance">
          <p>
            {t("Это все учреждения региона, не число предложений в Qayda.")}
          </p>
          <p>
            {t("Снимок проверен 21.10.2026. Обновление не в реальном времени.")}
          </p>
          <div className="row wrap">
            <a
              href={cultureData.source_url}
              className="button secondary"
              target="_blank"
              rel="noreferrer"
            >
              stat.gov.kz ↗
            </a>
            <a
              href="/open/culture-2025.json"
              className="button secondary"
              download
            >
              {t("Скачать данные JSON")}
            </a>
            <a
              href="/open/culture-2025-source.xlsx"
              className="button secondary"
              download
            >
              {t("Скачать исходную таблицу")}
            </a>
          </div>
          <p className="muted">
            SHA-256: <code className="source-hash">{cultureData.sha256}</code>
          </p>
        </div>
      )}
    </section>
  );
}
