"use client";
import { Field, Artwork, Empty } from "./ui";
import { BudgetItemEditor } from "./BudgetItemEditor";
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
} from "lucide-react";
import { client, api, humanError, type Client } from "@qayda/api-client";
import {
  searchCatalogue,
  cities,
  categories,
  demoListings,
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
  const path = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<string | null>(null);
  const [ready, setReady] = useState(!db);
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
  const selected = listings.find((x) => x.id === parts[1]);
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
  const previousUser = useRef<string | null>(null);
  useEffect(() => {
    if (!db) return;
    let live = true;
    const accept = (id: string | null) => {
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
        accept(data.session?.user.id ?? null);
        setReady(true);
        if (error) setError(humanError(error));
      }
    });
    const { data } = db.auth.onAuthStateChange((_, session) => {
      accept(session?.user.id ?? null);
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
      router.replace("/plans");
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
      <ArrowLeft size={18} />
      Назад
    </button>
  );
  const catalogCard = (l: Listing) => (
    <article className="listing" key={l.id}>
      <a href={`/listing/${l.id}`}>
        <Artwork category={l.category} />
        <div className="listing-body">
          <div className="eyebrow">
            {l.category} <span>↗</span>
          </div>
          <h3>{l.title}</h3>
          <p>{l.summary}</p>
          <div className="card-foot">
            <span>
              {l.price_minor !== null
                ? money(l.price_minor)
                : "Стоимость уточняется"}
            </span>
            <small>
              {l.origin === "demo_fixture" ? "Демоидея" : "Подробнее"}
            </small>
          </div>
        </div>
      </a>
    </article>
  );
  const auth = (
    <div className="auth card">
      <span className="eyebrow">СОБИРАЙТЕ ПЛАНЫ ВМЕСТЕ</span>
      <h1>Вход в Qayda</h1>
      <p>
        Каталог открыт всем. Войдите, чтобы создавать планы и отвечать друзьям.
      </p>
      {!db ? (
        <Empty title="Подключение готовится">
          Для входа необходимо настроить Supabase. Просмотр демонстрационных
          идей уже доступен.
        </Empty>
      ) : (
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
              if (section !== "invite") router.push("/plans");
            }
          })}
        >
          {!otpSent ? (
            <label className="field">
              Email
              <input name="email" type="email" autoComplete="email" required />
            </label>
          ) : (
            <label className="field">
              Код из письма
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
              ? "Подождите…"
              : otpSent
                ? "Войти"
                : "Получить письмо для входа"}
          </button>
          {otpSent && (
            <button
              type="button"
              className="secondary"
              onClick={() => setOtpSent(false)}
            >
              Другой email
            </button>
          )}
        </form>
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
        <h1>Завершаем вход</h1>
        <p>
          После входа можно вернуться во вкладку приглашения и вступить в
          компанию.
        </p>
        <a className="button secondary" href="/login">
          Запросить новую ссылку
        </a>
      </div>
    );
  else if (section === "login") content = auth;
  else if (section === "invite")
    content = (
      <div className="narrow">
        {back}
        <div className="card">
          <span className="eyebrow">ВАС ПРИГЛАШАЮТ</span>
          <h1>{preview?.title ?? "Совместный план"}</h1>
          <p>
            Присоединитесь к компании, чтобы увидеть детали и ответить друзьям.
            RSVP не бронирует билеты.
          </p>
          {!token ? (
            <p>
              Откройте полную ссылку приглашения, которую прислал организатор.
            </p>
          ) : preview ? (
            <>
              <p>Ссылка действует до {planDate(preview.expires_at)}</p>
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
                  Вступить в компанию
                </button>
              ) : (
                auth
              )}
            </>
          ) : (
            <p>Проверяем приглашение…</p>
          )}
        </div>
      </div>
    );
  else if (section === "listing" && selected)
    content = (
      <div className="narrow">
        {back}
        <Artwork category={selected.category} large />
        <div className="detail">
          <span className="eyebrow">
            {selected.category} ·{" "}
            {cities.find((c) => c.slug === selected.city)?.name}
          </span>
          <h1>{selected.title}</h1>
          {selected.origin === "demo_fixture" && (
            <p className="banner">
              Демонстрационная идея. Место, условия и маршрут ещё не проверены.
            </p>
          )}
          <p className="lead">{selected.summary}</p>
          {selected.out_of_city && (
            <p className="banner">
              За городом · направление из{" "}
              {selected.city === "semey" ? "Семея" : "Алматы"}
            </p>
          )}
          {selected.kind === "event" && selected.event_starts && (
            <p>Дата события: {planDate(selected.event_starts)}</p>
          )}
          <div className="fact">
            <MapPin size={20} />
            {selected.address ?? "Точное местоположение уточняется"}
          </div>
          <div className="fact">
            <Leaf size={20} />
            {selected.price_minor !== null
              ? money(selected.price_minor)
              : "Стоимость уточнить у организатора"}
          </div>
          {safeUrl(selected.source_url) && (
            <a
              href={safeUrl(selected.source_url)!}
              target="_blank"
              rel="noreferrer"
            >
              Источник сведений <ArrowUpRight size={16} />
            </a>
          )}
          <p className="muted">
            {selected.checked_at
              ? `Проверено ${planDate(selected.checked_at)}`
              : "Дата проверки пока не указана"}
          </p>
          {selected.verified_fields?.length ? (
            <p className="muted">
              Проверены название, описание и указанные данные места. Расписание
              и стоимость уточняются отдельно.
            </p>
          ) : null}
          {mapUrl(selected) && (
            <a
              className="button secondary"
              href={mapUrl(selected)!}
              target="_blank"
              rel="noreferrer"
            >
              Открыть карту
            </a>
          )}
          <button
            onClick={() => {
              if (needAuth()) router.push(`/create/${selected.id}`);
            }}
          >
            Собрать компанию <Users size={18} />
          </button>
          <button
            className="secondary"
            disabled={busy}
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
              ? "Убрать из сохранённого"
              : "Сохранить"}
          </button>
          {user && (
            <form
              onSubmit={form(async (data) => {
                await api.report(db!, selected.id, String(data.get("reason")));
                setNotice("Жалоба передана на проверку");
              })}
            >
              <Field name="reason" label="Сообщить об ошибке" />
              <button className="text-button" disabled={busy}>
                Отправить на проверку
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
        <h1>Собрать компанию</h1>
        <p>{l?.title ?? "Место недоступно"}</p>
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
          <Field name="title" label="Название плана" defaultValue={l?.title} />
          <label className="field">
            Компания
            <select name="group">
              <option value="">Создать новую компанию</option>
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
            label="Дата и время · Алматы (UTC+5)"
            type="datetime-local"
          />
          <Field
            name="meeting"
            label="Где встречаемся"
            placeholder="Например, у главного входа"
          />
          <p className="muted">
            Создадим приватную компанию. Приглашение можно выпустить после
            публикации плана.
          </p>
          <button disabled={busy || !l}>
            {busy ? "Создаём…" : "Создать план"}
          </button>
        </form>
      </div>
    );
  } else if (section === "plans" && planId) {
    content = !user ? (
      auth
    ) : !room ? (
      <Empty title={error ? "План недоступен" : "Загружаем план"}>
        Доступ есть только у участников компании.
      </Empty>
    ) : (
      <div className="room-layout">
        <div className="room-main">
          {back}
          <span className="eyebrow">
            {statusLabels[room.plan.status]} · версия {room.plan.version}
          </span>
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
              <h2>Вы с нами?</h2>
              <p className="muted">
                Ответ означает намерение пойти. Билеты и услуги оформляются
                отдельно.
              </p>
              {rsvp && rsvp.acknowledged_version !== room.plan.version && (
                <p className="banner">
                  План изменился — подтвердите ответ заново.
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
                  <h3>Управление планом</h3>
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
                      <summary>Изменить договорённости</summary>
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
                          label="Название"
                          defaultValue={room.plan.title}
                        />
                        <Field
                          name="starts"
                          type="datetime-local"
                          label="Дата и время · UTC+5"
                          defaultValue={new Date(
                            new Date(room.plan.starts_at).getTime() +
                              5 * 3600000,
                          )
                            .toISOString()
                            .slice(0, 16)}
                        />
                        <Field
                          name="meeting"
                          label="Встреча"
                          defaultValue={room.plan.meeting_note}
                        />
                        <p>
                          Изменение создаст новую версию. Участникам потребуется
                          подтвердить ответы.
                        </p>
                        <button disabled={busy}>Сохранить новую версию</button>
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
                Скачать событие .ics
              </button>
              <p className="muted">
                Разовый экспорт передаст название и место встречи вашему
                календарю. Автоматического обновления нет.
              </p>
            </div>
          )}
          {tab === "Участники" && (
            <div className="card">
              <h2>Компания · {room.members.length}</h2>
              {room.members.map((m) => {
                const r = room.rsvps.find((x) => x.user_id === m.user_id);
                return (
                  <div className="member" key={m.user_id}>
                    <span className="avatar">{m.display_name.slice(0, 1)}</span>
                    <div>
                      <strong>{m.display_name}</strong>
                      <p>
                        {m.user_id === room.plan.owner_id
                          ? "Организатор"
                          : r
                            ? r.acknowledged_version === room.plan.version
                              ? answerLabels[r.answer]
                              : "Нужно подтвердить"
                            : "Не ответил"}
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
                          Передать владение
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
                          Удалить
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
                      router.push("/plans");
                    })
                  }
                >
                  Выйти из компании
                </button>
              )}
            </div>
          )}
          {tab === "Обсуждение" && (
            <div className="card">
              <h2>Обсуждение</h2>
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
                  Загрузить более ранние
                </button>
              )}
              <p className="muted">
                Показаны последние 50 сообщений. Обновите, чтобы получить новые.
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
                          Удалить своё сообщение
                        </button>
                      )}
                  </div>
                ))
              ) : (
                <p>Сообщений пока нет. Обсудите детали поездки.</p>
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
                  Сообщение
                  <textarea name="body" required maxLength={2000} />
                </label>
                <button disabled={busy}>
                  <Send size={16} />
                  Отправить
                </button>
              </form>
            </div>
          )}
          {tab === "Бюджет" && (
            <div className="card">
              <h2>Расходы компании</h2>
              <p className="muted">
                Это предварительный расчёт. Qayda не принимает и не переводит
                деньги.
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
                      {i.cost_kind === "shared" ? "На всех" : "На человека"} ·{" "}
                      {money(i.amount_minor)}
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
                      Убрать
                    </button>
                  )}
                </div>
              ))}
              {room.budget ? (
                <>
                  <h3>{money(room.budget.total_minor)}</h3>
                  {budgetStale && (
                    <p className="banner">
                      Расчёт устарел. Организатору нужно пересчитать доли.
                    </p>
                  )}
                  {Object.entries(room.budget.shares).map(([id, amount]) => (
                    <p key={id}>
                      {room.members.find((m) => m.user_id === id)
                        ?.display_name ?? "Бывший участник"}{" "}
                      — {money(amount)}{" "}
                      {room.budget!.agreed_ids.includes(id) ? "· согласен" : ""}
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
                    Согласен с расчётом
                  </button>
                </>
              ) : (
                <p>Расчёт ещё не сформирован.</p>
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
                      label="Статья расходов"
                      placeholder="Транспорт"
                    />
                    <Field name="amount" label="Сумма, ₸" placeholder="5000" />
                    <label className="field">
                      Распределение
                      <select name="kind">
                        <option value="shared">На всех</option>
                        <option value="per_person">На человека</option>
                      </select>
                    </label>
                    <button disabled={busy}>Добавить статью</button>
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
                    Пересчитать для {going.length} участников
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <aside className="card room-aside">
          <span className="eyebrow">СВОИ ЛЮДИ РЯДОМ</span>
          <h3>{going.length} собираются пойти</h3>
          <p>Договоритесь о деталях и подтвердите план.</p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void act(reloadRoom)}
          >
            Обновить комнату
          </button>
          {owner && (
            <>
              <hr />
              <h3>Пригласить друзей</h3>
              <p>
                Получатель ссылки сможет вступить в компанию. До входа увидит
                только выбранный заголовок.
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
                    `${window.location.origin}/invite#t=${i.token}`,
                  );
                  await reloadRoom();
                })}
              >
                <Field
                  name="preview"
                  label="Заголовок приглашения"
                  defaultValue={room.plan.title}
                />
                <Field
                  name="maxUses"
                  label="Максимум вступлений (1–50)"
                  defaultValue="20"
                />
                <Field
                  name="hours"
                  label="Срок действия в часах (1–168)"
                  defaultValue="168"
                />
                <button
                  disabled={
                    busy ||
                    !["proposed", "confirmed"].includes(room.plan.status)
                  }
                >
                  Создать ссылку
                </button>
              </form>
              {inviteLink && (
                <>
                  <label className="field">
                    Ссылка для друзей
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
                    Скопировать ссылку
                  </button>
                </>
              )}
              {room.invitations.map((i) => (
                <div className="invite-row" key={i.id}>
                  <small>
                    {i.revoked_at
                      ? "Отозвана"
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
                      Отозвать
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
            <span className="eyebrow">СОБИРАЙТЕ ВПЕЧАТЛЕНИЯ</span>
            <h1>{section === "calendar" ? "Ваш календарь" : "Ваши планы"}</h1>
          </div>
          <a className="button" href="/explore">
            <Plus size={18} />
            Новый план
          </a>
        </div>
        <div className="row">
          <a className="button secondary" href="/plans">
            Все планы
          </a>
          <a className="button secondary" href="/calendar">
            Календарь
          </a>
        </div>
        {!plans.length ? (
          <Empty title="Первая встреча ещё впереди">
            Выберите идею в каталоге и соберите компанию.
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
                  <span className="eyebrow">{statusLabels[p.status]}</span>
                  <h2>{p.title}</h2>
                  <p>{planDate(p.starts_at)}</p>
                  <p>{p.meeting_note}</p>
                  {plans.some((q) => overlaps(p, q)) && (
                    <p className="banner">
                      Другой план начинается в это же время
                    </p>
                  )}
                  <span className="link">Открыть план →</span>
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
        <h1>Ваш профиль</h1>
        <div className="card">
          <form
            onSubmit={form(async (data) => {
              await api.profile(db!, String(data.get("name")));
              setNotice("Имя сохранено");
            })}
          >
            <Field name="name" label="Как вас зовут" />
            <button disabled={busy}>Сохранить</button>
          </form>
          <a className="button secondary" href="/submit">
            Предложить место или событие
          </a>
          <a className="button secondary" href="/saved">
            Сохранённые идеи
          </a>
          <a className="button secondary" href="/admin">
            Редакторская проверка
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
            Выйти
          </button>
          <details>
            <summary>Удаление аккаунта</summary>
            <p>
              Запрос передаётся администратору. До фактического удаления нужно
              обработать владение компаниями и личные данные.
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
              Запросить удаление
            </button>
          </details>
        </div>
        <h2>Мои предложения</h2>
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
                Редактировать
              </a>
            )}
          </div>
        ))}
        <h2>Обновления планов</h2>
        {notifications.length ? (
          notifications.map((n) => (
            <p className="card" key={n.id}>
              {n.body} <small>{planDate(n.created_at)}</small>
            </p>
          ))
        ) : (
          <p>Обновлений пока нет.</p>
        )}
      </div>
    );
  else if (section === "submit")
    content = !user ? (
      auth
    ) : parts[1] && !submission ? (
      <Empty
        title={submissionsLoaded ? "Черновик недоступен" : "Загружаем черновик"}
      >
        Дождитесь загрузки или вернитесь к своим предложениям.
      </Empty>
    ) : (
      <div className="narrow">
        {back}
        <h1>Поделиться открытием</h1>
        <p>
          Перед публикацией редактор проверит сведения. Правка опубликованного
          предложения снимет его с показа до повторной проверки.
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
            label="Название"
            defaultValue={submission?.title}
          />
          <label className="field">
            Город
            <select name="city" defaultValue={submission?.city}>
              {cities.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Категория
            <select name="category" defaultValue={submission?.category}>
              {categories.slice(1).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Тип
            <select
              name="kind"
              aria-label="Тип"
              defaultValue={submission?.kind ?? "place"}
            >
              <option value="place">Место</option>
              <option value="experience">Программа</option>
              <option value="event">Событие</option>
            </select>
          </label>
          <Field
            name="event_starts"
            label="Дата события · UTC+5 (для события обязательна)"
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
            Описание
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
            label="Публичное место или адрес"
            defaultValue={submission?.address ?? undefined}
          />
          <label className="checkbox">
            <input type="checkbox" name="rights" required />
            Подтверждаю право публиковать описание
          </label>
          <div className="row wrap">
            <button disabled={busy}>Отправить на проверку</button>
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
              Сохранить черновик
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
        <h1>Редакторская проверка</h1>
        {!error && <CatalogEditor db={db!} listings={listings} />}
        <p>
          Доступ назначается администратором БД. Пользователь не может выдать
          его себе.
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
              <Field name="reason" label="Причина отклонения" />
              <button className="secondary" disabled={busy}>
                Отклонить
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
              Опубликовать после проверки
            </button>
          </div>
        ))}
      </>
    );
  else if (section === "privacy" || section === "terms")
    content = (
      <div className="narrow card">
        <h1>
          {section === "privacy" ? "О данных в Qayda" : "Условия использования"}
        </h1>
        <p>
          Это версия для закрытого тестирования. Для аккаунта используются
          email, отображаемое имя, планы и ответы участников. Компания и
          обсуждение доступны её активным участникам.
        </p>
        <p>
          Приглашение можно переслать. Не включайте чувствительные сведения в
          его заголовок. Экспорт календаря передаёт выбранные детали во внешний
          календарь.
        </p>
        <p>
          RSVP не бронирует услугу. Бюджет является пользовательским расчётом.
          Внешние билеты и услуги оформляются у продавца.
        </p>
        <p>
          Перед публичным запуском требуется утвердить оператора сервиса,
          инфраструктуру, сроки хранения, контакты для обращений и окончательные
          юридические тексты.
        </p>
      </div>
    );
  else
    content = (
      <>
        {section === "home" ? (
          <section className="hero">
            <div className="hero-copy">
              <span className="eyebrow">
                <span className="dot" />
                КАЗАХСТАН БЛИЖЕ, ЧЕМ КАЖЕТСЯ
              </span>
              <h1>
                Куда поедем
                <br />
                <em>вместе?</em>
              </h1>
              <p>
                Места с историей. Поездки с близкими.
                <br />
                Откройте своё следующее впечатление.
              </p>
              <a className="button cream" href="#ideas">
                Найти свою идею <ArrowUpRight size={18} />
              </a>
              <div className="hero-note">
                <Users size={18} />
                Выбирайте место. Собирайте своих.
              </div>
            </div>
            <div className="hero-art">
              <Artwork category="Природа" large />
              <span className="art-caption">
                КАЗАХСТАН · ПРОСТРАНСТВО ОТКРЫТИЙ
              </span>
            </div>
          </section>
        ) : (
          <div className="page-heading">
            <div>
              <span className="eyebrow">НАХОДИТЕ СВОЁ</span>
              <h1>
                {section === "saved"
                  ? "Сохранённые идеи"
                  : "Каталог впечатлений"}
              </h1>
            </div>
          </div>
        )}
        <section id="ideas">
          <div className="section-title">
            <div>
              <span className="eyebrow">НАЧНИТЕ С МАЛЕНЬКОГО ПУТЕШЕСТВИЯ</span>
              <h2>Ваш следующий выходной</h2>
            </div>
            <label className="city-select">
              <MapPin size={18} />
              <select
                aria-label="Город"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              >
                {cities.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="search">
            <Search size={20} />
            <input
              aria-label="Поиск мест"
              type="search"
              placeholder="Место, история или новое впечатление"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="filters">
            {categories.map((c) => (
              <button
                key={c}
                className={c === category ? "selected" : "secondary"}
                aria-pressed={c === category}
                onClick={() => setCategory(c)}
              >
                {c === "Наследие" && <Landmark size={15} />} {c}
              </button>
            ))}
          </div>
          {loading ? (
            <div className="cards">
              {[1, 2, 3].map((i) => (
                <div
                  className="skeleton"
                  key={i}
                  aria-label="Загрузка карточки"
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
              <Empty title="Пока нет подходящих идей">
                Попробуйте другой город или категорию.
                {error && (
                  <button onClick={() => void loadCatalog()}>
                    Повторить загрузку
                  </button>
                )}
              </Empty>
            )}
        </section>
        <section className="how">
          <div>
            <Mountain />
            <h3>Откройте место</h3>
            <p>Найдите культурный маршрут или идею выходного.</p>
          </div>
          <div>
            <Users />
            <h3>Соберите своих</h3>
            <p>Отправьте приглашение и получите ответы.</p>
          </div>
          <div>
            <Check />
            <h3>Договоритесь</h3>
            <p>Зафиксируйте время, место встречи и расходы.</p>
          </div>
        </section>
      </>
    );
  return (
    <>
      <header className="topbar">
        <a className="wordmark" href="/">
          <Mountain size={28} />
          Qayda<span>открывай со своими</span>
        </a>
        <nav aria-label="Основная навигация">
          <a className={section === "home" ? "current" : ""} href="/">
            Главная
          </a>
          <a className={section === "explore" ? "current" : ""} href="/explore">
            Каталог
          </a>
          <a className={section === "plans" ? "current" : ""} href="/plans">
            Мои планы
          </a>
        </nav>
        <a className="profile-link" href="/profile">
          <UserRound size={18} />
          {user ? "Профиль" : "Войти"}
        </a>
      </header>
      <main>
        {!db && (
          <div className="demo-label">
            ДЕМОПРОСМОТР · Идеи и иллюстрации для проверки интерфейса. Backend
            ещё не подключён.
          </div>
        )}
        {!ready && <p role="status">Восстанавливаем сессию…</p>}
        {error && (
          <div className="error" role="alert">
            {error}
            <button className="text-button" onClick={() => setError("")}>
              Закрыть
            </button>
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
          </div>
        )}
        {content}
      </main>
      <footer>
        <a className="wordmark" href="/">
          Qayda
        </a>
        <p>Открывай Казахстан со своими.</p>
        <div>
          <a href="/privacy">О данных</a>
          <a href="/terms">Условия</a>
        </div>
        <small>Закрытая тестовая версия · 2026</small>
      </footer>
      <nav className="bottom-nav" aria-label="Мобильная навигация">
        {[
          ["/", "Главная", Compass],
          ["/explore", "Каталог", Menu],
          ["/plans", "Планы", CalendarDays],
          ["/profile", "Профиль", UserRound],
        ].map(([href, label, Icon]) => {
          const I = Icon as typeof Compass;
          return (
            <a
              key={String(href)}
              href={String(href)}
              aria-current={path === href ? "page" : undefined}
            >
              <I size={21} />
              {String(label)}
            </a>
          );
        })}
      </nav>
    </>
  );
}
