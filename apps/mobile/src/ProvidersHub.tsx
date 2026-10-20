import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import * as Crypto from "expo-crypto";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Linking,
  ActivityIndicator,
} from "react-native";
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
import { Button, Field, Card, Heading, Copy, Art } from "./ui";
import { color, s } from "./theme";
const localInput = (v: string) =>
  new Date(new Date(v).getTime() + 5 * 3600000).toISOString().slice(0, 16);
const offerPrice = (o: ServiceOffer) =>
  o.price_minor === null
    ? "Стоимость по запросу"
    : `${money(String(o.price_minor))} ${o.price_basis === "person" ? "за человека" : "за компанию"}`;
function Inputs({
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
        <View key={f.key}>
          {f.options ? (
            <>
              <Copy>{f.label} *</Copy>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={s.chips}>
                  {Object.entries(f.options).map(([v, l]) => (
                    <Button
                      key={v}
                      secondary={values[f.key] !== v}
                      onPress={() => setValues({ ...values, [f.key]: v })}
                    >
                      {l}
                    </Button>
                  ))}
                </View>
              </ScrollView>
            </>
          ) : (
            <Field
              label={f.label + (f.optional ? "" : " *")}
              value={values[f.key] ?? ""}
              onChange={(v) => setValues({ ...values, [f.key]: v })}
              multiline={f.type === "multiline"}
              keyboardType={
                f.type === "number"
                  ? "numeric"
                  : f.key === "price"
                    ? "decimal-pad"
                    : "default"
              }
            />
          )}
        </View>
      ))}
    </>
  );
}
function Consent({
  value,
  onChange,
  children,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={{ paddingVertical: 12, minHeight: 44 }}
    >
      <Text style={s.copy}>
        {value ? "☑" : "☐"} {children}
      </Text>
    </Pressable>
  );
}
function OfferInfo({ o }: { o: ServiceOffer }) {
  return (
    <>
      <Text style={s.price}>{offerPrice(o)}</Text>
      <Copy>
        {offerKinds[o.kind]} · {o.duration_minutes} мин. · {o.min_guests}–
        {o.max_guests} гостей
      </Copy>
      <Copy>{o.departure}</Copy>
      <Heading>Программа</Heading>
      <Copy>{o.program}</Copy>
      <Copy>Включено: {o.included}</Copy>
      <Copy>Отдельно: {o.excluded}</Copy>
      <Copy>Отмена: {o.cancellation}</Copy>
    </>
  );
}
export function NativeProvidersHub({
  db,
  user,
  path,
  listings,
  auth,
  go,
  place,
}: {
  db: Client | null;
  user: string | null;
  path: string;
  listings: Listing[];
  auth: ReactNode;
  go: (path: string) => void;
  place?: string;
}) {
  const parts = path.split("/").filter(Boolean),
    section = parts[0],
    id = parts[1];
  const [providers, setProviders] = useState<Provider[]>([]),
    [offers, setOffers] = useState<ServiceOffer[]>([]),
    [owned, setOwned] = useState<Provider[]>([]),
    [myOffers, setMyOffers] = useState<ServiceOffer[]>([]),
    [requests, setRequests] = useState<TripRequest[]>([]),
    [plans, setPlans] = useState<Plan[]>([]);
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
    [pv, setPv] = useState(() => partnerDefaults(providerFields)),
    [consent, setConsent] = useState(false);
  const [editOffer, setEditOffer] = useState<ServiceOffer | null>(null),
    [ov, setOv] = useState(() => partnerDefaults(offerFields)),
    [providerId, setProviderId] = useState(""),
    [listingId, setListingId] = useState("");
  const [requestValues, setRequestValues] = useState<Record<string, string>>({
      guests: "1",
      starts: "",
      contact_name: "",
      contact_phone: "",
      note: "",
    }),
    [contactConsent, setContactConsent] = useState(false);
  const [groupId, setGroupId] = useState(""),
    [group, setGroup] = useState<Awaited<ReturnType<typeof api.room>> | null>(
      null,
    ),
    [groupLoading, setGroupLoading] = useState(false);
  const [responses, setResponses] = useState<
    Record<string, Record<string, string>>
  >({});
  const requestKey = useRef("");
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
  const controls = (
    <>
      {section !== "providers" || id ? (
        <Button secondary onPress={() => go("/providers")}>
          Исполнители
        </Button>
      ) : null}
      <Button secondary onPress={() => go("/requests")}>
        Мои заявки
      </Button>
      <Button onPress={() => go("/partner")}>Предложить услуги</Button>
    </>
  );
  let content: ReactNode;
  if (!db)
    content = (
      <Copy>Каталог исполнителей доступен после подключения базы.</Copy>
    );
  else if (["partner", "request", "requests"].includes(section) && !user)
    content = auth;
  else if (loading) content = <ActivityIndicator color={color.forest} />;
  else if (section === "partner")
    content = (
      <>
        <Text style={s.h1}>Кабинет исполнителя</Text>
        <Copy>Профили и услуги публикуются после независимой проверки.</Copy>
        {controls}
        {owned.map((p) => (
          <Card key={p.id}>
            <Text style={s.eyebrow}>{reviewStatuses[p.status]}</Text>
            <Heading>{p.name}</Heading>
            {p.rejection_reason && <Copy>{p.rejection_reason}</Copy>}
            <Button
              secondary
              onPress={() => {
                setEditProvider(p);
                setPv(
                  Object.fromEntries(
                    providerFields.map((f) => [
                      f.key,
                      String(p[f.key as keyof Provider] ?? ""),
                    ]),
                  ),
                );
                setConsent(false);
              }}
            >
              Редактировать профиль
            </Button>
          </Card>
        ))}
        <Card>
          <Heading>
            {editProvider ? "Изменить профиль" : "Новый профиль"}
          </Heading>
          <Inputs fields={providerFields} values={pv} setValues={setPv} />
          <Consent value={consent} onChange={setConsent}>
            Разрешаю публиковать эти контакты и подтверждаю право размещать
            сведения
          </Consent>
          <Copy>Изменённый профиль проходит повторную проверку.</Copy>
          <Button
            disabled={busy || !consent}
            onPress={() =>
              void run(async () => {
                await api.saveProvider(db!, {
                  ...providerPayload(pv),
                  id: editProvider?.id,
                  version: editProvider?.version,
                  publish_contacts: consent,
                });
                setEditProvider(null);
                setPv(partnerDefaults(providerFields));
                setConsent(false);
                await load();
                setNotice("Профиль отправлен на проверку");
              })
            }
          >
            Отправить профиль на проверку
          </Button>
          {editProvider && (
            <Button
              secondary
              onPress={() => {
                setEditProvider(null);
                setPv(partnerDefaults(providerFields));
                setConsent(false);
              }}
            >
              Новый профиль
            </Button>
          )}
        </Card>
        <Heading>Ваши услуги</Heading>
        {myOffers.map((o) => (
          <Card key={o.id}>
            <Text style={s.eyebrow}>{reviewStatuses[o.status]}</Text>
            <Heading>{o.title}</Heading>
            {o.rejection_reason && <Copy>{o.rejection_reason}</Copy>}
            <Text style={s.price}>{offerPrice(o)}</Text>
            <Button
              secondary
              onPress={() => {
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
            </Button>
          </Card>
        ))}
        {owned.length > 0 && (
          <Card>
            <Heading>{editOffer ? "Изменить услугу" : "Новая услуга"}</Heading>
            <Inputs
              fields={[
                {
                  key: "provider_id",
                  label: "Ваш профиль",
                  options: Object.fromEntries(owned.map((p) => [p.id, p.name])),
                },
                {
                  key: "listing_id",
                  label: "Место",
                  options: Object.fromEntries(
                    listings.map((l) => [l.id, l.title]),
                  ),
                },
              ]}
              values={{
                provider_id: providerId || owned[0].id,
                listing_id: listingId || listings[0]?.id || "",
              }}
              setValues={(v) => {
                setProviderId(v.provider_id);
                setListingId(v.listing_id);
              }}
            />
            <Inputs fields={offerFields} values={ov} setValues={setOv} />
            <Button
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  await api.saveOffer(db!, {
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
                  await load();
                  setNotice("Услуга отправлена на проверку");
                })
              }
            >
              Отправить услугу на проверку
            </Button>
            {editOffer && (
              <Button
                secondary
                onPress={() => {
                  setEditOffer(null);
                  setOv(partnerDefaults(offerFields));
                }}
              >
                Новая услуга
              </Button>
            )}
          </Card>
        )}
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
        <>
          <Text style={s.h1}>Запросить поездку</Text>
          <Copy>
            {p.name} · {o.title}
          </Copy>
          <Art listingId={o.listing_id} />
          <Card>
            <OfferInfo o={o} />
          </Card>
          <Card>
            <Heading>Для кого поездка</Heading>
            <Button secondary={!!groupId} onPress={() => setGroupId("")}>
              Для себя / самостоятельная заявка
            </Button>
            {plans
              .filter((x) => x.listing_id === o.listing_id)
              .map((x) => (
                <Button
                  key={x.id}
                  secondary={groupId !== x.id}
                  onPress={() => setGroupId(x.id)}
                >
                  Компания: {x.title}
                </Button>
              ))}
            {groupId ? (
              <>
                <Copy>
                  {groupLoading
                    ? "Загружаем…"
                    : `${going} согласившихся · ${group ? planDate(group.plan.starts_at) : ""}`}
                </Copy>
                <Button secondary onPress={() => go(`/plans/${groupId}`)}>
                  Открыть комнату
                </Button>
              </>
            ) : (
              <>
                <Field
                  label="Количество гостей"
                  keyboardType="numeric"
                  value={requestValues.guests}
                  onChange={(v) =>
                    setRequestValues({ ...requestValues, guests: v })
                  }
                />
                <Field
                  label="Дата и время · Алматы"
                  placeholder="2026-11-01T11:00"
                  value={requestValues.starts}
                  onChange={(v) =>
                    setRequestValues({ ...requestValues, starts: v })
                  }
                />
              </>
            )}
            <Inputs
              fields={[
                { key: "contact_name", label: "Контактное лицо" },
                {
                  key: "contact_phone",
                  label: "Телефон для ответа",
                  type: "tel",
                },
                {
                  key: "note",
                  label: "Пожелания, дети, багаж",
                  type: "multiline",
                  optional: true,
                },
              ]}
              values={requestValues}
              setValues={setRequestValues}
            />
            <Consent value={contactConsent} onChange={setContactConsent}>
              Разрешаю передать имя и телефон этому исполнителю для ответа
            </Consent>
            <Copy>
              Это запрос доступности. Дата и итоговая сумма будут согласованы
              отдельно. Оплата в Qayda не производится.
            </Copy>
            <Button
              disabled={
                busy ||
                !contactConsent ||
                groupLoading ||
                (!!groupId && (!group || going < 1))
              }
              onPress={() =>
                void run(async () => {
                  requestKey.current ||= Crypto.randomUUID();
                  await api.sendTripRequest(db!, {
                    offer_id: o.id,
                    offer_version: o.version,
                    plan_id: groupId || null,
                    plan_version: group?.plan.version,
                    guests: groupId ? going : Number(requestValues.guests),
                    starts_at: group
                      ? group.plan.starts_at
                      : localToUtc(requestValues.starts),
                    contact_name: requestValues.contact_name,
                    contact_phone: normalizePhone(requestValues.contact_phone),
                    note: requestValues.note,
                    contact_consent: contactConsent,
                    request_key: requestKey.current,
                  });
                  requestKey.current = "";
                  go("/requests");
                })
              }
            >
              Отправить заявку
            </Button>
          </Card>
        </>
      ) : (
        <Copy>Услуга недоступна. Выберите опубликованное предложение.</Copy>
      );
  } else if (section === "requests")
    content = (
      <>
        <Text style={s.h1}>Мои заявки</Text>
        {controls}
        <Button secondary onPress={() => void load()}>
          Обновить заявки
        </Button>
        {!requests.length && (
          <Copy>
            Заявок пока нет. Можно отправить запрос на одного человека или
            компанию.
          </Copy>
        )}
        {requests.map((r) => {
          const values = responses[r.id] ?? {
            starts: localInput(r.proposed_starts || r.starts_at),
            total:
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
                  : "",
            message: "",
          };
          return (
            <Card key={r.id}>
              <Text style={s.eyebrow}>{requestStatuses[r.status]}</Text>
              <Heading>{r.offer_snapshot.title}</Heading>
              <Copy>
                {r.is_provider ? "Входящая заявка" : "Ваша заявка"} ·{" "}
                {r.provider_name}
              </Copy>
              <Copy>
                {r.guests} гостей · {planDate(r.starts_at)}
              </Copy>
              <Copy>
                Контакт: {r.contact_name} · {r.contact_phone}
              </Copy>
              {r.note && <Copy>{r.note}</Copy>}
              {r.proposed_starts && (
                <>
                  <Heading>Условия исполнителя</Heading>
                  <Copy>
                    {planDate(r.proposed_starts)} ·{" "}
                    {money(String(r.proposed_total_minor))} за всех
                  </Copy>
                  <Copy>{r.response}</Copy>
                </>
              )}
              {r.is_provider && ["sent", "proposed"].includes(r.status) && (
                <>
                  <Inputs
                    fields={[
                      { key: "starts", label: "Предлагаемая дата · Алматы" },
                      { key: "total", label: "Итоговая сумма за всех, ₸" },
                      {
                        key: "message",
                        label: "Ответ клиенту",
                        type: "multiline",
                        optional: true,
                      },
                    ]}
                    values={values}
                    setValues={(v) => setResponses({ ...responses, [r.id]: v })}
                  />
                  <Button
                    disabled={busy}
                    onPress={() =>
                      void run(async () => {
                        await api.respondTripRequest(
                          db!,
                          r.id,
                          r.version,
                          "propose",
                          localToUtc(values.starts),
                          parseMoney(values.total).toString(),
                          values.message,
                        );
                        await load();
                      })
                    }
                  >
                    Предложить условия
                  </Button>
                  <Button
                    secondary
                    disabled={busy}
                    onPress={() =>
                      void run(async () => {
                        await api.respondTripRequest(
                          db!,
                          r.id,
                          r.version,
                          "decline",
                          null,
                          null,
                          values.message,
                        );
                        await load();
                      })
                    }
                  >
                    Отказать с причиной
                  </Button>
                </>
              )}
              {!r.is_provider && r.status === "proposed" && (
                <>
                  <Copy>
                    Вы принимаете указанные дату, сумму и правила отмены.
                    {r.plan_id
                      ? " Бюджет компании должен покрывать сумму и быть согласован всеми. При другой дате или составе создайте новую заявку."
                      : ""}
                  </Copy>
                  {r.plan_id && (
                    <Button secondary onPress={() => go(`/plans/${r.plan_id}`)}>
                      Открыть бюджет компании
                    </Button>
                  )}
                  <Button
                    disabled={busy}
                    onPress={() =>
                      void run(async () => {
                        await api.respondTripRequest(
                          db!,
                          r.id,
                          r.version,
                          "accept",
                        );
                        await load();
                      })
                    }
                  >
                    Принять условия
                  </Button>
                </>
              )}
              {!r.is_provider &&
                ["sent", "proposed", "confirmed"].includes(r.status) && (
                  <Button
                    secondary
                    disabled={busy}
                    onPress={() =>
                      void run(async () => {
                        await api.respondTripRequest(
                          db!,
                          r.id,
                          r.version,
                          "cancel",
                        );
                        await load();
                      })
                    }
                  >
                    Отменить заявку
                  </Button>
                )}
              {r.status === "declined" && <Copy>{r.response}</Copy>}
              <Heading>Зафиксированная программа</Heading>
              <OfferInfo o={r.offer_snapshot} />
              <Heading>История</Heading>
              {r.events.map((e, i) => (
                <Copy key={i}>
                  {planDate(e.created_at)} ·{" "}
                  {(
                    {
                      sent: "Отправлена",
                      propose: "Предложены условия",
                      accept: "Условия приняты",
                      decline: "Отказ",
                      cancel: "Отменена",
                    } as Record<string, string>
                  )[e.action] ?? e.action}
                </Copy>
              ))}
            </Card>
          );
        })}
      </>
    );
  else {
    const p = id ? providers.find((x) => x.id === id) : null;
    content = p ? (
      <>
        <Text style={s.h1}>{p.name}</Text>
        <Text style={s.eyebrow}>
          {providerKinds[p.kind]} ·{" "}
          {p.managed ? "Профиль проверен" : "Справочные контакты"}
        </Text>
        <Copy>{p.description}</Copy>
        <Copy>{p.languages}</Copy>
        {p.kind === "driver" && (
          <Copy>
            {p.vehicle || "Автомобиль уточняется"} ·{" "}
            {p.seats ? `${p.seats} пассажирских мест` : "Число мест уточняется"}
          </Copy>
        )}
        {p.phone && (
          <Button onPress={() => void Linking.openURL(`tel:${p.phone}`)}>
            Позвонить {p.phone}
          </Button>
        )}
        {safeUrl(p.contact_url) && (
          <Button
            secondary
            onPress={() => void Linking.openURL(p.contact_url!)}
          >
            Связаться на сайте ↗
          </Button>
        )}
        {safeUrl(p.source_url) && (
          <Button secondary onPress={() => void Linking.openURL(p.source_url!)}>
            Источник сведений ↗
          </Button>
        )}
        {p.checked_at && (
          <Copy>Сведения на сайте просмотрены {planDate(p.checked_at)}</Copy>
        )}
        {!p.managed && (
          <Copy>
            Исполнитель не управляет заявками в Qayda. Актуальные программы,
            даты и цены уточняйте напрямую.
          </Copy>
        )}
        <Heading>Услуги и программы</Heading>
        {offers
          .filter((o) => o.provider_id === p.id)
          .map((o) => (
            <Card key={o.id}>
              <Art listingId={o.listing_id} />
              <Heading>{o.title}</Heading>
              <OfferInfo o={o} />
              <Button onPress={() => go(`/request/${o.id}`)}>
                Запросить поездку
              </Button>
            </Card>
          ))}
        {!offers.some((o) => o.provider_id === p.id) && (
          <Copy>
            Пока нет услуг для заявки в Qayda. Контакты выше доступны без
            регистрации.
          </Copy>
        )}
      </>
    ) : id ? (
      <Copy>Профиль недоступен. Вернитесь в каталог.</Copy>
    ) : (
      <>
        <Text style={s.h1}>С кем поехать</Text>
        <Copy>
          Гиды, водители и организаторы — для поездки одному или с друзьями.
        </Copy>
        {controls}
        <Inputs
          fields={[
            {
              key: "city",
              label: "Направление",
              options: { semey: "Семей и область Абай", almaty: "Алматы" },
            },
            {
              key: "kind",
              label: "Кого ищете",
              options: { all: "Все", ...providerKinds },
            },
          ]}
          values={{ city, kind }}
          setValues={(v) => {
            setCity(v.city);
            setKind(v.kind);
          }}
        />
        <Field label="Поиск исполнителей" value={query} onChange={setQuery} />
        {place && (
          <Copy>
            Для места:{" "}
            {listings.find((l) => l.id === place)?.title ??
              "выбранное направление"}
          </Copy>
        )}
        {providers
          .filter(
            (p) =>
              p.city === city &&
              (kind === "all" || p.kind === kind) &&
              `${p.name} ${p.description}`
                .toLocaleLowerCase("ru")
                .includes(query.toLocaleLowerCase("ru")) &&
              (!place ||
                p.listing_ids?.includes(place) ||
                offers.some(
                  (o) => o.listing_id === place && o.provider_id === p.id,
                )),
          )
          .map((p) => (
            <Card key={p.id}>
              <Text style={s.eyebrow}>
                {providerKinds[p.kind]} ·{" "}
                {p.managed ? "Профиль проверен" : "Справочные контакты"}
              </Text>
              <Heading>{p.name}</Heading>
              <Copy lines={3}>{p.description}</Copy>
              <Button secondary onPress={() => go(`/providers/${p.id}`)}>
                Контакты и услуги →
              </Button>
            </Card>
          ))}
        {!providers.some(
          (p) =>
            p.city === city &&
            (kind === "all" || p.kind === kind) &&
            `${p.name} ${p.description}`
              .toLocaleLowerCase("ru")
              .includes(query.toLocaleLowerCase("ru")) &&
            (!place ||
              p.listing_ids?.includes(place) ||
              offers.some(
                (o) => o.listing_id === place && o.provider_id === p.id,
              )),
        ) && (
          <Card>
            <Heading>Исполнители ещё не добавлены</Heading>
            <Copy>
              Предложите свои услуги. Контакты появятся после проверки.
            </Copy>
          </Card>
        )}
      </>
    );
  }
  return (
    <>
      {error && (
        <View style={s.error}>
          <Text accessibilityRole="alert" style={{ color: color.error }}>
            {error}
          </Text>
          <Button secondary onPress={() => void load()}>
            Обновить данные
          </Button>
        </View>
      )}
      {notice && <Text style={s.banner}>{notice}</Text>}
      {content}
    </>
  );
}
