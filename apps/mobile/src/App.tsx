import type { ReactNode } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  Share,
  Linking,
  ActivityIndicator,
  TextInput,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import * as ExpoLinking from "expo-linking";
import { api } from "@qayda/api-client";
import {
  photos,
  listingPhoto,
  cities,
  categories,
  answerLabels,
  statusLabels,
  money,
  parseMoney,
  localToUtc,
  planDate,
  mapUrl,
  safeUrl,
  type Listing,
  type Answer,
} from "@qayda/domain";
import { db } from "./backend";
import { useModel } from "./model";
import { Button, Field, Art, Card, Heading, Copy } from "./ui";
import { color, s } from "./theme";
export { NativeProvider } from "./model";
export default function App() {
  const model = useModel();
  const {
    path,
    router,
    section,
    id,
    go,
    user,
    isGuest,
    visible,
    loading,
    city,
    setCity,
    category,
    setCategory,
    query,
    setQuery,
    saved,
    plans,
    setPlans,
    setRoom,
    setSaved,
    room,
    error,
    setError,
    notice,
    setNotice,
    busy,
    email,
    setEmail,
    code,
    setCode,
    sent,
    setSent,
    name,
    setName,
    title,
    setTitle,
    starts,
    setStarts,
    meeting,
    setMeeting,
    body,
    setBody,
    reportReason,
    setReportReason,
    amount,
    setAmount,
    itemTitle,
    setItemTitle,
    kind,
    setKind,
    editingItem,
    setEditingItem,
    selectedGroup,
    setSelectedGroup,
    notifications,
    tab,
    setTab,
    olderDone,
    setOlderDone,
    token,
    setToken,
    preview,
    submissions,
    submissionId,
    setSubmissionId,
    submissionKind,
    setSubmissionKind,
    request,
    messageRequest,
    act,
    catalog,
    refresh,
    l,
    owner,
    auth,
  } = model;
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
    <Button
      secondary
      onPress={() => (router.canGoBack() ? router.back() : go("/"))}
    >
      ← Назад
    </Button>
  );
  const login = (
    <Card>
      <Text style={s.eyebrow}>СОБИРАЙТЕ ПЛАНЫ ВМЕСТЕ</Text>
      <Text style={s.h1}>Вход в Qayda</Text>
      <Copy>Войдите, чтобы создавать планы и отвечать друзьям.</Copy>
      {!db ? (
        <Copy>
          Backend пока не подключён. Можно посмотреть демонстрационный каталог.
        </Copy>
      ) : (
        <>
          <Field label="Ваше имя" value={name} onChange={setName} />
          <Copy>
            Вход по имени сохраняется на этом устройстве. После выхода или
            очистки приложения восстановить его нельзя.
          </Copy>
          <Button
            disabled={busy || !name.trim()}
            onPress={() =>
              void act(async () => {
                const cleanName = name.trim();
                if (!cleanName || cleanName.length > 80)
                  throw new Error("Укажите имя длиной от 1 до 80 символов");
                const { error } = await db!.auth.signInAnonymously();
                if (error) throw error;
                await api.profile(db!, cleanName);
                if (section !== "invite") go("/plans");
              })
            }
          >
            Продолжить по имени
          </Button>
          <Copy>Или войдите по email</Copy>
          {!sent ? (
            <Field
              label="Email"
              value={email}
              onChange={setEmail}
              keyboardType="email-address"
            />
          ) : (
            <Field
              label="Код из письма"
              value={code}
              onChange={setCode}
              keyboardType="numeric"
            />
          )}
          <Button
            disabled={busy}
            onPress={() =>
              void act(async () => {
                if (!sent) {
                  const { error } = await db!.auth.signInWithOtp({
                    email: email.trim(),
                    options: {
                      emailRedirectTo: ExpoLinking.createURL("/login"),
                    },
                  });
                  if (error) throw error;
                  setSent(true);
                  setNotice(
                    "Откройте ссылку из письма. Если в письме есть код, введите его ниже.",
                  );
                } else {
                  const { error } = await db!.auth.verifyOtp({
                    email: email.trim(),
                    token: code,
                    type: "email",
                  });
                  if (error) throw error;
                  go(token ? "/invite" : "/plans");
                }
              })
            }
          >
            {sent ? "Войти по коду" : "Получить письмо для входа"}
          </Button>
          {sent && (
            <Button secondary onPress={() => setSent(false)}>
              Другой email
            </Button>
          )}
        </>
      )}
    </Card>
  );
  const listCard = (x: Listing) => (
    <Pressable
      key={x.id}
      accessibilityRole="button"
      accessibilityLabel={x.title}
      onPress={() => go(`/listing/${x.id}`)}
      style={s.listing}
    >
      <Art listingId={x.id} height={165} />
      <View style={s.listBody}>
        <Text style={s.eyebrow}>
          {x.category} ·{" "}
          {x.origin === "demo_fixture" ? "Демоидея" : "Подробнее"}
        </Text>
        <Heading>{x.title}</Heading>
        <Copy lines={2}>{x.summary}</Copy>
        <Text style={s.price}>
          {x.price_minor !== null
            ? money(x.price_minor)
            : "Стоимость уточняется"}{" "}
          →
        </Text>
      </View>
    </Pressable>
  );
  let content: ReactNode;
  if (section === "login") content = login;
  else if (section === "invite")
    content = (
      <>
        {back}
        <Card>
          <Text style={s.eyebrow}>ВАС ПРИГЛАШАЮТ</Text>
          <Text style={s.h1}>{preview || "Совместный план"}</Text>
          <Copy>
            До вступления детали компании скрыты. Ответ не бронирует билет.
          </Copy>
          {!token ? (
            <Copy>Откройте полную ссылку от организатора.</Copy>
          ) : user ? (
            <Button
              disabled={busy || !preview}
              onPress={() =>
                void act(async () => {
                  const pid = await api.redeem(db!, token);
                  setToken("");
                  go(`/plans/${pid}`);
                })
              }
            >
              Вступить в компанию
            </Button>
          ) : (
            login
          )}
        </Card>
      </>
    );
  else if (section === "photos")
    content = (
      <>
        {back}
        <Heading>Фотографии Казахстана</Heading>
        <Copy>
          Фотографии уменьшены и кадрируются по размеру карточки. Спасибо
          авторам за открытые снимки.
        </Copy>
        {Object.entries(photos).map(([key, photo]) => (
          <Card key={key}>
            <Art photoKey={key as keyof typeof photos} />
            <Heading>{photo.alt}</Heading>
            <Copy>
              {photo.author} · {photo.license}
            </Copy>
            <Button
              secondary
              onPress={() => void Linking.openURL(photo.source)}
            >
              Оригинал и лицензия ↗
            </Button>
          </Card>
        ))}
      </>
    );
  else if (section === "listing")
    content = l ? (
      <>
        {back}
        <Art listingId={l.id} large />
        {listingPhoto(l.id) && (
          <Pressable
            accessibilityRole="link"
            onPress={() => go("/photos")}
            style={{ paddingVertical: 10, minHeight: 44 }}
          >
            <Text style={s.label}>
              Фото: {photos[listingPhoto(l.id)!].author} · Лицензия ↗
            </Text>
          </Pressable>
        )}
        <Text style={s.eyebrow}>
          {l.category} · {cities.find((c) => c.slug === l.city)?.name}
        </Text>
        <Text style={s.h1}>{l.title}</Text>
        {l.origin === "demo_fixture" && (
          <Text style={s.banner}>
            Демоидея. Маршрут и условия ещё не проверены.
          </Text>
        )}
        <Copy>{l.summary}</Copy>
        <Card>
          <Copy>{l.address ?? "Адрес уточняется"}</Copy>
          <Copy>
            {l.price_minor
              ? money(l.price_minor)
              : "Стоимость уточнить у организатора"}
          </Copy>
          <Copy>
            {l.checked_at
              ? `Проверено ${planDate(l.checked_at)}`
              : "Дата проверки пока не указана"}
          </Copy>
          {safeUrl(l.source_url) && (
            <Button
              secondary
              onPress={() => void Linking.openURL(safeUrl(l.source_url)!)}
            >
              Источник сведений ↗
            </Button>
          )}
          {mapUrl(l) && (
            <Button secondary onPress={() => void Linking.openURL(mapUrl(l)!)}>
              Открыть карту ↗
            </Button>
          )}
        </Card>
        <Button
          onPress={() => {
            if (auth()) {
              setTitle(l.title);
              setStarts("");
              setMeeting("");
              go(`/create/${l.id}`);
            }
          }}
        >
          Собрать компанию
        </Button>
        <Button
          secondary
          disabled={busy}
          onPress={() => {
            if (auth())
              void act(async () => {
                await api.save(db!, l.id, !saved.includes(l.id));
                await refresh();
              });
          }}
        >
          {saved.includes(l.id) ? "Убрать из сохранённого" : "♡ Сохранить"}
        </Button>
        <Card>
          <Field
            label="Сообщить об ошибке в карточке"
            value={reportReason}
            onChange={setReportReason}
          />
          <Button
            secondary
            disabled={busy || reportReason.trim().length < 3}
            onPress={() => {
              if (auth())
                void act(async () => {
                  await api.report(db!, l.id, reportReason);
                  setReportReason("");
                  setNotice("Жалоба передана на проверку");
                });
            }}
          >
            Отправить на проверку
          </Button>
        </Card>
      </>
    ) : (
      <Copy>Место не найдено. Вернитесь в каталог.</Copy>
    );
  else if (section === "create")
    content = !user ? (
      login
    ) : (
      <>
        {back}
        <Text style={s.h1}>Создать план</Text>
        {l && <Art listingId={l.id} />}
        <Copy>{l?.title}</Copy>
        <Card>
          <Field label="Название плана" value={title} onChange={setTitle} />
          <Copy>Компания</Copy>
          <Button
            secondary={selectedGroup !== ""}
            onPress={() => setSelectedGroup("")}
          >
            Новая компания
          </Button>
          {plans
            .filter(
              (p, i, a) =>
                p.owner_id === user &&
                a.findIndex((q) => q.group_id === p.group_id) === i,
            )
            .map((p) => (
              <Button
                key={p.group_id}
                secondary={selectedGroup !== p.group_id}
                onPress={() => setSelectedGroup(p.group_id)}
              >
                {p.title}
              </Button>
            ))}
          <Field
            label="Дата и время · Алматы (UTC+5)"
            value={starts}
            onChange={setStarts}
            placeholder="2026-11-01T11:00"
          />
          <Copy>
            Выберите будущую дату и время Алматы. Планировать можно на ближайшие
            два года.
          </Copy>
          <Field label="Место встречи" value={meeting} onChange={setMeeting} />
          <Button
            disabled={busy || !l}
            onPress={() =>
              void act(async () => {
                request.current ||= Crypto.randomUUID();
                const pid = await api.createPlan(db!, {
                  listing_id: l!.id,
                  title,
                  starts_at: localToUtc(starts),
                  meeting_note: meeting,
                  request_id: request.current,
                  group_id: selectedGroup || undefined,
                });
                request.current = "";
                go(`/plans/${pid}`);
              })
            }
          >
            Создать план
          </Button>
        </Card>
      </>
    );
  else if (section === "plans" && id)
    content = !user ? (
      login
    ) : !room ? (
      <Copy>{error ? "План недоступен" : "Загружаем план…"}</Copy>
    ) : (
      <>
        {back}
        <Text style={s.eyebrow}>
          {statusLabels[room.plan.status]} · версия {room.plan.version}
        </Text>
        {room.plan.listing_id && <Art listingId={room.plan.listing_id} />}
        <Text style={s.h1}>{room.plan.title}</Text>
        <Copy>{planDate(room.plan.starts_at)}</Copy>
        <Copy>{room.plan.meeting_note}</Copy>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={s.chips}>
            {["План", "Участники", "Обсуждение", "Бюджет"].map((t) => (
              <Button key={t} secondary={tab !== t} onPress={() => setTab(t)}>
                {t}
              </Button>
            ))}
          </View>
        </ScrollView>
        {tab === "План" && (
          <>
            <Card>
              <Heading>Вы с нами?</Heading>
              <Copy>RSVP — намерение пойти. Билеты оформляются отдельно.</Copy>
              {room.rsvps.find(
                (r) =>
                  r.user_id === user &&
                  r.acknowledged_version !== room.plan.version,
              ) && (
                <Text style={s.banner}>
                  План изменился. Подтвердите участие заново.
                </Text>
              )}
              {(Object.keys(answerLabels) as Answer[]).map((a) => (
                <Button
                  key={a}
                  secondary={
                    !room.rsvps.some(
                      (r) =>
                        r.user_id === user &&
                        r.answer === a &&
                        r.acknowledged_version === room.plan.version,
                    )
                  }
                  disabled={
                    busy ||
                    !["proposed", "confirmed"].includes(room.plan.status)
                  }
                  onPress={() =>
                    void act(async () => {
                      await api.rsvp(db!, id, room.plan.version, a);
                      await refresh();
                    })
                  }
                >
                  {answerLabels[a]}
                </Button>
              ))}
            </Card>
            {owner && (
              <Card>
                <Heading>Управление планом</Heading>
                {(room.plan.status === "draft"
                  ? ["publish", "cancel"]
                  : room.plan.status === "proposed"
                    ? ["confirm", "cancel"]
                    : room.plan.status === "confirmed"
                      ? ["complete", "cancel"]
                      : []
                ).map((a) => (
                  <Button
                    key={a}
                    secondary={a === "cancel"}
                    disabled={busy}
                    onPress={() =>
                      void act(async () => {
                        await api.action(db!, id, room.plan.version, a);
                        await refresh();
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
                  </Button>
                ))}
                {["draft", "proposed", "confirmed"].includes(
                  room.plan.status,
                ) && (
                  <>
                    <Field
                      label="Новое время · ГГГГ-ММ-ДДTЧЧ:ММ"
                      value={starts}
                      onChange={setStarts}
                    />
                    <Copy>
                      Изменение времени потребует новых ответов участников.
                    </Copy>
                    <Button
                      secondary
                      disabled={busy || !starts}
                      onPress={() =>
                        void act(async () => {
                          await api.action(
                            db!,
                            id,
                            room.plan.version,
                            room.plan.status === "confirmed"
                              ? "revise"
                              : "edit",
                            { starts_at: localToUtc(starts) },
                          );
                          setStarts("");
                          await refresh();
                        })
                      }
                    >
                      Изменить время
                    </Button>
                    <Button
                      disabled={busy || room.plan.status === "draft"}
                      onPress={() =>
                        void act(async () => {
                          const i = await api.invite(db!, id, room.plan.title);
                          const base = process.env.EXPO_PUBLIC_APP_URL;
                          if (!base)
                            throw new Error(
                              "Не настроен адрес веб-приглашений",
                            );
                          await Share.share({
                            message: `${base}/invite#t=${i.token}`,
                          });
                          await refresh();
                        })
                      }
                    >
                      Пригласить друзей ↗
                    </Button>
                    <Copy>
                      Ссылка даёт возможность вступить. Срок — 7 дней, до 20
                      вступлений.
                    </Copy>
                    {room.invitations
                      .filter((i) => !i.revoked_at)
                      .map((i) => (
                        <Button
                          key={i.id}
                          secondary
                          disabled={busy}
                          onPress={() =>
                            void act(async () => {
                              await api.revoke(db!, i.id);
                              await refresh();
                            })
                          }
                        >
                          Отозвать ссылку · {i.uses_count}/{i.max_uses}
                        </Button>
                      ))}
                  </>
                )}
              </Card>
            )}
            <Button secondary onPress={() => go(`/calendar/${id}`)}>
              Добавить в календарь
            </Button>
          </>
        )}
        {tab === "Участники" && (
          <Card>
            <Heading>Компания · {room.members.length}</Heading>
            {room.members.map((m) => {
              const r = room.rsvps.find((r) => r.user_id === m.user_id);
              return (
                <View key={m.user_id} style={s.member}>
                  <Text style={s.memberName}>
                    {m.display_name}
                    {m.user_id === room.plan.owner_id ? " · организатор" : ""}
                  </Text>
                  <Copy>
                    {r
                      ? r.acknowledged_version === room.plan.version
                        ? answerLabels[r.answer]
                        : "Нужно подтвердить"
                      : "Не ответил"}
                  </Copy>
                  {owner && m.user_id !== user && (
                    <>
                      <Button
                        secondary
                        disabled={busy}
                        onPress={() =>
                          void act(async () => {
                            await api.removeMember(db!, id, m.user_id);
                            await refresh();
                          })
                        }
                      >
                        Удалить участника
                      </Button>
                      <Button
                        secondary
                        disabled={busy}
                        onPress={() =>
                          void act(async () => {
                            await api.transfer(db!, id, m.user_id);
                            await refresh();
                          })
                        }
                      >
                        Передать владение
                      </Button>
                    </>
                  )}
                </View>
              );
            })}
            {!owner && (
              <Button
                secondary
                disabled={busy}
                onPress={() =>
                  void act(async () => {
                    await api.leave(db!, id);
                    go("/plans");
                  })
                }
              >
                Выйти из компании
              </Button>
            )}
          </Card>
        )}
        {tab === "Обсуждение" && (
          <Card>
            <Heading>Обсуждение</Heading>
            {room.messages.length >= 50 && !olderDone && (
              <Button
                secondary
                disabled={busy}
                onPress={() =>
                  void act(async () => {
                    const page = await api.messages(db!, id, room.messages[0]);
                    setRoom({
                      ...room,
                      messages: [...page.items, ...room.messages],
                    });
                    setOlderDone(!page.has_more);
                  })
                }
              >
                Загрузить более ранние
              </Button>
            )}
            <Copy>
              Последние 50 сообщений. Нажмите «Обновить», чтобы получить новые.
            </Copy>
            {room.messages.map((m) => (
              <View key={m.id} style={s.message}>
                <Text style={s.label}>
                  {room.members.find((x) => x.user_id === m.author_id)
                    ?.display_name ?? "Бывший участник"}
                </Text>
                <Copy>{m.body}</Copy>
                <Text style={s.label}>{planDate(m.created_at)}</Text>
              </View>
            ))}
            <Field
              label="Сообщение"
              value={body}
              onChange={setBody}
              multiline
            />
            <Button
              disabled={busy || !body.trim()}
              onPress={() =>
                void act(async () => {
                  messageRequest.current ||= Crypto.randomUUID();
                  await api.message(db!, id, body, messageRequest.current);
                  messageRequest.current = "";
                  setBody("");
                  await refresh();
                })
              }
            >
              Отправить
            </Button>
          </Card>
        )}
        {tab === "Бюджет" && (
          <Card>
            <Heading>Расходы компании</Heading>
            <Copy>
              Пользовательская оценка. Qayda не принимает и не переводит деньги.
            </Copy>
            {room.items.map((i) => (
              <View key={i.id} style={s.member}>
                <Text style={s.memberName}>{i.title}</Text>
                <Copy>
                  {money(i.amount_minor)} ·{" "}
                  {i.cost_kind === "shared" ? "на всех" : "на человека"}
                </Copy>
                {owner && (
                  <Button
                    secondary
                    onPress={() => {
                      setEditingItem(i.id);
                      setItemTitle(i.title);
                      const v = BigInt(i.amount_minor);
                      setAmount(
                        `${v / 100n}.${String(v % 100n).padStart(2, "0")}`,
                      );
                      setKind(i.cost_kind);
                    }}
                  >
                    Изменить статью
                  </Button>
                )}
                {owner && (
                  <Button
                    secondary
                    disabled={busy}
                    onPress={() =>
                      void act(async () => {
                        await api.removeBudget(
                          db!,
                          id,
                          room.plan.version,
                          i.id,
                        );
                        await refresh();
                      })
                    }
                  >
                    Убрать
                  </Button>
                )}
              </View>
            ))}
            {room.budget && (
              <>
                <Heading>{money(room.budget.total_minor)}</Heading>
                {budgetStale && (
                  <Text style={s.banner}>
                    Расчёт устарел. Организатору нужно пересчитать доли.
                  </Text>
                )}
                <Copy>
                  Расчёт версии {room.budget.version}. При изменении плана или
                  состава нужно пересчитать доли.
                </Copy>
                {Object.entries(room.budget.shares).map(([uid, v]) => (
                  <Copy key={uid}>
                    {room.members.find((m) => m.user_id === uid)
                      ?.display_name ?? "Бывший участник"}
                    : {money(v)}{" "}
                    {room.budget!.agreed_ids.includes(uid) ? "· согласен" : ""}
                  </Copy>
                ))}
                <Button
                  secondary
                  disabled={busy || budgetStale}
                  onPress={() =>
                    void act(async () => {
                      await api.agreeBudget(db!, id, room.budget!.version);
                      await refresh();
                    })
                  }
                >
                  Согласен с расчётом
                </Button>
              </>
            )}
            {owner && (
              <>
                <Field
                  label="Статья расходов"
                  value={itemTitle}
                  onChange={setItemTitle}
                />
                <Field
                  label="Сумма, ₸"
                  value={amount}
                  onChange={setAmount}
                  keyboardType="decimal-pad"
                />
                <View style={s.chips}>
                  {[
                    ["shared", "На всех"],
                    ["per_person", "На человека"],
                  ].map(([k, t]) => (
                    <Button
                      key={k}
                      secondary={kind !== k}
                      onPress={() => setKind(k)}
                    >
                      {t}
                    </Button>
                  ))}
                </View>
                <Button
                  disabled={busy}
                  onPress={() =>
                    void act(async () => {
                      if (editingItem)
                        await api.editBudget(
                          db!,
                          id,
                          room.plan.version,
                          editingItem,
                          itemTitle,
                          parseMoney(amount).toString(),
                          kind,
                        );
                      else
                        await api.budget(
                          db!,
                          id,
                          room.plan.version,
                          itemTitle,
                          parseMoney(amount).toString(),
                          kind,
                        );
                      setEditingItem("");
                      setItemTitle("");
                      setAmount("");
                      await refresh();
                    })
                  }
                >
                  {editingItem ? "Сохранить статью" : "Добавить статью"}
                </Button>
                <Button
                  secondary
                  disabled={busy}
                  onPress={() =>
                    void act(async () => {
                      await api.recalculate(db!, id, room.plan.version);
                      await refresh();
                    })
                  }
                >
                  Пересчитать доли
                </Button>
              </>
            )}
          </Card>
        )}
        <Button secondary disabled={busy} onPress={() => void act(refresh)}>
          Обновить комнату
        </Button>
      </>
    );
  else if (section === "calendar" && id)
    content = (
      <>
        {back}
        <Text style={s.h1}>Добавить в календарь</Text>
        <Copy>
          Разовый экспорт .ics. Название и место встречи передаются выбранному
          календарю. Синхронизации нет.
        </Copy>
        <Button
          disabled={busy}
          onPress={() =>
            void act(async () => {
              if (!db) throw new Error("Войдите в аккаунт");
              const r = await api.room(db, id);
              const { calendarIcs } = await import("@qayda/domain");
              const { File, Paths } = await import("expo-file-system");
              const Sharing = await import("expo-sharing");
              if (Platform.OS === "web")
                throw new Error(
                  "Экспорт доступен в нативном приложении или веб-кабинете",
                );
              const file = new File(Paths.cache, `qayda-${r.plan.id}.ics`);
              await file.write(calendarIcs(r.plan));
              if (!(await Sharing.isAvailableAsync()))
                throw new Error("Системное меню экспорта недоступно");
              await Sharing.shareAsync(file.uri, {
                mimeType: "text/calendar",
                UTI: "public.calendar-event",
              });
            })
          }
        >
          Экспортировать .ics
        </Button>
      </>
    );
  else if (section === "plans" || section === "calendar")
    content = !user ? (
      login
    ) : (
      <>
        <Text style={s.eyebrow}>СОБИРАЙТЕ ВПЕЧАТЛЕНИЯ</Text>
        <Text style={s.h1}>
          {section === "calendar" ? "Календарь" : "Ваши планы"}
        </Text>
        <Button onPress={() => go("/explore")}>+ Новый план</Button>
        <Button
          secondary
          onPress={() => go(section === "calendar" ? "/plans" : "/calendar")}
        >
          {section === "calendar" ? "Все планы" : "Календарь"}
        </Button>
        {!plans.length && (
          <Card>
            <Heading>Первая встреча ещё впереди</Heading>
            <Copy>Выберите идею в каталоге и соберите компанию.</Copy>
          </Card>
        )}
        {plans
          .filter((p) => section !== "calendar" || p.status === "confirmed")
          .map((p) => (
            <Pressable
              key={p.id}
              onPress={() => go(`/plans/${p.id}`)}
              accessibilityRole="button"
            >
              <Card>
                {p.listing_id && <Art listingId={p.listing_id} />}
                <Text style={s.eyebrow}>{statusLabels[p.status]}</Text>
                <Heading>{p.title}</Heading>
                <Copy>{planDate(p.starts_at)}</Copy>
                <Copy>{p.meeting_note}</Copy>
                <Text style={s.price}>Открыть план →</Text>
              </Card>
            </Pressable>
          ))}
      </>
    );
  else if (section === "profile")
    content = !user ? (
      login
    ) : (
      <>
        <Text style={s.h1}>Ваш профиль</Text>
        {isGuest && (
          <Copy>
            Вы вошли по имени. После выхода или очистки приложения доступ к
            этому профилю будет потерян.
          </Copy>
        )}
        <Card>
          <Field label="Как вас зовут" value={name} onChange={setName} />
          <Button
            disabled={busy}
            onPress={() =>
              void act(async () => {
                await api.profile(db!, name);
                setNotice("Имя сохранено");
              })
            }
          >
            Сохранить имя
          </Button>
          <Button secondary onPress={() => go("/saved")}>
            Сохранённые идеи
          </Button>
          <Button
            secondary
            onPress={() => {
              setSubmissionId("");
              setSubmissionKind("place");
              setTitle("");
              setBody("");
              setMeeting("");
              setStarts("");
              go("/submit");
            }}
          >
            Предложить место
          </Button>
          <Button
            secondary
            onPress={() =>
              void Linking.openURL(
                `${process.env.EXPO_PUBLIC_APP_URL ?? "http://localhost:3000"}/privacy`,
              )
            }
          >
            О данных и приватности ↗
          </Button>
          <Button
            secondary
            disabled={busy}
            onPress={() =>
              void act(async () => {
                await db!.auth.signOut();
                setPlans([]);
                setRoom(null);
                setSaved([]);
              })
            }
          >
            Выйти
          </Button>
          <Button
            secondary
            disabled={busy}
            onPress={() =>
              void act(async () => {
                await api.deletion(db!);
                setNotice(
                  "Запрос на удаление зарегистрирован. Аккаунт ещё не удалён.",
                );
              })
            }
          >
            Запросить удаление аккаунта
          </Button>
        </Card>
        <Heading>Обновления планов</Heading>
        {notifications.length ? (
          notifications.map((n) => (
            <Card key={n.id}>
              <Copy>{n.body}</Copy>
              <Copy>{planDate(n.created_at)}</Copy>
            </Card>
          ))
        ) : (
          <Copy>Обновлений пока нет.</Copy>
        )}
        <Heading>Мои предложения</Heading>
        {submissions.map((x) => (
          <Card key={x.id}>
            <Heading>{x.title}</Heading>
            <Copy>
              {
                (
                  {
                    draft: "Черновик",
                    pending_review: "На проверке",
                    published: "Опубликовано",
                    rejected: "Отклонено",
                    suspended: "Приостановлено",
                  } as Record<string, string>
                )[x.publication_status]
              }
            </Copy>
            {x.rejection_reason && <Copy>{x.rejection_reason}</Copy>}
            {["draft", "rejected", "published"].includes(
              x.publication_status,
            ) && (
              <Button
                secondary
                onPress={() => {
                  setSubmissionId(x.id);
                  setSubmissionKind(x.kind ?? "place");
                  setTitle(x.title);
                  setBody(x.summary);
                  setMeeting(x.address ?? "");
                  setCity(x.city);
                  setCategory(x.category);
                  setStarts(
                    x.event_starts
                      ? new Date(
                          new Date(x.event_starts).getTime() + 5 * 3600000,
                        )
                          .toISOString()
                          .slice(0, 16)
                      : "",
                  );
                  go("/submit");
                }}
              >
                Редактировать
              </Button>
            )}
          </Card>
        ))}
      </>
    );
  else if (section === "submit")
    content = !user ? (
      login
    ) : (
      <>
        {back}
        <Text style={s.h1}>Поделиться открытием</Text>
        <Copy>
          Предлагайте публичные места. Перед отправкой убедитесь, что вправе
          публиковать описание. Редактор проверит сведения.
        </Copy>
        <Card>
          <Field label="Название" value={title} onChange={setTitle} />
          <View style={s.chips}>
            {[
              ["place", "Место"],
              ["experience", "Программа"],
              ["event", "Событие"],
            ].map(([kind, label]) => (
              <Button
                key={kind}
                secondary={submissionKind !== kind}
                onPress={() => setSubmissionKind(kind)}
              >
                {label}
              </Button>
            ))}
          </View>
          <Field
            label="Дата события · ГГГГ-ММ-ДДTЧЧ:ММ (UTC+5)"
            value={starts}
            onChange={setStarts}
          />
          <View style={s.chips}>
            {cities.map((c) => (
              <Button
                key={c.slug}
                secondary={city !== c.slug}
                onPress={() => setCity(c.slug)}
              >
                {c.name}
              </Button>
            ))}
          </View>
          <ScrollView horizontal>
            <View style={s.chips}>
              {categories.slice(1).map((c) => (
                <Button
                  key={c}
                  secondary={category !== c}
                  onPress={() => setCategory(c)}
                >
                  {c}
                </Button>
              ))}
            </View>
          </ScrollView>
          <Field label="Описание" value={body} onChange={setBody} multiline />
          <Field
            label="Публичный адрес"
            value={meeting}
            onChange={setMeeting}
          />
          <Button
            disabled={busy || category === "Все"}
            onPress={() =>
              void act(async () => {
                await api.submit(db!, {
                  title,
                  city,
                  category,
                  summary: body,
                  address: meeting,
                  rights: true,
                  id: submissionId || undefined,
                  kind: submissionKind,
                  event_starts:
                    submissionKind === "event" ? localToUtc(starts) : null,
                });
                setTitle("");
                setBody("");
                setMeeting("");
                go("/profile");
              })
            }
          >
            Подтверждаю право публикации — отправить
          </Button>
          <Button
            secondary
            disabled={busy || category === "Все"}
            onPress={() =>
              void act(async () => {
                await api.submit(db!, {
                  id: submissionId || undefined,
                  title,
                  city,
                  category,
                  summary: body,
                  address: meeting,
                  kind: submissionKind,
                  event_starts: starts ? localToUtc(starts) : null,
                  action: "draft",
                });
                go("/profile");
              })
            }
          >
            Сохранить черновик
          </Button>
        </Card>
      </>
    );
  else
    content = (
      <>
        {section === "home" && (
          <>
            <View style={s.hero}>
              <View style={s.heroInner}>
                <Text style={s.heroMark}>⛰</Text>
                <Text style={s.heroTitle}>Qayda</Text>
                <Text style={s.heroTagline}>Открываем Казахстан вместе</Text>
                <TextInput
                  accessibilityLabel="Поиск мест"
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Куда вы хотите поехать?"
                  placeholderTextColor={color.muted}
                  style={s.input}
                />
                <View style={s.quickGrid}>
                  {[
                    ["Наследие", "🏛"],
                    ["Этнотуры", "⛺"],
                    ["Музеи", "🎨"],
                    ["Природа", "🌲"],
                    ["Театры", "🎭"],
                    ["Прогулки", "🚶"],
                  ].map(([name, icon], i) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: category === name }}
                      key={name}
                      onPress={() => {
                        setCategory(name);
                        go("/explore");
                      }}
                      style={s.quickItem}
                    >
                      <View
                        style={[
                          s.quickDisc,
                          {
                            backgroundColor: [
                              color.sand,
                              color.peach,
                              color.rose,
                              color.mint,
                              color.peach,
                              color.mint,
                            ][i],
                          },
                        ]}
                      >
                        <Text style={{ fontSize: 24 }}>{icon}</Text>
                      </View>
                      <Text style={s.quickLabel}>{name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={s.heroLandscape}>
                <Art photoKey="lake" height={180} />
                <Pressable
                  accessibilityRole="link"
                  onPress={() => go("/photos")}
                  style={s.landscapeCaption}
                >
                  <Text style={s.quickLabel}>Большое Алматинское озеро ↗</Text>
                </Pressable>
              </View>
            </View>
            <Heading>Выберите свой город</Heading>
            <View style={s.cityGrid}>
              {cities.map((c) => (
                <Pressable
                  accessibilityRole="button"
                  key={c.slug}
                  accessibilityLabel={`Открыть ${c.name}`}
                  onPress={() => {
                    setCity(c.slug);
                    setCategory("Все");
                    setQuery("");
                    go("/explore");
                  }}
                  style={s.cityCard}
                >
                  <Art photoKey={c.slug} height={140} />
                  <View style={s.cityCaption}>
                    <Text style={s.cityTitle}>{c.name}</Text>
                    <Text style={s.label}>
                      {c.slug === "semey"
                        ? "История · Культура"
                        : "Горы · Искусство"}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </>
        )}
        <Text style={s.h1}>
          {section === "saved"
            ? "Сохранённое"
            : section === "explore"
              ? "Каталог впечатлений"
              : "Ваш следующий выходной"}
        </Text>
        <View style={s.chips}>
          {cities.map((c) => (
            <Button
              key={c.slug}
              secondary={city !== c.slug}
              onPress={() => setCity(c.slug)}
            >
              {c.name}
            </Button>
          ))}
        </View>
        {section !== "home" && (
          <Field
            label="Поиск мест"
            value={query}
            onChange={setQuery}
            placeholder="Место или впечатление"
          />
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={s.chips}>
            {categories.map((c) => (
              <Button
                key={c}
                secondary={category !== c}
                onPress={() => setCategory(c)}
              >
                {c}
              </Button>
            ))}
          </View>
        </ScrollView>
        {loading ? (
          <ActivityIndicator size="large" color={color.forest} />
        ) : (
          visible.map(listCard)
        )}
        {!loading && !visible.length && (
          <Card>
            <Heading>Пока нет подходящих идей</Heading>
            <Copy>Выберите другой город или категорию.</Copy>
            <Button secondary onPress={() => void catalog()}>
              Обновить каталог
            </Button>
          </Card>
        )}
      </>
    );
  return (
    <SafeAreaView style={s.root} edges={["top", "bottom"]}>
      <View style={s.top}>
        <Pressable accessibilityRole="button" onPress={() => go("/")}>
          <Text style={s.logo}>△ Qayda</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => go("/profile")}
          style={s.profile}
        >
          <Text style={s.label}>{user ? "Профиль" : "Войти"} →</Text>
        </Pressable>
      </View>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        {!db && <Text style={s.demo}>ДЕМОПРОСМОТР · Backend не подключён</Text>}
        {error && (
          <View accessibilityRole="alert" style={s.error}>
            <Text style={{ color: color.error }}>{error}</Text>
            <Button secondary onPress={() => setError("")}>
              Закрыть
            </Button>
          </View>
        )}
        {notice && (
          <Text accessibilityLiveRegion="polite" style={s.banner}>
            {notice}
          </Text>
        )}
        {busy && <ActivityIndicator color={color.forest} />}
        {content}
      </ScrollView>
      <View style={s.nav}>
        {[
          ["/", "⌂", "Главная"],
          ["/explore", "▦", "Каталог"],
          ["/plans", "□", "Планы"],
          ["/profile", "○", "Профиль"],
        ].map(([p, icon, t]) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: path === p }}
            key={p}
            onPress={() => go(p)}
            style={s.navItem}
          >
            <Text style={[s.navIcon, path === p && s.active]}>{icon}</Text>
            <Text style={[s.navLabel, path === p && s.active]}>{t}</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}
