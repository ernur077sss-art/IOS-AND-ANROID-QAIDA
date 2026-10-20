"use client";
import { useState, type FormEvent } from "react";
import { api, humanError, type Client } from "@qayda/api-client";
import { cities, categories, safeUrl, type Listing } from "@qayda/domain";
export function CatalogEditor({
  db,
  listings,
}: {
  db: Client;
  listings: Listing[];
}) {
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const l = listings.find((x) => x.id === selected);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!safeUrl(String(data.get("source_url"))))
        throw new Error("Укажите https-ссылку без логина и пароля");
      await api.saveCatalog(db, {
        ...Object.fromEntries(data),
        id: selected || null,
      });
      setNotice(
        "Карточка сохранена. Обновите каталог, чтобы увидеть изменения.",
      );
    } catch (error) {
      setError(humanError(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="card">
      <h2>Каталог и источники</h2>
      <p>
        Откройте первоисточник и проверьте сведения перед публикацией.
        Неизвестные цены и расписания остаются неизвестными. Иллюстрации Qayda
        не являются фотографиями объекта.
      </p>
      <label className="field">
        Карточка
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Добавить редакционную карточку</option>
          {listings.map((x) => (
            <option key={x.id} value={x.id}>
              {x.title}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <form key={selected} onSubmit={submit}>
        <label className="field">
          Название
          <input
            name="title"
            required
            minLength={3}
            maxLength={160}
            defaultValue={l?.title}
          />
        </label>
        <label className="field">
          Город
          <select name="city" defaultValue={l?.city}>
            {cities.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Категория
          <select name="category" defaultValue={l?.category}>
            {categories.slice(1).map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Краткое описание
          <textarea
            name="summary"
            required
            minLength={10}
            maxLength={4000}
            defaultValue={l?.summary}
          />
        </label>
        <label className="field">
          Публичный адрес
          <input name="address" defaultValue={l?.address ?? ""} />
        </label>
        <label className="field">
          Источник
          <input
            name="source_url"
            type="url"
            required
            defaultValue={l?.source_url ?? ""}
          />
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            name="out_of_city"
            defaultChecked={l?.out_of_city}
          />
          Выездное направление за городом
        </label>
        <label className="checkbox">
          <input type="checkbox" name="verified" />Я проверил название,
          описание, город и указанный адрес по источнику. Зафиксировать дату
          проверки.
        </label>
        <label className="field">
          Публикация
          <select name="publication_status" defaultValue="draft">
            <option value="draft">Черновик</option>
            <option value="published">Опубликовать</option>
          </select>
        </label>
        <button disabled={busy}>
          {busy ? "Сохраняем…" : "Сохранить карточку"}
        </button>
      </form>
    </section>
  );
}
