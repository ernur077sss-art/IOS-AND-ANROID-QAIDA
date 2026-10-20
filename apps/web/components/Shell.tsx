"use client";
import { DisplayControls, usePreferences } from "./Preferences";
import { OpenCulture } from "./OpenCulture";
import { localizeListing } from "@qayda/domain";
import { Field, Photo, PhotoCredit, Empty } from "./ui";
import { BudgetItemEditor } from "./BudgetItemEditor";
import { ProvidersHub } from "./ProvidersHub";
import { CatalogEditor } from "./CatalogEditor";
import {
  useEffect,
  useState,
  useCallback,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Compass,
  MapPin,
  ArrowUpRight,
  ArrowLeft,
  Heart,
  Users,
  CalendarDays,
  UserRound,
  Mountain,
  Search,
  Plus,
  Check,
  Send,
  Menu,
  Leaf,
  Landmark,
  Tent,
  Trees,
  Drama,
  Footprints,
  ArrowRight,
} from "lucide-react";
import { client, api, humanError, type Client } from "@qayda/api-client";
import {
  photos,
  searchCatalogue,
  cities,
  categories,
  demoListings,
  productFeatures,
  money,
  parseMoney,
  planDate,
  localToUtc,
  calendarIcs,
  mapUrl,
  safeUrl,
  answerLabels,
  statusLabels,
  overlaps,
  type Listing,
  type Plan,
  type Answer,
} from "@qayda/domain";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const db: Client | null = url && key ? client(url, key) : null;
type Room = Awaited<ReturnType<typeof api.room>>;
export function Shell() {
  const { t, locale } = usePreferences();
  const path = usePathname();
  const router = useRouter();
  const [guestName, setGuestName] = useState("");
  const [isGuest, setIsGuest] = useState(false);
  const [user, setUser] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [listings, setListings] = useState<Listing[]>(db ? [] : demoListings);
  const [loading, setLoading] = useState(!!db);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [city, setCity] = useState("semey");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Все");
  const [saved, setSaved] = useState<string[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [room, setRoom] = useState<Room | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [preview, setPreview] = useState<{
    title: string;
    expires_at: string;
  } | null>(null);
  const [inviteLink, setInviteLink] = useState("");
  const [submissions, setSubmissions] = useState<Listing[]>([]);
  const [submissionsLoaded, setSubmissionsLoaded] = useState(false);
  const [notifications, setNotifications] = useState<
    { id: string; body: string; created_at: string }[]
  >([]);
  const [queue, setQueue] = useState<Listing[]>([]);
  const createKey = useRef("");
  const messageKey = useRef("");
  const [tab, setTab] = useState("План");
  const [olderDone, setOlderDone] = useState(false);
  const parts = path.split("/").filter(Boolean);
  const section = parts[0] ?? "home";
  const selectedRecord = listings.find((x) => x.id === parts[1]);
  const selected = selectedRecord
    ? localizeListing(selectedRecord, locale)
    : undefined;
  const planId = section === "plans" ? parts[1] : undefined;
  const act = useCallback(async (fn: () => Promise<void>) => {
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
  }, []);
  const loadCatalog = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    try {
      setListings(await api.listings(db));
    } catch (e) {
      setError(humanError(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const preferredCity = params.get("city");
    const preferredCategory = params.get("category");
    if (preferredCity === "semey" || preferredCity === "almaty")
      setCity(preferredCity);
    if (preferredCategory && categories.includes(preferredCategory))
      setCategory(preferredCategory);
  }, []);
  const previousUser = useRef<string | null>(null);
  useEffect(() => {
    if (!db) {
      setReady(true);
      return;
    }
    let live = true;
    const accept = (id: string | null, guest = false) => {
      setIsGuest(guest);
      if (previousUser.current !== id) {
        setRoom(null);
        setPlans([]);
        setSaved([]);
        setSubmissions([]);
        setNotifications([]);
        setQueue([]);
        previousUser.current = id;
      }
      setUser(id);
    };
    db.auth.getSession().then(({ data, error }) => {
      if (live) {
        accept(
          data.session?.user.id ?? null,
          !!data.session?.user.is_anonymous,
        );
        setReady(true);
        if (error) setError(humanError(error));
      }
    });
    const { data } = db.auth.onAuthStateChange((_, session) => {
      accept(session?.user.id ?? null, !!session?.user.is_anonymous);
      setReady(true);
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);
  const reloadRoom = useCallback(async () => {
    if (!db || !planId) return;
    try {
      setRoom(await api.room(db, planId));
    } catch (e) {
      setRoom(null);
      throw e;
    }
  }, [planId]);
  useEffect(() => {
    setError("");
    setNotice("");
    setRoom(null);
    setInviteLink("");
    setTab("План");
    setOlderDone(false);
    setSubmissionsLoaded(false);
    if (!db || !user) return;
    let live = true;
    const load = async () => {
      try {
        const [p, s] = await Promise.all([api.plans(db), api.saved(db)]);
        if (!live) return;
        setPlans(p);
        setSaved(s);
        if (planId) {
          const r = await api.room(db, planId);
          if (live) setRoom(r);
        }
        if (section === "submit") {
          const s = await api.submissions(db);
          if (live) {
            setSubmissions(s);
            setSubmissionsLoaded(true);
          }
        }
        if (section === "profile") {
          const [s, n] = await Promise.all([
            api.submissions(db),
            api.notifications(db),
          ]);
          if (live) {
            setSubmissions(s);
            setNotifications(n);
          }
        }
        if (section === "admin") {
          const q = await api.queue(db);
          if (live) setQueue(q);
        }
      } catch (e) {
        if (live) {
          setRoom(null);
          setError(humanError(e));
        }
      }
    };
    void load();
    return () => {
      live = false;
    };
  }, [user, planId, section]);
  useEffect(() => {
    if (section !== "invite") return;
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const secret = fragment.get("t");
    if (secret) {
      setToken(secret);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [section]);
  useEffect(() => {
    if (!db || !token) return;
    let live = true;
    api
      .preview(db, token)
      .then((x) => {
        if (live) setPreview(x);
      })
      .catch((e) => {
        if (live) setError(humanError(e));
      });
    return () => {
      live = false;
    };
  }, [token]);
  useEffect(() => {
    if (section !== "auth" || !db) return;
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) {
      setError("Ссылка входа неполная. Запросите новое письмо.");
      return;
    }
    void act(async () => {
      const { error } = await db.auth.exchangeCodeForSession(code);
      window.history.replaceState(null, "", "/auth/callback");
      if (error) throw error;
      router.replace(productFeatures.tripPlanning ? "/plans" : "/explore");
    });
  }, [section, act, router]);
  const needAuth = () => {
    if (!db) {
      setError(
        "Backend ещё не подключён. Демокаталог доступен только для просмотра.",
      );
      return false;
    }
    if (!user) {
      router.push("/login");
      return false;
    }
    return true;
  };
  const form =
    (fn: (data: FormData) => Promise<void>) =>
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      void act(() => fn(data));
    };
  const owner = room?.plan.owner_id === user;
  const visible = searchCatalogue(listings, city, category, query);
  const rsvp = room?.rsvps.find((r) => r.user_id === user);
  const going =
    room?.rsvps
      .filter(
        (r) =>
          r.answer === "going" && r.acknowledged_version === room.plan.version,
      )
      .map((r) => r.user_id)
      .sort() ?? [];
  const budgetStale =
    !!room?.budget &&
    (room.budget.plan_version !== room.plan.version ||
      JSON.stringify([...room.budget.participant_ids].sort()) !==
        JSON.stringify(going));
  const back = (
    <button className="back" onClick={() => router.back()}>
      <ArrowLeft size={18} /> {t("Назад")}{" "}
    </button>
  );
  const catalogCard = (record: Listing) => {
    const l = localizeListing(record, locale);
    return (
      <article className="listing" key={l.id}>
        <a href={`/listing/${l.id}`}>
          <Photo category={t(l.category)} listingId={l.id} />
          <div className="listing-body">
            <div className="eyebrow">
              {t(l.category)} <span>↗</span>
            </div>
            <h3>{l.title}</h3>
            <p>{l.summary}</p>
            <div className="card-foot">
              <span>
                {l.price_minor !== null
                  ? money(l.price_minor)
                  : t("Стоимость уточняется")}
              </span>
              <small>
                {l.origin === "demo_fixture" ? t("Демоидея") : t("Подробнее")}
              </small>
            </div>
          </div>
        </a>
      </article>
    );
  };
  const auth = (
    <div className="auth card">
      <span className="eyebrow">
        {productFeatures.tripPlanning
          ? t("СОБИРАЙТЕ ПЛАНЫ ВМЕСТЕ")
          : t("ВАШИ ЛЮБИМЫЕ МЕСТА")}
      </span>
      <h1>{t("Вход в Qayda")}</h1>
      <p>
        {productFeatures.tripPlanning
          ? t(
              "Каталог открыт всем. Войдите, чтобы создавать планы и отвечать друзьям.",
            )
          : t(
              "Каталог открыт всем. Войдите, чтобы сохранять понравившиеся места.",
            )}
      </p>
      {!db ? (
        <Empty title={t("Подключение готовится")}>
          {" "}
          {t(
            "Для входа необходимо настроить Supabase. Просмотр демонстрационных идей уже доступен.",
          )}{" "}
        </Empty>
      ) : (
        <>
          <form
            onSubmit={form(async () => {
              const cleanName = guestName.trim();
              if (!cleanName || cleanName.length > 80)
                throw new Error("Укажите имя длиной от 1 до 80 символов");
              const { error } = await db.auth.signInAnonymously();
              if (error) throw error;
              await api.profile(db, cleanName);
              if (
                ![
                  "invite",
                  "request",
                  "partner",
                  "requests",
                  "create",
                  "partner-review",
                ].includes(section)
              )
                router.push(
                  productFeatures.tripPlanning ? "/plans" : "/explore",
                );
            })}
          >
            <label className="field">
              {" "}
              {t("Ваше имя")}{" "}
              <input
                name="guest_name"
                disabled={!ready}
                autoComplete="nickname"
                maxLength={80}
                required
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
              />
            </label>
            <p className="muted">
              {" "}
              {t(
                "Вход по имени сохраняется в этом браузере. После выхода или очистки данных восстановить его нельзя.",
              )}{" "}
            </p>
            <button disabled={!ready || busy}>
              {t("Продолжить по имени")}
            </button>
          </form>
          <details>
            <summary>{t("Войти по email")}</summary>
            <form
              onSubmit={form(async (data) => {
                if (!otpSent) {
                  const e = String(data.get("email"));
                  const { error } = await db.auth.signInWithOtp({
                    email: e,
                    options: {
                      emailRedirectTo: `${window.location.origin}/auth/callback`,
                    },
                  });
                  if (error) throw error;
                  setEmail(e);
                  setOtpSent(true);
                  setNotice(
                    "Письмо отправлено. Откройте ссылку входа и вернитесь сюда. Если в письме есть код, его можно ввести ниже.",
                  );
                } else {
                  const { error } = await db.auth.verifyOtp({
                    email,
                    token: String(data.get("code")),
                    type: "email",
                  });
                  if (error) throw error;
                  setNotice("Вы вошли");
                  if (
                    ![
                      "invite",
                      "request",
                      "partner",
                      "requests",
                      "create",
                      "partner-review",
                    ].includes(section)
                  )
                    router.push(
                      productFeatures.tripPlanning ? "/plans" : "/explore",
                    );
                }
              })}
            >
              {!otpSent ? (
                <label className="field">
                  Email
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                  />
                </label>
              ) : (
                <label className="field">
                  {" "}
                  {t("Код из письма")}{" "}
                  <input
                    name="code"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    required
                    minLength={6}
                    maxLength={10}
                  />
                </label>
              )}
              <button disabled={busy}>
                {busy
                  ? t("Подождите…")
                  : otpSent
                    ? t("Войти")
                    : t("Получить письмо для входа")}
              </button>
              {otpSent && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setOtpSent(false)}
                >
                  {" "}
                  {t("Другой email")}{" "}
                </button>
              )}
            </form>
          </details>
        </>
      )}
    </div>
  );
  const submission = submissions.find((x) => x.id === parts[1]);
  const submissionValues = (data: FormData, action = "submit") => ({
    ...Object.fromEntries(data),
    id: data.get("id") || undefined,
    action,
    event_starts: data.get("event_starts")
      ? localToUtc(String(data.get("event_starts")))
      : null,
  });
  let content: ReactNode;
  if (section === "auth")
    content = (
      <div className="narrow card">
        <h1>{t("Завершаем вход")}</h1>
        <p>
          {" "}
          {t(
            "После входа можно вернуться во вкладку приглашения и вступить в компанию.",
          )}{" "}
        </p>
        <a className="button secondary" href="/login">
          {" "}
          {t("Запросить новую ссылку")}{" "}
        </a>
      </div>
    );
  else if (section === "login") content = auth;
  else if (
    ["providers", "partner", "request", "requests", "partner-review"].includes(
      section,
    )
  )
    content = (
      <ProvidersHub
        key={`${user ?? "anon"}:${path}`}
        db={db}
        user={user}
        path={path}
        listings={listings}
        auth={auth}
      />
    );
  else if (section === "invite")
    content = (
      <div className="narrow">
        {back}
        <div className="card">
          <span className="eyebrow">{t("ВАС ПРИГЛАШАЮТ")}</span>
          <h1>{preview?.title ?? "Совместный план"}</h1>
          <p>
            {" "}
            {t(
              "Присоединитесь к компании, чтобы увидеть детали и ответить друзьям. RSVP не бронирует билеты.",
            )}{" "}
          </p>
          {!token ? (
            <p>
              {" "}
              {t(
                "Откройте полную ссылку приглашения, которую прислал организатор.",
              )}{" "}
            </p>
          ) : preview ? (
            <>
              <p>
                {t("Ссылка действует до")} {planDate(preview.expires_at)}
              </p>
              {user ? (
                <button
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      const id = await api.redeem(db!, token);
                      setToken("");
                      router.push(`/plans/${id}`);
                    })
                  }
                >
                  {" "}
                  {t("Вступить в компанию")}{" "}
                </button>
              ) : (
                auth
              )}
            </>
          ) : (
            <p>{t("Проверяем приглашение…")}</p>
          )}
        </div>
      </div>
    );
  else if (section === "listing" && selected)
    content = (
      <div className="narrow">
        {back}
        <Photo
          category={t(selected.category)}
          listingId={selected.id}
          large
          eager
        />
        <PhotoCredit listingId={selected.id} />
        <div className="detail">
          <span className="eyebrow">
            {t(selected.category)} ·{" "}
            {t(cities.find((c) => c.slug === selected.city)?.name ?? "")}
          </span>
          <h1>{selected.title}</h1>
          {selected.origin === "demo_fixture" && (
            <p className="banner">
              {" "}
              {t(
                "Демонстрационная идея. Место, условия и маршрут ещё не проверены.",
              )}{" "}
            </p>
          )}
          <p className="lead">{selected.summary}</p>
          {productFeatures.providers && (
            <a className="button" href={`/providers?place=${selected.id}`}>
              {" "}
              {t("Найти гида, водителя или турфирму")}{" "}
            </a>
          )}
          {selected.out_of_city && (
            <p className="banner">
              {" "}
              {t("За городом · направление из")}{" "}
              {selected.city === "semey" ? t("Семея") : t("Алматы")}
            </p>
          )}
          {selected.kind === "event" && selected.event_starts && (
            <p>
              {t("Дата события:")} {planDate(selected.event_starts)}
            </p>
          )}
          <div className="fact">
            <MapPin size={20} />
            {selected.address ?? "Точное местоположение уточняется"}
          </div>
          <div className="fact">
            <Leaf size={20} />
            {selected.price_minor !== null
              ? money(selected.price_minor)
              : t("Стоимость уточнить у организатора")}
          </div>
          {safeUrl(selected.source_url) && (
            <a
              href={safeUrl(selected.source_url)!}
              target="_blank"
              rel="noreferrer"
            >
              {" "}
              {t("Источник сведений")} <ArrowUpRight size={16} />
            </a>
          )}
          <p className="muted">
            {selected.checked_at
              ? `${t("Проверено")} ${new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : "ru-RU", { dateStyle: "medium", timeZone: "Asia/Almaty" }).format(new Date(selected.checked_at))}`
              : t("Дата проверки пока не указана")}
          </p>
          {selected.verified_fields?.length ? (
            <p className="muted">
              {" "}
              {t(
                "Проверены название, описание и указанные данные места. Расписание и стоимость уточняются отдельно.",
              )}{" "}
            </p>
          ) : null}
          {mapUrl(selected) && (
            <a
              className="button secondary"
              href={mapUrl(selected)!}
              target="_blank"
              rel="noreferrer"
            >
              {" "}
              {t("Открыть карту")}{" "}
            </a>
          )}
          {productFeatures.tripPlanning && (
            <button
              disabled={!ready}
              onClick={() => {
                if (needAuth()) router.push(`/create/${selected.id}`);
              }}
            >
              {" "}
              {t("Собрать компанию")} <Users size={18} />
            </button>
          )}
          <button
            className="secondary"
            disabled={!ready || busy}
            onClick={() => {
              if (needAuth())
                void act(async () => {
                  await api.save(
                    db!,
                    selected.id,
                    !saved.includes(selected.id),
                  );
                  setSaved(await api.saved(db!));
                });
            }}
          >
            <Heart size={18} />
            {saved.includes(selected.id)
              ? t("Убрать из сохранённого")
              : t("Сохранить")}
          </button>
          {user && (
            <form
              onSubmit={form(async (data) => {
                await api.report(db!, selected.id, String(data.get("reason")));
                setNotice("Жалоба передана на проверку");
              })}
            >
              <Field name="reason" label={t("Сообщить об ошибке")} />
              <button className="text-button" disabled={busy}>
                {" "}
                {t("Отправить на проверку")}{" "}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  else if (section === "create") {
    const l = listings.find((x) => x.id === parts[1]);
    content = !user ? (
      auth
    ) : (
      <div className="narrow">
        {back}
        <h1>{t("Собрать компанию")}</h1>
        {l && (
          <div className="selected-place">
            <Photo listingId={l.id} />
            <div>
              <span className="eyebrow">{t("ВАШЕ МЕСТО")}</span>
              <h3>{l.title}</h3>
              <p className="muted">
                {cities.find((c) => c.slug === l.city)?.name}
              </p>
            </div>
          </div>
        )}
        <form
          className="card"
          onSubmit={form(async (data) => {
            if (!l) throw new Error("Место недоступно");
            createKey.current ||= crypto.randomUUID();
            const id = await api.createPlan(db!, {
              listing_id: l.id,
              title: String(data.get("title")),
              starts_at: localToUtc(String(data.get("starts"))),
              meeting_note: String(data.get("meeting")),
              request_id: createKey.current,
              group_id: String(data.get("group") || "") || undefined,
            });
            createKey.current = "";
            router.push(`/plans/${id}`);
          })}
        >
          <Field
            name="title"
            label={t("Название плана")}
            defaultValue={l?.title}
          />
          <label className="field">
            {" "}
            {t("Компания")}{" "}
            <select name="group">
              <option value="">{t("Создать новую компанию")}</option>
              {plans
                .filter(
                  (p, i, a) =>
                    p.owner_id === user &&
                    a.findIndex((q) => q.group_id === p.group_id) === i,
                )
                .map((p) => (
                  <option key={p.group_id} value={p.group_id}>
                    {p.title}
                  </option>
                ))}
            </select>
          </label>
          <Field
            name="starts"
            label={t("Дата и время · Алматы (UTC+5)")}
            type="datetime-local"
            hint={t(
              "Выберите будущую дату. Встречу можно запланировать на ближайшие два года.",
            )}
            error={
              /дата встречи|дату встречи|дату и время встречи/i.test(error)
                ? error
                : undefined
            }
          />
          <Field
            name="meeting"
            label={t("Где встречаемся")}
            placeholder={t("Например, у главного входа")}
          />
          <p className="muted">
            {" "}
            {t(
              "Создадим приватную компанию. Приглашение можно выпустить после публикации плана.",
            )}{" "}
          </p>
          <button disabled={busy || !l}>
            {busy ? t("Создаём…") : t("Создать план")}
          </button>
        </form>
      </div>
    );
  } else if (section === "plans" && planId) {
    content = !user ? (
      auth
    ) : !room ? (
      <Empty title={error ? t("План недоступен") : t("Загружаем план")}>
        {" "}
        {t("Доступ есть только у участников компании.")}{" "}
      </Empty>
    ) : (
      <div className="room-layout">
        <div className="room-main">
          {back}
          <span className="eyebrow">
            {statusLabels[room.plan.status]} {t("· версия")} {room.plan.version}
          </span>
          {room.plan.listing_id && (
            <div className="room-cover">
              <Photo listingId={room.plan.listing_id} large />
            </div>
          )}
          <h1>{room.plan.title}</h1>
          <p className="lead">{planDate(room.plan.starts_at)}</p>
          <p>
            <MapPin size={16} />
            {room.plan.meeting_note}
          </p>
          <div className="tabs">
            {["План", "Участники", "Обсуждение", "Бюджет"].map((t) => (
              <button
                key={t}
                className={t === tab ? "active" : "secondary"}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === "План" && (
            <div className="card">
              <h2>{t("Вы с нами?")}</h2>
              <p className="muted">
                {" "}
                {t(
                  "Ответ означает намерение пойти. Билеты и услуги оформляются отдельно.",
                )}{" "}
              </p>
              {rsvp && rsvp.acknowledged_version !== room.plan.version && (
                <p className="banner">
                  {" "}
                  {t("План изменился — подтвердите ответ заново.")}{" "}
                </p>
              )}
              <div className="row wrap">
                {(Object.keys(answerLabels) as Answer[]).map((a) => (
                  <button
                    key={a}
                    aria-pressed={
                      rsvp?.answer === a &&
                      rsvp.acknowledged_version === room.plan.version
                    }
                    className={
                      rsvp?.answer === a &&
                      rsvp.acknowledged_version === room.plan.version
                        ? ""
                        : "secondary"
                    }
                    disabled={
                      busy ||
                      !["proposed", "confirmed"].includes(room.plan.status)
                    }
                    onClick={() =>
                      void act(async () => {
                        await api.rsvp(db!, planId, room.plan.version, a);
                        await reloadRoom();
                      })
                    }
                  >
                    {answerLabels[a]}
                  </button>
                ))}
              </div>
              {owner && (
                <>
                  <hr />
                  <h3>{t("Управление планом")}</h3>
                  <div className="row wrap">
                    {(room.plan.status === "draft"
                      ? ["publish", "cancel"]
                      : room.plan.status === "proposed"
                        ? ["confirm", "cancel"]
                        : room.plan.status === "confirmed"
                          ? ["complete", "cancel"]
                          : []
                    ).map((a) => (
                      <button
                        key={a}
                        disabled={busy}
                        className={a === "cancel" ? "secondary" : ""}
                        onClick={() =>
                          void act(async () => {
                            await api.action(db!, planId, room.plan.version, a);
                            await reloadRoom();
                          })
                        }
                      >
                        {
                          {
                            publish: "Предложить компании",
                            confirm: "Подтвердить план",
                            cancel: "Отменить план",
                            complete: "Завершить",
                          }[a]
                        }
                      </button>
                    ))}
                  </div>
                  {!["cancelled", "completed"].includes(room.plan.status) && (
                    <details>
                      <summary>{t("Изменить договорённости")}</summary>
                      <form
                        onSubmit={form(async (data) => {
                          await api.action(
                            db!,
                            planId,
                            room.plan.version,
                            room.plan.status === "confirmed"
                              ? "revise"
                              : "edit",
                            {
                              title: String(data.get("title")),
                              starts_at: localToUtc(String(data.get("starts"))),
                              meeting_note: String(data.get("meeting")),
                            },
                          );
                          await reloadRoom();
                        })}
                      >
                        <Field
                          name="title"
                          label={t("Название")}
                          defaultValue={room.plan.title}
                        />
                        <Field
                          name="starts"
                          type="datetime-local"
                          label={t("Дата и время · UTC+5")}
                          defaultValue={new Date(
                            new Date(room.plan.starts_at).getTime() +
                              5 * 3600000,
                          )
                            .toISOString()
                            .slice(0, 16)}
                        />
                        <Field
                          name="meeting"
                          label={t("Встреча")}
                          defaultValue={room.plan.meeting_note}
                        />
                        <p>
                          {" "}
                          {t(
                            "Изменение создаст новую версию. Участникам потребуется подтвердить ответы.",
                          )}{" "}
                        </p>
                        <button disabled={busy}>
                          {t("Сохранить новую версию")}
                        </button>
                      </form>
                    </details>
                  )}
                </>
              )}
              <hr />
              <button
                className="secondary"
                onClick={() => {
                  const blob = new Blob([calendarIcs(room.plan)], {
                    type: "text/calendar;charset=utf-8",
                  });
                  const u = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = u;
                  a.download = "qayda-plan.ics";
                  a.click();
                  URL.revokeObjectURL(u);
                }}
              >
                {" "}
                {t("Скачать событие .ics")}{" "}
              </button>
              <p className="muted">
                {" "}
                {t(
                  "Разовый экспорт передаст название и место встречи вашему календарю. Автоматического обновления нет.",
                )}{" "}
              </p>
            </div>
          )}
          {tab === "Участники" && (
            <div className="card">
              <h2>
                {t("Компания ·")} {room.members.length}
              </h2>
              {room.members.map((m) => {
                const r = room.rsvps.find((x) => x.user_id === m.user_id);
                return (
                  <div className="member" key={m.user_id}>
                    <span className="avatar">{m.display_name.slice(0, 1)}</span>
                    <div>
                      <strong>{m.display_name}</strong>
                      <p>
                        {m.user_id === room.plan.owner_id
                          ? t("Организатор")
                          : r
                            ? r.acknowledged_version === room.plan.version
                              ? answerLabels[r.answer]
                              : t("Нужно подтвердить")
                            : t("Не ответил")}
                      </p>
                    </div>
                    {owner && m.user_id !== user && (
                      <div className="row">
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() =>
                            void act(async () => {
                              await api.transfer(db!, planId, m.user_id);
                              await reloadRoom();
                            })
                          }
                        >
                          {" "}
                          {t("Передать владение")}{" "}
                        </button>
                        <button
                          className="text-button danger"
                          disabled={busy}
                          onClick={() =>
                            void act(async () => {
                              await api.removeMember(db!, planId, m.user_id);
                              await reloadRoom();
                            })
                          }
                        >
                          {" "}
                          {t("Удалить")}{" "}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {!owner && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await api.leave(db!, planId);
                      router.push(
                        productFeatures.tripPlanning ? "/plans" : "/explore",
                      );
                    })
                  }
                >
                  {" "}
                  {t("Выйти из компании")}{" "}
                </button>
              )}
            </div>
          )}
          {tab === "Обсуждение" && (
            <div className="card">
              <h2>{t("Обсуждение")}</h2>
              {room.messages.length >= 50 && !olderDone && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      const page = await api.messages(
                        db!,
                        planId,
                        room.messages[0],
                      );
                      setRoom({
                        ...room,
                        messages: [...page.items, ...room.messages],
                      });
                      setOlderDone(!page.has_more);
                    })
                  }
                >
                  {" "}
                  {t("Загрузить более ранние")}{" "}
                </button>
              )}
              <p className="muted">
                {" "}
                {t(
                  "Показаны последние 50 сообщений. Обновите, чтобы получить новые.",
                )}{" "}
              </p>
              {room.messages.length ? (
                room.messages.map((m) => (
                  <div className="message" key={m.id}>
                    <strong>
                      {room.members.find((x) => x.user_id === m.author_id)
                        ?.display_name ?? "Бывший участник"}
                    </strong>
                    <p>{m.body}</p>
                    <small>{planDate(m.created_at)}</small>
                    {m.author_id === user &&
                      m.body !== "[Сообщение удалено]" && (
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() =>
                            void act(async () => {
                              await api.deleteMessage(db!, planId, m.id);
                              await reloadRoom();
                            })
                          }
                        >
                          {" "}
                          {t("Удалить своё сообщение")}{" "}
                        </button>
                      )}
                  </div>
                ))
              ) : (
                <p>{t("Сообщений пока нет. Обсудите детали поездки.")}</p>
              )}
              <form
                onSubmit={form(async (data) => {
                  messageKey.current ||= crypto.randomUUID();
                  await api.message(
                    db!,
                    planId,
                    String(data.get("body")),
                    messageKey.current,
                  );
                  messageKey.current = "";
                  await reloadRoom();
                  setNotice("Сообщение сохранено");
                })}
              >
                <label className="field">
                  {" "}
                  {t("Сообщение")}{" "}
                  <textarea name="body" required maxLength={2000} />
                </label>
                <button disabled={busy}>
                  <Send size={16} /> {t("Отправить")}{" "}
                </button>
              </form>
            </div>
          )}
          {tab === "Бюджет" && (
            <div className="card">
              <h2>{t("Расходы компании")}</h2>
              <p className="muted">
                {" "}
                {t(
                  "Это предварительный расчёт. Qayda не принимает и не переводит деньги.",
                )}{" "}
              </p>
              {room.items.map((i) => (
                <div className="member" key={i.id}>
                  <div>
                    <strong>{i.title}</strong>
                    {owner && (
                      <BudgetItemEditor
                        db={db!}
                        planId={planId}
                        version={room.plan.version}
                        item={i}
                        onSaved={reloadRoom}
                      />
                    )}
                    <p>
                      {i.cost_kind === "shared"
                        ? t("На всех")
                        : t("На человека")}{" "}
                      · {money(i.amount_minor)}
                    </p>
                  </div>
                  {owner && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await api.removeBudget(
                            db!,
                            planId,
                            room.plan.version,
                            i.id,
                          );
                          await reloadRoom();
                        })
                      }
                    >
                      {" "}
                      {t("Убрать")}{" "}
                    </button>
                  )}
                </div>
              ))}
              {room.budget ? (
                <>
                  <h3>{money(room.budget.total_minor)}</h3>
                  {budgetStale && (
                    <p className="banner">
                      {" "}
                      {t(
                        "Расчёт устарел. Организатору нужно пересчитать доли.",
                      )}{" "}
                    </p>
                  )}
                  {Object.entries(room.budget.shares).map(([id, amount]) => (
                    <p key={id}>
                      {room.members.find((m) => m.user_id === id)
                        ?.display_name ?? "Бывший участник"}{" "}
                      — {money(amount)}{" "}
                      {room.budget!.agreed_ids.includes(id)
                        ? t("· согласен")
                        : ""}
                    </p>
                  ))}
                  <button
                    className="secondary"
                    disabled={busy || budgetStale || !going.includes(user!)}
                    onClick={() =>
                      void act(async () => {
                        await api.agreeBudget(
                          db!,
                          planId,
                          room.budget!.version,
                        );
                        await reloadRoom();
                      })
                    }
                  >
                    {" "}
                    {t("Согласен с расчётом")}{" "}
                  </button>
                </>
              ) : (
                <p>{t("Расчёт ещё не сформирован.")}</p>
              )}
              {owner && (
                <>
                  <form
                    onSubmit={form(async (data) => {
                      await api.budget(
                        db!,
                        planId,
                        room.plan.version,
                        String(data.get("title")),
                        parseMoney(String(data.get("amount"))).toString(),
                        String(data.get("kind")),
                      );
                      await reloadRoom();
                    })}
                  >
                    <Field
                      name="title"
                      label={t("Статья расходов")}
                      placeholder={t("Транспорт")}
                    />
                    <Field
                      name="amount"
                      label={t("Сумма, ₸")}
                      placeholder="5000"
                    />
                    <label className="field">
                      {" "}
                      {t("Распределение")}{" "}
                      <select name="kind">
                        <option value="shared">{t("На всех")}</option>
                        <option value="per_person">{t("На человека")}</option>
                      </select>
                    </label>
                    <button disabled={busy}>{t("Добавить статью")}</button>
                  </form>
                  <button
                    className="secondary"
                    disabled={busy || !going.length}
                    onClick={() =>
                      void act(async () => {
                        await api.recalculate(db!, planId, room.plan.version);
                        await reloadRoom();
                      })
                    }
                  >
                    {" "}
                    {t("Пересчитать для")} {going.length} {t("участников")}{" "}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <aside className="card room-aside">
          <span className="eyebrow">{t("СВОИ ЛЮДИ РЯДОМ")}</span>
          <h3>
            {going.length} {t("собираются пойти")}
          </h3>
          <p>{t("Договоритесь о деталях и подтвердите план.")}</p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void act(reloadRoom)}
          >
            {" "}
            {t("Обновить комнату")}{" "}
          </button>
          {owner && (
            <>
              <hr />
              <h3>{t("Пригласить друзей")}</h3>
              <p>
                {" "}
                {t(
                  "Получатель ссылки сможет вступить в компанию. До входа увидит только выбранный заголовок.",
                )}{" "}
              </p>
              <form
                onSubmit={form(async (data) => {
                  const i = await api.invite(
                    db!,
                    planId,
                    String(data.get("preview")),
                    Number(data.get("maxUses")),
                    Number(data.get("hours")),
                  );
                  setInviteLink(
                    `${process.env.NEXT_PUBLIC_APP_URL || window.location.origin}/invite#t=${i.token}`,
                  );
                  await reloadRoom();
                })}
              >
                <Field
                  name="preview"
                  label={t("Заголовок приглашения")}
                  defaultValue={room.plan.title}
                />
                <Field
                  name="maxUses"
                  label={t("Максимум вступлений (1–50)")}
                  defaultValue="20"
                />
                <Field
                  name="hours"
                  label={t("Срок действия в часах (1–168)")}
                  defaultValue="168"
                />
                <button
                  disabled={
                    busy ||
                    !["proposed", "confirmed"].includes(room.plan.status)
                  }
                >
                  {" "}
                  {t("Создать ссылку")}{" "}
                </button>
              </form>
              {inviteLink && (
                <>
                  <label className="field">
                    {" "}
                    {t("Ссылка для друзей")}{" "}
                    <input readOnly value={inviteLink} />
                  </label>
                  <button
                    className="secondary"
                    onClick={() =>
                      void act(async () => {
                        await navigator.clipboard.writeText(inviteLink);
                        setNotice(
                          "Ссылка скопирована. Отправьте её друзьям самостоятельно.",
                        );
                      })
                    }
                  >
                    {" "}
                    {t("Скопировать ссылку")}{" "}
                  </button>
                </>
              )}
              {room.invitations.map((i) => (
                <div className="invite-row" key={i.id}>
                  <small>
                    {i.revoked_at
                      ? t("Отозвана")
                      : `${i.uses_count}/${i.max_uses} вступлений · до ${planDate(i.expires_at)}`}
                  </small>
                  {!i.revoked_at && (
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await api.revoke(db!, i.id);
                          await reloadRoom();
                        })
                      }
                    >
                      {" "}
                      {t("Отозвать")}{" "}
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
        </aside>
      </div>
    );
  } else if (section === "plans" || section === "calendar")
    content = !user ? (
      auth
    ) : (
      <>
        <div className="page-heading">
          <div>
            <span className="eyebrow">{t("СОБИРАЙТЕ ВПЕЧАТЛЕНИЯ")}</span>
            <h1>
              {section === "calendar" ? t("Ваш календарь") : t("Ваши планы")}
            </h1>
            <a className="link" href="/requests">
              {" "}
              {t("Заявки исполнителям →")}{" "}
            </a>
          </div>
          <a className="button" href="/explore">
            <Plus size={18} /> {t("Новый план")}{" "}
          </a>
        </div>
        <div className="row">
          <a className="button secondary" href="/plans">
            {" "}
            {t("Все планы")}{" "}
          </a>
          <a className="button secondary" href="/calendar">
            {" "}
            {t("Календарь")}{" "}
          </a>
        </div>
        {!plans.length ? (
          <Empty title={t("Первая встреча ещё впереди")}>
            {" "}
            {t("Выберите идею в каталоге и соберите компанию.")}{" "}
          </Empty>
        ) : (
          <div className="plan-grid">
            {plans
              .filter((p) => section !== "calendar" || p.status === "confirmed")
              .map((p) => (
                <a
                  className="card plan-card"
                  href={`/plans/${p.id}`}
                  key={p.id}
                >
                  {p.listing_id && (
                    <div className="plan-cover">
                      <Photo listingId={p.listing_id} />
                    </div>
                  )}
                  <span className="eyebrow">{statusLabels[p.status]}</span>
                  <h2>{p.title}</h2>
                  <p>{planDate(p.starts_at)}</p>
                  <p>{p.meeting_note}</p>
                  {plans.some((q) => overlaps(p, q)) && (
                    <p className="banner">
                      {" "}
                      {t("Другой план начинается в это же время")}{" "}
                    </p>
                  )}
                  <span className="link">{t("Открыть план →")}</span>
                </a>
              ))}
          </div>
        )}
      </>
    );
  else if (section === "profile")
    content = !user ? (
      auth
    ) : (
      <div className="narrow">
        <h1>{t("Ваш профиль")}</h1>
        {productFeatures.providers && (
          <div className="row wrap">
            <a className="button" href="/partner">
              {" "}
              {t("Предложить услуги")}{" "}
            </a>
            <a className="button secondary" href="/requests">
              {" "}
              {t("Мои заявки")}{" "}
            </a>
          </div>
        )}
        {isGuest && (
          <p className="banner">
            {" "}
            {t(
              "Вы вошли по имени. Доступ привязан к этому браузеру. После выхода или очистки данных восстановить его нельзя.",
            )}{" "}
          </p>
        )}
        <div className="card">
          <form
            onSubmit={form(async (data) => {
              await api.profile(db!, String(data.get("name")));
              setNotice("Имя сохранено");
            })}
          >
            <Field name="name" label={t("Как вас зовут")} />
            <button disabled={busy}>{t("Сохранить")}</button>
          </form>
          <a className="button secondary" href="/submit">
            {" "}
            {t("Предложить место или событие")}{" "}
          </a>
          <a className="button secondary" href="/saved">
            {" "}
            {t("Сохранённые идеи")}{" "}
          </a>
          <a className="button secondary" href="/admin">
            {" "}
            {t("Редакторская проверка")}{" "}
          </a>
          <button
            className="secondary"
            onClick={() =>
              void act(async () => {
                await db!.auth.signOut();
                setPlans([]);
                setSaved([]);
                setRoom(null);
              })
            }
          >
            {" "}
            {t("Выйти")}{" "}
          </button>
          <details>
            <summary>{t("Удаление аккаунта")}</summary>
            <p>
              {" "}
              {t(
                "Запрос передаётся администратору. До фактического удаления нужно обработать владение компаниями и личные данные.",
              )}{" "}
            </p>
            <button
              className="secondary danger"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await api.deletion(db!);
                  setNotice(
                    "Запрос на удаление зарегистрирован. Аккаунт ещё не удалён.",
                  );
                })
              }
            >
              {" "}
              {t("Запросить удаление")}{" "}
            </button>
          </details>
        </div>
        <h2>{t("Мои предложения")}</h2>
        {submissions.map((s) => (
          <div className="card" key={s.id}>
            <h3>{s.title}</h3>
            <p>
              {
                (
                  {
                    draft: "Черновик",
                    pending_review: "На проверке",
                    published: "Опубликовано",
                    rejected: "Отклонено",
                    suspended: "Приостановлено",
                  } as Record<string, string>
                )[s.publication_status]
              }
            </p>
            {s.rejection_reason && <p>{s.rejection_reason}</p>}
            {["draft", "rejected", "published"].includes(
              s.publication_status,
            ) && (
              <a className="button secondary" href={`/submit/${s.id}`}>
                {" "}
                {t("Редактировать")}{" "}
              </a>
            )}
          </div>
        ))}
        <h2>{t("Обновления планов")}</h2>
        {notifications.length ? (
          notifications.map((n) => (
            <p className="card" key={n.id}>
              {n.body} <small>{planDate(n.created_at)}</small>
            </p>
          ))
        ) : (
          <p>{t("Обновлений пока нет.")}</p>
        )}
      </div>
    );
  else if (section === "submit")
    content = !user ? (
      auth
    ) : parts[1] && !submission ? (
      <Empty
        title={
          submissionsLoaded ? t("Черновик недоступен") : t("Загружаем черновик")
        }
      >
        {" "}
        {t("Дождитесь загрузки или вернитесь к своим предложениям.")}{" "}
      </Empty>
    ) : (
      <div className="narrow">
        {back}
        <h1>{t("Поделиться открытием")}</h1>
        <p>
          {" "}
          {t(
            "Перед публикацией редактор проверит сведения. Правка опубликованного предложения снимет его с показа до повторной проверки.",
          )}{" "}
        </p>
        <form
          className="card"
          key={submission?.id ?? "new"}
          onSubmit={form(async (data) => {
            if (data.get("rights") !== "on")
              throw new Error("Подтвердите право публикации");
            await api.submit(db!, submissionValues(data));
            router.push("/profile");
          })}
        >
          <input type="hidden" name="id" value={submission?.id ?? ""} />
          <Field
            name="title"
            label={t("Название")}
            defaultValue={submission?.title}
          />
          <label className="field">
            {" "}
            {t("Город")}{" "}
            <select name="city" defaultValue={submission?.city}>
              {cities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {t(c.name)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {" "}
            {t("Категория")}{" "}
            <select name="category" defaultValue={submission?.category}>
              {categories.slice(1).map((c) => (
                <option key={t(c)}>{t(c)}</option>
              ))}
            </select>
          </label>
          <label className="field">
            {" "}
            {t("Тип")}{" "}
            <select
              name="kind"
              aria-label={t("Тип")}
              defaultValue={submission?.kind ?? "place"}
            >
              <option value="place">{t("Место")}</option>
              <option value="experience">{t("Программа")}</option>
              <option value="event">{t("Событие")}</option>
            </select>
          </label>
          <Field
            name="event_starts"
            label={t("Дата события · UTC+5 (для события обязательна)")}
            type="datetime-local"
            required={false}
            defaultValue={
              submission?.event_starts
                ? new Date(
                    new Date(submission.event_starts).getTime() + 5 * 3600000,
                  )
                    .toISOString()
                    .slice(0, 16)
                : undefined
            }
          />
          <label className="field">
            {" "}
            {t("Описание")}{" "}
            <textarea
              name="summary"
              minLength={10}
              maxLength={4000}
              required
              defaultValue={submission?.summary}
            />
          </label>
          <Field
            name="address"
            label={t("Публичное место или адрес")}
            defaultValue={submission?.address ?? undefined}
          />
          <label className="checkbox">
            <input type="checkbox" name="rights" required />{" "}
            {t("Подтверждаю право публиковать описание")}{" "}
          </label>
          <div className="row wrap">
            <button disabled={busy}>{t("Отправить на проверку")}</button>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={(e) => {
                const data = new FormData(e.currentTarget.form!);
                void act(async () => {
                  await api.submit(db!, submissionValues(data, "draft"));
                  router.push("/profile");
                });
              }}
            >
              {" "}
              {t("Сохранить черновик")}{" "}
            </button>
          </div>
        </form>
      </div>
    );
  else if (section === "admin")
    content = !user ? (
      auth
    ) : (
      <>
        <h1>{t("Редакторская проверка")}</h1>
        <a className="button secondary" href="/partner-review">
          {" "}
          {t("Проверка исполнителей и услуг")}{" "}
        </a>
        {!error && <CatalogEditor db={db!} listings={listings} />}
        <p>
          {" "}
          {t(
            "Доступ назначается администратором БД. Пользователь не может выдать его себе.",
          )}{" "}
        </p>
        {queue.map((l) => (
          <div className="card" key={l.id}>
            <h2>{l.title}</h2>
            <p>{l.summary}</p>
            <p>{l.address}</p>
            <form
              onSubmit={form(async (data) => {
                await api.review(db!, l.id, false, String(data.get("reason")));
                setQueue(await api.queue(db!));
              })}
            >
              <Field name="reason" label={t("Причина отклонения")} />
              <button className="secondary" disabled={busy}>
                {" "}
                {t("Отклонить")}{" "}
              </button>
            </form>
            <button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await api.review(db!, l.id, true, "");
                  setQueue(await api.queue(db!));
                })
              }
            >
              {" "}
              {t("Опубликовать после проверки")}{" "}
            </button>
          </div>
        ))}
      </>
    );
  else if (section === "open-data")
    content = (
      <div className="narrow">
        {back}
        <OpenCulture
          city={city as "semey" | "almaty"}
          onCategory={setCategory}
          expanded
        />
      </div>
    );
  else if (section === "privacy" || section === "terms")
    content = (
      <div className="narrow card">
        <h1>
          {section === "privacy"
            ? t("О данных в Qayda")
            : t("Условия использования")}
        </h1>
        <p>
          {" "}
          {t(
            "Это версия для закрытого тестирования. Для аккаунта используются email, отображаемое имя, планы и ответы участников. Компания и обсуждение доступны её активным участникам.",
          )}{" "}
        </p>
        <p>
          {" "}
          {t(
            "Приглашение можно переслать. Не включайте чувствительные сведения в его заголовок. Экспорт календаря передаёт выбранные детали во внешний календарь.",
          )}{" "}
        </p>
        <p>
          {" "}
          {t(
            "RSVP не бронирует услугу. Бюджет является пользовательским расчётом. Внешние билеты и услуги оформляются у продавца.",
          )}{" "}
        </p>
        <p>
          {" "}
          {t(
            "Перед публичным запуском требуется утвердить оператора сервиса, инфраструктуру, сроки хранения, контакты для обращений и окончательные юридические тексты.",
          )}{" "}
        </p>
      </div>
    );
  else if (section === "photos")
    content = (
      <div className="narrow">
        {back}
        <span className="eyebrow">{t("ЛЮДИ ЗА КАДРОМ")}</span>
        <h1>{t("Фотографии Казахстана")}</h1>
        <p>
          {" "}
          {t(
            "Спасибо авторам, которые делятся своими снимками. Фотографии уменьшены и кадрируются по размеру карточки.",
          )}{" "}
        </p>
        {Object.entries(photos).map(([key, p]) => (
          <article className="card photo-license" key={key}>
            <Photo photoKey={key as keyof typeof photos} />
            <h2>{t(p.alt)}</h2>
            <p>{p.author}</p>
            <a
              className="link"
              href={p.source}
              target="_blank"
              rel="noreferrer"
            >
              {p.licenseUrl
                ? t("Оригинал на Wikimedia Commons ↗")
                : t("Открыть фотографию ↗")}
            </a>
            <p>
              {p.licenseUrl ? (
                <a
                  className="link"
                  href={p.licenseUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t(p.license)}
                </a>
              ) : (
                t(p.license)
              )}
            </p>
          </article>
        ))}
      </div>
    );
  else
    content = (
      <>
        {section === "home" ? (
          <>
            <section className="hero">
              <div className="hero-art">
                <Photo photoKey="lake" large eager />
              </div>
              <div className="hero-copy">
                <Mountain
                  className="hero-mountain"
                  size={52}
                  strokeWidth={1.6}
                />
                <div className="hero-brand">Qayda</div>
                <p className="hero-tagline">
                  {t("Открываем Казахстан вместе")}
                </p>
                <h1>
                  {" "}
                  {t("Куда поедем")} <em>{t("вместе?")}</em>
                </h1>
                <div className="search hero-search">
                  <Search size={20} />
                  <input
                    aria-label={t("Поиск мест")}
                    type="search"
                    placeholder={t("Куда вы хотите поехать?")}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <a href="#ideas" aria-label={t("Показать найденные места")}>
                    <ArrowRight size={20} />
                  </a>
                </div>
                <div
                  className="quick-categories"
                  aria-label={t("Быстрый выбор категории")}
                >
                  {[
                    ["Наследие", Landmark],
                    ["Этнотуры", Tent],
                    ["Музеи", Compass],
                    ["Природа", Trees],
                    ["Театры", Drama],
                    ["Прогулки", Footprints],
                  ].map(([name, Icon]) => {
                    const CategoryIcon = Icon as typeof Landmark;
                    return (
                      <a
                        href="#ideas"
                        key={t(name as string)}
                        onClick={() => setCategory(name as string)}
                      >
                        <span>
                          <CategoryIcon size={24} strokeWidth={1.6} />
                        </span>
                        <small className="quick-title">
                          {t(name as string)}
                        </small>
                      </a>
                    );
                  })}
                </div>
              </div>
              <a className="landscape-caption" href="/photos">
                <MapPin size={14} /> {t("Большое Алматинское озеро")}{" "}
              </a>
            </section>
            {productFeatures.providers && (
              <section className="provider-callout">
                <div>
                  <span className="eyebrow">{t("ОДНОМУ ИЛИ С ДРУЗЬЯМИ")}</span>
                  <h2>{t("Кто поможет с поездкой?")}</h2>
                  <p>
                    {" "}
                    {t(
                      "Гид, машина с водителем или готовый тур — выбирайте подходящий формат.",
                    )}{" "}
                  </p>
                </div>
                <a className="button" href="/providers">
                  {" "}
                  {t("Найти исполнителя")} <ArrowUpRight size={18} />
                </a>
              </section>
            )}
            <section className="city-section" aria-label={t("Выбор города")}>
              <div className="section-title">
                <div>
                  <span className="eyebrow">{t("С ЧЕГО НАЧНЁМ?")}</span>
                  <h2>{t("Выберите свой город")}</h2>
                </div>
                <span className="muted">{t("Два города. Много историй.")}</span>
              </div>
              <div className="city-cards">
                {cities.map((c) => (
                  <a
                    href="#ideas"
                    key={c.slug}
                    className="city-card"
                    onClick={() => {
                      setCity(c.slug);
                      setQuery("");
                      setCategory("Все");
                    }}
                  >
                    <Photo photoKey={c.slug} />
                    <div className="city-overlay">
                      <div>
                        <h3>{t(c.name)}</h3>
                        <p>
                          {c.slug === "semey"
                            ? t("История · Культура · Иртыш")
                            : t("Горы · Искусство · Впечатления")}
                        </p>
                      </div>
                      <span className="city-arrow">
                        <ArrowUpRight size={22} />
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            </section>
          </>
        ) : (
          <div className="page-heading">
            <div>
              <span className="eyebrow">{t("НАХОДИТЕ СВОЁ")}</span>
              <h1>
                {section === "saved"
                  ? t("Сохранённые идеи")
                  : t("Каталог впечатлений")}
              </h1>
            </div>
          </div>
        )}
        <OpenCulture
          city={city as "semey" | "almaty"}
          onCategory={setCategory}
        />
        <section id="ideas" tabIndex={-1}>
          <div className="section-title">
            <div>
              <span className="eyebrow">
                {t("НАЧНИТЕ С МАЛЕНЬКОГО ПУТЕШЕСТВИЯ")}
              </span>
              <h2>{t("Ваш следующий выходной")}</h2>
            </div>
            <label className="city-select">
              <MapPin size={18} />
              <select
                aria-label={t("Город")}
                value={city}
                onChange={(e) => setCity(e.target.value)}
              >
                {cities.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {t(c.name)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {section !== "home" && (
            <div className="search">
              <Search size={20} />
              <input
                aria-label={t("Поиск мест")}
                type="search"
                placeholder={t("Место, история или новое впечатление")}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}
          <div className="filters">
            {categories.map((c) => (
              <button
                key={t(c)}
                className={c === category ? "selected" : "secondary"}
                aria-pressed={c === category}
                onClick={() => setCategory(c)}
              >
                {c === "Наследие" && <Landmark size={15} />} {t(c)}
              </button>
            ))}
          </div>
          {loading ? (
            <div className="cards">
              {[1, 2, 3].map((i) => (
                <div
                  className="skeleton"
                  key={i}
                  aria-label={t("Загрузка карточки")}
                />
              ))}
            </div>
          ) : (
            <div className="cards">
              {visible
                .filter((l) => section !== "saved" || saved.includes(l.id))
                .map(catalogCard)}
            </div>
          )}
          {!loading &&
            !visible.filter((l) => section !== "saved" || saved.includes(l.id))
              .length && (
              <Empty title={t("Пока нет подходящих идей")}>
                {" "}
                {t("Попробуйте другой город или категорию.")}{" "}
                <button
                  className="secondary"
                  onClick={() => {
                    setQuery("");
                    setCategory("Все");
                  }}
                >
                  {t("Сбросить фильтры")}
                </button>
                {error && (
                  <button onClick={() => void loadCatalog()}>
                    {" "}
                    {t("Повторить загрузку")}{" "}
                  </button>
                )}
              </Empty>
            )}
        </section>
        <section className="how">
          <div>
            <Mountain />
            <h3>{t("Откройте место")}</h3>
            <p>{t("Найдите культурный маршрут или идею выходного.")}</p>
          </div>
          <div>
            {productFeatures.tripPlanning ? <Users /> : <MapPin />}
            <h3>
              {productFeatures.tripPlanning
                ? t("Соберите своих")
                : t("Узнайте о месте")}
            </h3>
            <p>
              {productFeatures.tripPlanning
                ? t("Отправьте приглашение и получите ответы.")
                : t("Посмотрите фотографии, описание и источник сведений.")}
            </p>
          </div>
          <div>
            <Check />
            <h3>
              {productFeatures.tripPlanning
                ? t("Договоритесь")
                : t("Откройте карту")}
            </h3>
            <p>
              {productFeatures.tripPlanning
                ? t("Зафиксируйте время, место встречи и расходы.")
                : t("Найдите место на карте и спланируйте дорогу.")}
            </p>
          </div>
        </section>
      </>
    );
  return (
    <>
      <a className="skip-link" href="#main-content">
        {t("Перейти к содержанию")}
      </a>
      <header className="topbar">
        <a className="wordmark" href="/">
          <Mountain size={28} />
          Qayda<span>{t("открывай со своими")}</span>
        </a>
        <nav aria-label={t("Основная навигация")}>
          <a className={section === "home" ? "current" : ""} href="/">
            {" "}
            {t("Главная")}{" "}
          </a>
          <a className={section === "explore" ? "current" : ""} href="/explore">
            {" "}
            {t("Каталог")}{" "}
          </a>
          {productFeatures.providers && (
            <a
              className={section === "providers" ? "current" : ""}
              href="/providers"
            >
              {" "}
              {t("С кем поехать")}{" "}
            </a>
          )}
          {productFeatures.tripPlanning && (
            <a className={section === "plans" ? "current" : ""} href="/plans">
              {" "}
              {t("Мои планы")}{" "}
            </a>
          )}
        </nav>
        <a className="profile-link" href="/profile">
          <UserRound size={18} />
          {user ? t("Профиль") : t("Войти")}
        </a>
      </header>
      <DisplayControls />
      <main id="main-content" tabIndex={-1}>
        {!db && (
          <div className="demo-label">
            {" "}
            {t(
              "ДЕМОПРОСМОТР · Идеи для проверки интерфейса. Backend ещё не подключён.",
            )}{" "}
          </div>
        )}
        {!ready && <p role="status">{t("Восстанавливаем сессию…")}</p>}
        {error && (
          <div className="error" role="alert">
            {t(error)}
            <button className="text-button" onClick={() => setError("")}>
              {" "}
              {t("Закрыть")}{" "}
            </button>
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {t(notice)}
          </div>
        )}
        {content}
      </main>
      <footer>
        <a className="wordmark" href="/">
          Qayda
        </a>
        <p>{t("Открывай Казахстан со своими.")}</p>
        <div>
          <a href="/privacy">{t("О данных")}</a>
          <a href="/terms">{t("Условия")}</a>
          <a href="/photos">{t("Фотографии")}</a>
          <a href="/open-data">{t("Открытые данные")}</a>
        </div>
        <small>{t("Закрытая тестовая версия · 2026")}</small>
      </footer>
      <nav className="bottom-nav" aria-label={t("Мобильная навигация")}>
        {[
          ["/", "Главная", Compass],
          ["/explore", "Места", Menu],
          ["/providers", "Исполнители", Users],
          ["/plans", "Планы", CalendarDays],
          ["/profile", "Профиль", UserRound],
        ]
          .filter(
            ([href]) =>
              (href !== "/providers" || productFeatures.providers) &&
              (href !== "/plans" || productFeatures.tripPlanning),
          )
          .map(([href, label, Icon]) => {
            const I = Icon as typeof Compass;
            return (
              <a
                key={String(href)}
                href={String(href)}
                aria-current={path === href ? "page" : undefined}
              >
                <I size={21} />
                {t(String(label))}
              </a>
            );
          })}
      </nav>
    </>
  );
}
