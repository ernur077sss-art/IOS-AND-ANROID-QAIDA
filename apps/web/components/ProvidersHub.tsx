"use client";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type FormEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Car,
  Compass,
  Building2,
  MapPin,
  ArrowUpRight,
  Phone,
  Users,
  Clock,
  Check,
  Briefcase,
} from "lucide-react";
import { api, humanError, type Client } from "@qayda/api-client";
import {
  providerKinds,
  offerKinds,
  requestStatuses,
  reviewStatuses,
  providerFields,
  offerFields,
  partnerDefaults,
  providerPayload,
  normalizePhone,
  localToUtc,
  parseMoney,
  money,
  planDate,
  safeUrl,
  type Provider,
  type ServiceOffer,
  type TripRequest,
  type Listing,
  type Plan,
  type PartnerField,
} from "@qayda/domain";
import { Photo, Empty } from "./ui";
const localInput = (v: string) =>
  new Date(new Date(v).getTime() + 5 * 3600000).toISOString().slice(0, 16);
const price = (o: ServiceOffer) =>
  o.price_minor === null
    ? "Стоимость по запросу"
    : `${money(String(o.price_minor))} ${o.price_basis === "person" ? "за человека" : "за компанию"}`;
const icon = (kind: string) =>
  kind === "driver"
    ? Car
    : kind === "company"
      ? Building2
      : kind === "host"
        ? Briefcase
        : Compass;
function PartnerInputs({
  fields,
  values,
  setValues,
}: {
  fields: PartnerField[];
  values: Record<string, string>;
  setValues: (v: Record<string, string>) => void;
}) {
  return (
    <>
      {fields.map((f) => (
        <label className="field" key={f.key}>
          {f.label}
          {!f.optional && " *"}
          {f.options ? (
            <select
              name={f.key}
              value={values[f.key] ?? ""}
              onChange={(e) =>
                setValues({ ...values, [f.key]: e.target.value })
              }
            >
              {Object.entries(f.options).map(([v, l]) => (
                <option value={v} key={v}>
                  {l}
                </option>
              ))}
            </select>
          ) : f.type === "multiline" ? (
            <textarea
              name={f.key}
              required={!f.optional}
              value={values[f.key] ?? ""}
              maxLength={f.key === "program" ? 4000 : 2000}
              onChange={(e) =>
                setValues({ ...values, [f.key]: e.target.value })
              }
            />
          ) : (
            <input
              name={f.key}
              type={f.type === "number" ? "number" : (f.type ?? "text")}
              step={f.type === "number" ? 1 : undefined}
              min={f.type === "number" ? 1 : undefined}
              required={!f.optional}
              value={values[f.key] ?? ""}
              maxLength={f.type === "number" ? undefined : 500}
              onChange={(e) =>
                setValues({ ...values, [f.key]: e.target.value })
              }
            />
          )}
        </label>
      ))}
    </>
  );
}
function OfferInfo({ offer }: { offer: ServiceOffer }) {
  return (
    <>
      <p className="offer-price">{price(offer)}</p>
      <div className="offer-facts">
        <span>
          <Clock size={16} />
          {offer.duration_minutes} мин.
        </span>
        <span>
          <Users size={16} />
          {offer.min_guests}–{offer.max_guests} гостей
        </span>
      </div>
      <p className="muted">
        {offerKinds[offer.kind]} · {offer.departure}
      </p>
      <details>
        <summary>Программа и условия</summary>
        <p className="preserve">{offer.program}</p>
        <h3>Включено</h3>
        <p className="preserve">{offer.included}</p>
        <h3>Отдельно</h3>
        <p className="preserve">{offer.excluded}</p>
        <h3>Отмена</h3>
        <p className="preserve">{offer.cancellation}</p>
      </details>
    </>
  );
}
export function ProvidersHub({
  db,
  user,
  path,
  listings,
  auth,
}: {
  db: Client | null;
  user: string | null;
  path: string;
  listings: Listing[];
  auth: ReactNode;
}) {
  const router = useRouter(),
    params = useSearchParams();
  const place = params.get("place");
  const [providers, setProviders] = useState<Provider[]>([]),
    [offers, setOffers] = useState<ServiceOffer[]>([]),
    [owned, setOwned] = useState<Provider[]>([]),
    [myOffers, setMyOffers] = useState<ServiceOffer[]>([]),
    [requests, setRequests] = useState<TripRequest[]>([]),
    [plans, setPlans] = useState<Plan[]>([]);
  const [queue, setQueue] = useState<{
    providers: Provider[];
    offers: ServiceOffer[];
  }>({ providers: [], offers: [] });
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [city, setCity] = useState<string>(
      listings.find((l) => l.id === place)?.city ?? "semey",
    ),
    [kind, setKind] = useState("all"),
    [query, setQuery] = useState("");
  const [editProvider, setEditProvider] = useState<Provider | null>(null),
    [pv, setPv] = useState(() => partnerDefaults(providerFields));
  const [editOffer, setEditOffer] = useState<ServiceOffer | null>(null),
    [ov, setOv] = useState(() => partnerDefaults(offerFields)),
    [providerId, setProviderId] = useState(""),
    [listingId, setListingId] = useState("");
  const [groupId, setGroupId] = useState(""),
    [group, setGroup] = useState<Awaited<ReturnType<typeof api.room>> | null>(
      null,
    ),
    [groupLoading, setGroupLoading] = useState(false);
  const requestKey = useRef("");
  const parts = path.split("/").filter(Boolean),
    section = parts[0],
    id = parts[1];
  useEffect(() => {
    const selected = listings.find((l) => l.id === place);
    if (selected) setCity(selected.city);
  }, [place, listings]);
  const load = useCallback(async () => {
    if (!db) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [p, o] = await Promise.all([api.providers(db), api.offers(db)]);
      setProviders(p);
      setOffers(o);
      if (user) {
        if (section === "partner") {
          const w = await api.providerWorkspace(db);
          setOwned(w.providers);
          setMyOffers(w.offers);
        }
        if (section === "partner-review") setQueue(await api.partnerQueue(db));
        if (section === "requests") setRequests(await api.tripRequests(db));
        if (section === "request")
          setPlans(
            (await api.plans(db)).filter(
              (p) =>
                p.owner_id === user &&
                ["proposed", "confirmed"].includes(p.status),
            ),
          );
      }
    } catch (e) {
      setError(humanError(e));
    } finally {
      setLoading(false);
    }
  }, [db, user, section]);
  useEffect(() => {
    void load();
  }, [load]);
  // Guard plan responses when the selected company changes.
  useEffect(() => {
    let live = true;
    setGroup(null);
    if (!db || !groupId) {
      setGroupLoading(false);
      return;
    }
    setGroupLoading(true);
    void api
      .room(db, groupId)
      .then((r) => {
        if (live) setGroup(r);
      })
      .catch((e) => {
        if (live) setError(humanError(e));
      })
      .finally(() => {
        if (live) setGroupLoading(false);
      });
    return () => {
      live = false;
    };
  }, [db, groupId]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  };
  const submit =
    (fn: (d: FormData) => Promise<void>) => (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const d = new FormData(e.currentTarget);
      void run(() => fn(d));
    };
  const heading = (title: string, copy?: string) => (
    <div className="page-heading">
      <div>
        <span className="eyebrow">QAYDA · ОДНОМУ И С ДРУЗЬЯМИ</span>
        <h1>{title}</h1>
        {copy && <p className="muted">{copy}</p>}
      </div>
    </div>
  );
  const controls = (
    <div className="row wrap">
      {section !== "providers" || id ? (
        <a className="button secondary" href="/providers">
          Исполнители
        </a>
      ) : null}
      <a className="button secondary" href="/requests">
        Мои заявки
      </a>
      <a className="button" href="/partner">
        Предложить услуги
      </a>
    </div>
  );
  let content: ReactNode;
  if (!db)
    content = (
      <Empty title="Подключите каталог исполнителей">
        Действующие контакты и заявки доступны с подключённой базой данных.
      </Empty>
    );
  else if (
    ["partner", "requests", "request", "partner-review"].includes(section) &&
    !user
  )
    content = auth;
  else if (loading)
    content = (
      <div
        className="skeleton"
        role="status"
        aria-label="Загрузка исполнителей"
      />
    );
  else if (section === "partner-review")
    content = (
      <>
        {heading("Проверка исполнителей")}
        {[
          ...queue.providers.map((p) => ({ kind: "provider", p })),
          ...queue.offers.map((p) => ({ kind: "offer", p })),
        ].map(({ kind, p }) => (
          <article className="card" key={p.id}>
            <h2>{"name" in p ? p.name : p.title}</h2>
            {"description" in p ? (
              <>
                <p>{p.description}</p>
                <p>
                  {p.phone} {p.contact_url}
                </p>
                <p>
                  {providerKinds[p.kind]} · {p.city}
                </p>
                {p.kind === "driver" && (
                  <p>
                    {p.vehicle} · {p.seats} мест
                  </p>
                )}
              </>
            ) : (
              <OfferInfo offer={p} />
            )}
            <p className="muted">
              Редактор проверяет контакты и условия вне Qayda. Одобрение не
              подтверждает наличие мест на конкретную дату.
            </p>
            <form
              onSubmit={submit(async (d) => {
                await api.reviewPartner(
                  db,
                  kind,
                  p.id,
                  p.version,
                  d.get("action") === "publish",
                  String(d.get("reason")),
                );
                await load();
              })}
            >
              <label className="field">
                Причина отказа
                <textarea name="reason" maxLength={2000} />
              </label>
              <div className="row wrap">
                <button
                  name="action"
                  value="publish"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api.reviewPartner(db, kind, p.id, p.version, true);
                      await load();
                    })
                  }
                >
                  Опубликовать
                </button>
                <button className="secondary" disabled={busy}>
                  Отклонить
                </button>
              </div>
            </form>
          </article>
        ))}
        {!queue.providers.length && !queue.offers.length && (
          <Empty title="Очередь пуста">
            Новые профили и услуги появятся здесь после отправки.
          </Empty>
        )}
      </>
    );
  else if (section === "partner")
    content = (
      <>
        {heading(
          "Кабинет исполнителя",
          "Гиды, водители, турфирмы и местные организаторы. Контакты появятся после проверки.",
        )}
        {controls}
        <div className="partner-columns">
          <section>
            <h2>Ваши профили</h2>
            {owned.map((p) => (
              <article className="card" key={p.id}>
                <span className="eyebrow">{reviewStatuses[p.status]}</span>
                <h3>{p.name}</h3>
                {p.rejection_reason && (
                  <p className="banner">{p.rejection_reason}</p>
                )}
                <button
                  className="secondary"
                  onClick={() => {
                    setEditProvider(p);
                    setPv(
                      Object.fromEntries(
                        providerFields.map((f) => [
                          f.key,
                          String(p[f.key as keyof Provider] ?? ""),
                        ]),
                      ),
                    );
                  }}
                >
                  Редактировать профиль
                </button>
              </article>
            ))}
            <form
              className="card"
              onSubmit={submit(async (d) => {
                await api.saveProvider(db, {
                  ...providerPayload(pv),
                  id: editProvider?.id,
                  version: editProvider?.version,
                  publish_contacts: d.get("publish_contacts"),
                });
                setEditProvider(null);
                setPv(partnerDefaults(providerFields));
                setNotice("Профиль отправлен на проверку");
                await load();
              })}
            >
              <h2>{editProvider ? "Изменить профиль" : "Новый профиль"}</h2>
              <PartnerInputs
                fields={providerFields}
                values={pv}
                setValues={setPv}
              />
              <label className="checkbox">
                <input name="publish_contacts" type="checkbox" required />
                Разрешаю публиковать указанные контакты и подтверждаю право
                размещать эти сведения
              </label>
              <p className="muted">
                Правка опубликованного профиля отправляет его на повторную
                проверку.
              </p>
              <button disabled={busy}>Отправить профиль на проверку</button>
              {editProvider && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setEditProvider(null);
                    setPv(partnerDefaults(providerFields));
                  }}
                >
                  Новый профиль
                </button>
              )}
            </form>
          </section>
          <section>
            <h2>Ваши услуги</h2>
            {myOffers.map((o) => (
              <article className="card" key={o.id}>
                <span className="eyebrow">{reviewStatuses[o.status]}</span>
                <h3>{o.title}</h3>
                {o.rejection_reason && (
                  <p className="banner">{o.rejection_reason}</p>
                )}
                <OfferInfo offer={o} />
                <button
                  className="secondary"
                  onClick={() => {
                    setEditOffer(o);
                    setProviderId(o.provider_id);
                    setListingId(o.listing_id);
                    setOv({
                      ...Object.fromEntries(
                        offerFields.map((f) => [
                          f.key,
                          String(o[f.key as keyof ServiceOffer] ?? ""),
                        ]),
                      ),
                      price:
                        o.price_minor === null
                          ? ""
                          : String(Number(o.price_minor) / 100),
                    });
                  }}
                >
                  Редактировать услугу
                </button>
              </article>
            ))}
            {owned.length > 0 ? (
              <form
                className="card"
                onSubmit={submit(async () => {
                  await api.saveOffer(db, {
                    ...ov,
                    id: editOffer?.id,
                    version: editOffer?.version,
                    provider_id: providerId || owned[0].id,
                    listing_id: listingId || listings[0]?.id,
                    price_minor: ov.price
                      ? parseMoney(ov.price).toString()
                      : null,
                  });
                  setEditOffer(null);
                  setOv(partnerDefaults(offerFields));
                  setNotice("Услуга отправлена на проверку");
                  await load();
                })}
              >
                <h2>{editOffer ? "Изменить услугу" : "Новая услуга"}</h2>
                <label className="field">
                  Ваш профиль
                  <select
                    aria-label="Ваш профиль"
                    value={providerId || owned[0].id}
                    onChange={(e) => setProviderId(e.target.value)}
                  >
                    {owned.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Место или направление
                  <select
                    aria-label="Место или направление"
                    value={listingId || listings[0]?.id}
                    onChange={(e) => setListingId(e.target.value)}
                  >
                    {listings.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.title}
                      </option>
                    ))}
                  </select>
                </label>
                <PartnerInputs
                  fields={offerFields}
                  values={ov}
                  setValues={setOv}
                />
                <button disabled={busy}>Отправить услугу на проверку</button>
                {editOffer && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setEditOffer(null);
                      setOv(partnerDefaults(offerFields));
                    }}
                  >
                    Новая услуга
                  </button>
                )}
              </form>
            ) : (
              <Empty title="Сначала создайте профиль">
                После этого можно добавить программу экскурсии, транспорт или
                тур.
              </Empty>
            )}
          </section>
        </div>
      </>
    );
  else if (section === "request") {
    const o = offers.find((x) => x.id === id),
      p = providers.find((x) => x.id === o?.provider_id);
    const going =
      group?.rsvps.filter(
        (r) =>
          r.answer === "going" &&
          r.acknowledged_version === group.plan.version &&
          group.members.some(
            (m) => m.user_id === r.user_id && m.status === "active",
          ),
      ).length ?? 0;
    content =
      o && p ? (
        <div className="narrow">
          {heading("Запросить поездку", `${p.name} · ${o.title}`)}
          <Photo listingId={o.listing_id} />
          <div className="card">
            <OfferInfo offer={o} />
          </div>
          <form
            className="card"
            onSubmit={submit(async (d) => {
              requestKey.current ||= crypto.randomUUID();
              await api.sendTripRequest(db, {
                offer_id: o.id,
                offer_version: o.version,
                plan_id: groupId || null,
                plan_version: group?.plan.version,
                guests: groupId ? going : Number(d.get("guests")),
                starts_at: group
                  ? group.plan.starts_at
                  : localToUtc(String(d.get("starts"))),
                contact_name: String(d.get("contact_name")),
                contact_phone: normalizePhone(String(d.get("contact_phone"))),
                note: String(d.get("note")),
                contact_consent: d.get("consent"),
                request_key: requestKey.current,
              });
              requestKey.current = "";
              router.push("/requests");
            })}
          >
            <label className="field">
              Для кого поездка
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
              >
                <option value="">Для себя / самостоятельная заявка</option>
                {plans
                  .filter((p) => p.listing_id === o.listing_id)
                  .map((p) => (
                    <option value={p.id} key={p.id}>
                      Компания: {p.title}
                    </option>
                  ))}
              </select>
            </label>
            {groupId ? (
              <p className="notice">
                {groupLoading
                  ? "Загружаем состав…"
                  : `${going} согласившихся · ${group ? planDate(group.plan.starts_at) : ""}`}
                . <a href={`/plans/${groupId}`}>Открыть комнату</a>
              </p>
            ) : (
              <>
                <label className="field">
                  Количество гостей
                  <input
                    name="guests"
                    type="number"
                    min={o.min_guests}
                    max={o.max_guests}
                    defaultValue={o.min_guests}
                    required
                  />
                </label>
                <label className="field">
                  Желаемые дата и время · Алматы
                  <input name="starts" type="datetime-local" required />
                </label>
              </>
            )}
            <label className="field">
              Контактное лицо
              <input
                name="contact_name"
                autoComplete="name"
                maxLength={80}
                required
              />
            </label>
            <label className="field">
              Телефон для ответа
              <input
                name="contact_phone"
                type="tel"
                autoComplete="tel"
                placeholder="+7 700 123 45 67"
                required
              />
            </label>
            <label className="field">
              Пожелания, дети, багаж
              <textarea name="note" maxLength={2000} />
            </label>
            <label className="checkbox">
              <input name="consent" type="checkbox" required />
              Разрешаю передать указанное имя и телефон этому исполнителю для
              ответа на заявку
            </label>
            <p className="muted">
              Это запрос доступности. Дата и итоговая стоимость будут предложены
              исполнителем. Оплата в Qayda не производится.
            </p>
            <button
              disabled={
                busy || groupLoading || (!!groupId && (!group || going < 1))
              }
            >
              Отправить заявку
            </button>
          </form>
        </div>
      ) : (
        <Empty title="Услуга недоступна">
          Предложение могло уйти на повторную проверку. Выберите опубликованную
          услугу.
        </Empty>
      );
  } else if (section === "requests")
    content = (
      <>
        {heading("Мои заявки", "Исходящие заявки и обращения к вашим услугам.")}
        {controls}
        <button className="text-button" onClick={() => void load()}>
          Обновить заявки
        </button>
        {requests.map((r) => (
          <article className="card request-card" key={r.id}>
            <span className="request-status">{requestStatuses[r.status]}</span>
            <h2>{r.offer_snapshot.title}</h2>
            <p>
              {r.is_provider ? "Входящая заявка" : "Ваша заявка"} ·{" "}
              {r.provider_name} · {r.guests} гостей
            </p>
            <p>
              <MapPin size={16} />
              {r.offer_snapshot.departure} · {planDate(r.starts_at)}
            </p>
            <p>
              Контакт: {r.contact_name} ·{" "}
              <a href={`tel:${r.contact_phone}`}>{r.contact_phone}</a>
            </p>
            {r.note && <p className="preserve">{r.note}</p>}
            <details>
              <summary>Согласуемая программа и история</summary>
              <OfferInfo offer={r.offer_snapshot} />
              {r.events.map((e, i) => (
                <p className="muted" key={i}>
                  {planDate(e.created_at)} ·{" "}
                  {(
                    {
                      sent: "Заявка отправлена",
                      propose: "Исполнитель предложил условия",
                      accept: "Клиент принял условия",
                      decline: "Исполнитель отказал",
                      cancel: "Клиент отменил",
                    } as Record<string, string>
                  )[e.action] ?? e.action}
                </p>
              ))}
            </details>
            {r.proposed_starts && (
              <div className="notice">
                <strong>Предложение исполнителя</strong>
                <p>
                  {planDate(r.proposed_starts)} ·{" "}
                  {r.proposed_total_minor !== null &&
                    money(String(r.proposed_total_minor))}{" "}
                  за всех гостей
                </p>
                <p className="preserve">{r.response}</p>
              </div>
            )}
            {r.is_provider && ["sent", "proposed"].includes(r.status) && (
              <form
                onSubmit={submit(async (d) => {
                  await api.respondTripRequest(
                    db,
                    r.id,
                    r.version,
                    "propose",
                    localToUtc(String(d.get("starts"))),
                    parseMoney(String(d.get("total"))).toString(),
                    String(d.get("message")),
                  );
                  await load();
                })}
              >
                <label className="field">
                  Предлагаемая дата и время · Алматы
                  <input
                    name="starts"
                    type="datetime-local"
                    defaultValue={localInput(r.proposed_starts || r.starts_at)}
                    required
                  />
                </label>
                <label className="field">
                  Итоговая стоимость за всех, ₸
                  <input
                    name="total"
                    inputMode="decimal"
                    required
                    defaultValue={
                      r.proposed_total_minor !== null
                        ? String(Number(r.proposed_total_minor) / 100)
                        : r.offer_snapshot.price_minor !== null
                          ? String(
                              (Number(r.offer_snapshot.price_minor) *
                                (r.offer_snapshot.price_basis === "person"
                                  ? r.guests
                                  : 1)) /
                                100,
                            )
                          : ""
                    }
                  />
                </label>
                <label className="field">
                  Ответ клиенту
                  <textarea name="message" maxLength={2000} />
                </label>
                <div className="row wrap">
                  <button disabled={busy}>Предложить условия</button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={(e) => {
                      const form = e.currentTarget.form!;
                      const message = String(new FormData(form).get("message"));
                      void run(async () => {
                        await api.respondTripRequest(
                          db,
                          r.id,
                          r.version,
                          "decline",
                          null,
                          null,
                          message,
                        );
                        await load();
                      });
                    }}
                  >
                    Отказать с причиной
                  </button>
                </div>
              </form>
            )}
            {!r.is_provider && r.status === "proposed" && (
              <>
                <p className="muted">
                  Принимая условия, вы соглашаетесь с указанными датой, суммой и
                  правилами отмены.{" "}
                  {r.plan_id &&
                    "Бюджет компании должен покрывать эту сумму и быть согласован всеми текущими участниками. При другой дате или изменении состава создайте новую заявку."}
                </p>
                {r.plan_id && (
                  <a className="button secondary" href={`/plans/${r.plan_id}`}>
                    Открыть бюджет компании
                  </a>
                )}
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api.respondTripRequest(
                        db,
                        r.id,
                        r.version,
                        "accept",
                      );
                      await load();
                    })
                  }
                >
                  Принять условия
                </button>
              </>
            )}
            {!r.is_provider &&
              ["sent", "proposed", "confirmed"].includes(r.status) && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api.respondTripRequest(
                        db,
                        r.id,
                        r.version,
                        "cancel",
                      );
                      await load();
                    })
                  }
                >
                  Отменить заявку
                </button>
              )}
            {r.status === "declined" && <p>{r.response}</p>}
          </article>
        ))}
        {!requests.length && (
          <Empty title="Заявок пока нет">
            Выберите услугу исполнителя: отправить запрос можно и на одного
            человека.
          </Empty>
        )}
      </>
    );
  else {
    const p = id ? providers.find((p) => p.id === id) : null;
    content = p ? (
      <>
        <div className="provider-cover">
          {heading(p.name, providerKinds[p.kind])}
          <p>{p.description}</p>
          <div className="row wrap">
            <span className="tag">
              {p.managed
                ? "Профиль проверен редактором"
                : "Справочные контакты · условия уточняются"}
            </span>
            <span>{p.languages}</span>
          </div>
          {p.kind === "driver" && (
            <p>
              {p.vehicle || "Автомобиль уточняется"} ·{" "}
              {p.seats
                ? `${p.seats} пассажирских мест`
                : "Число мест уточняется"}
            </p>
          )}
          <div className="row wrap">
            {p.phone && (
              <a className="button" href={`tel:${p.phone}`}>
                <Phone size={18} />
                {p.phone}
              </a>
            )}
            {safeUrl(p.contact_url) && (
              <a
                className="button secondary"
                href={p.contact_url!}
                target="_blank"
                rel="noreferrer"
              >
                Связаться на сайте <ArrowUpRight size={18} />
              </a>
            )}
          </div>
          {safeUrl(p.source_url) && (
            <p className="muted">
              <a href={p.source_url!} target="_blank" rel="noreferrer">
                Источник сведений ↗
              </a>{" "}
              · {p.checked_at && planDate(p.checked_at)}
            </p>
          )}
          {!p.managed && (
            <p className="muted">
              Исполнитель не управляет заявками в Qayda. Свяжитесь напрямую и
              уточните актуальную программу, даты и стоимость.
            </p>
          )}
        </div>
        <h2>Услуги и программы</h2>
        <div className="cards">
          {offers
            .filter((o) => o.provider_id === p.id)
            .map((o) => (
              <article className="listing" key={o.id}>
                <Photo listingId={o.listing_id} />
                <div className="listing-body">
                  <span className="eyebrow">{offerKinds[o.kind]}</span>
                  <h3>{o.title}</h3>
                  <OfferInfo offer={o} />
                  <a className="button" href={`/request/${o.id}`}>
                    Запросить поездку
                  </a>
                </div>
              </article>
            ))}
        </div>
        {!offers.some((o) => o.provider_id === p.id) && (
          <Empty title="Пока нет услуг для заявки в Qayda">
            Контакты выше доступны без регистрации. Текущие условия уточняйте у
            исполнителя.
          </Empty>
        )}
      </>
    ) : id ? (
      <Empty title="Профиль недоступен">
        Вернитесь в каталог исполнителей.
      </Empty>
    ) : (
      <>
        {heading(
          "С кем поехать",
          "Гиды, водители и организаторы. Найдите помощь для своей поездки — одному или с друзьями.",
        )}
        {controls}
        <div className="provider-filters">
          <label className="field">
            Направление
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="semey">Семей и область Абай</option>
              <option value="almaty">Алматы</option>
            </select>
          </label>
          <label className="field">
            Кого ищете
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">Все исполнители</option>
              {Object.entries(providerKinds).map(([k, n]) => (
                <option key={k} value={k}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Поиск
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Имя, услуга, направление"
            />
          </label>
        </div>
        {place && (
          <div className="notice">
            Предложения для:{" "}
            {listings.find((l) => l.id === place)?.title ?? "выбранного места"}.{" "}
            <a href="/providers">Все исполнители</a>
          </div>
        )}
        <div className="cards">
          {providers
            .filter(
              (p) =>
                p.city === city &&
                (kind === "all" || p.kind === kind) &&
                `${p.name} ${p.description}`
                  .toLocaleLowerCase("ru")
                  .includes(query.toLocaleLowerCase("ru")) &&
                (!place ||
                  offers.some(
                    (o) => o.listing_id === place && o.provider_id === p.id,
                  ) ||
                  p.listing_ids?.includes(place)),
            )
            .map((p) => {
              const I = icon(p.kind);
              return (
                <article className="card provider-card" key={p.id}>
                  <div className="provider-avatar">
                    <I size={30} />
                  </div>
                  <span className="eyebrow">{providerKinds[p.kind]}</span>
                  <h2>
                    <a href={`/providers/${p.id}`}>{p.name}</a>
                  </h2>
                  <p>{p.description}</p>
                  <span className="tag">
                    {p.managed ? (
                      <>
                        <Check size={14} />
                        Профиль проверен
                      </>
                    ) : (
                      "Справочные контакты"
                    )}
                  </span>
                  <p className="muted">
                    {p.languages}
                    {p.seats ? ` · ${p.seats} мест` : ""}
                  </p>
                  <a className="link" href={`/providers/${p.id}`}>
                    Контакты и услуги →
                  </a>
                </article>
              );
            })}
        </div>
        {!providers.some(
          (p) =>
            p.city === city &&
            (kind === "all" || p.kind === kind) &&
            `${p.name} ${p.description}`
              .toLocaleLowerCase("ru")
              .includes(query.toLocaleLowerCase("ru")) &&
            (!place ||
              offers.some(
                (o) => o.listing_id === place && o.provider_id === p.id,
              ) ||
              p.listing_ids?.includes(place)),
        ) && (
          <Empty title="Исполнители ещё не добавлены">
            Мы не публикуем вымышленные контакты. Предложите свои услуги —
            профиль появится после проверки.
          </Empty>
        )}
      </>
    );
  }
  return (
    <>
      {error && (
        <div className="error" role="alert">
          {error}
          <button onClick={() => void load()} className="text-button">
            Повторить загрузку
          </button>
        </div>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {content}
    </>
  );
}
