export type City = "semey" | "almaty";
export type PlanStatus =
  "draft" | "proposed" | "confirmed" | "cancelled" | "completed";
export type Answer = "going" | "maybe" | "not_going";
export interface Listing {
  kind?: "place" | "event" | "experience";
  event_starts?: string | null;
  out_of_city?: boolean;
  verified_fields?: string[];
  rejection_reason?: string | null;
  id: string;
  title: string;
  city: City;
  category: string;
  summary: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  source_url: string | null;
  checked_at: string | null;
  origin: "demo_fixture" | "editorial" | "real_verified" | "user";
  price_minor: string | null;
  publication_status: string;
  image_url: string | null;
}
export interface Plan {
  id: string;
  group_id: string;
  listing_id: string | null;
  title: string;
  starts_at: string;
  meeting_note: string;
  status: PlanStatus;
  version: number;
  owner_id: string;
  created_at: string;
}
export interface Member {
  group_id: string;
  user_id: string;
  display_name: string;
  status: string;
}
export interface Rsvp {
  plan_id: string;
  user_id: string;
  answer: Answer;
  acknowledged_version: number;
}
export interface Message {
  id: string;
  group_id: string;
  author_id: string;
  body: string;
  created_at: string;
}
export interface BudgetItem {
  id: string;
  plan_id: string;
  title: string;
  amount_minor: string;
  cost_kind: "shared" | "per_person";
}
export interface BudgetSnapshot {
  plan_id: string;
  version: number;
  plan_version: number;
  participant_ids: string[];
  total_minor: string;
  shares: Record<string, string>;
  agreed_ids: string[];
}
export interface Invitation {
  id: string;
  expires_at: string;
  uses_count: number;
  max_uses: number;
  revoked_at: string | null;
}
export const cities = [
  {
    slug: "semey" as const,
    name: "Семей",
    note: "Наследие Абая и культурные маршруты",
  },
  {
    slug: "almaty" as const,
    name: "Алматы",
    note: "Горы, культура и поездки выходного дня",
  },
];
export const categories = [
  "Все",
  "Наследие",
  "Этнотуры",
  "Музеи",
  "Природа",
  "Театры",
  "Прогулки",
];
export const answerLabels: Record<Answer, string> = {
  going: "Иду",
  maybe: "Возможно",
  not_going: "Не смогу",
};
export const statusLabels: Record<PlanStatus, string> = {
  draft: "Черновик",
  proposed: "Обсуждаем",
  confirmed: "Подтверждён",
  cancelled: "Отменён",
  completed: "Завершён",
};
export function money(value: string | bigint): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "KZT",
    maximumFractionDigits: 2,
  }).format(Number(BigInt(value)) / 100);
}
export function parseMoney(value: string): bigint {
  if (!/^\d{1,10}([.,]\d{1,2})?$/.test(value.trim()))
    throw new Error(
      "Введите сумму до 10 цифр и не более двух знаков после запятой",
    );
  const [whole, fraction = ""] = value.trim().replace(",", ".").split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
export function splitBudget(
  items: Pick<BudgetItem, "amount_minor" | "cost_kind">[],
  users: string[],
) {
  const ids = [...new Set(users)].sort();
  if (!ids.length) throw new Error("Добавьте участников расчёта");
  const shares: Record<string, bigint> = Object.fromEntries(
    ids.map((id) => [id, 0n]),
  );
  let total = 0n;
  for (const item of items) {
    const amount = BigInt(item.amount_minor);
    if (amount < 0n) throw new Error("Сумма не может быть отрицательной");
    const sum =
      item.cost_kind === "per_person" ? amount * BigInt(ids.length) : amount;
    total += sum;
    ids.forEach((id, i) => {
      shares[id] +=
        sum / BigInt(ids.length) +
        (BigInt(i) < sum % BigInt(ids.length) ? 1n : 0n);
    });
  }
  return {
    total_minor: total.toString(),
    shares: Object.fromEntries(
      Object.entries(shares).map(([k, v]) => [k, v.toString()]),
    ),
    participant_ids: ids,
  };
}
export function localToUtc(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Введите дату и время: ГГГГ-ММ-ДДTЧЧ:ММ");
  const date = new Date(value + ":00+05:00");
  if (
    !Number.isFinite(date.getTime()) ||
    new Date(date.getTime() + 5 * 3600000).toISOString().slice(0, 16) !== value
  )
    throw new Error("Некорректная дата");
  return date.toISOString();
}
export function planDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Almaty",
  }).format(new Date(value));
}
export function currentRsvp(r: Rsvp, plan: Plan) {
  return r.acknowledged_version === plan.version;
}
export function canTransition(from: PlanStatus, to: PlanStatus) {
  return (
    {
      draft: ["proposed", "cancelled"],
      proposed: ["confirmed", "cancelled"],
      confirmed: ["proposed", "completed", "cancelled"],
      cancelled: [],
      completed: [],
    } as Record<PlanStatus, PlanStatus[]>
  )[from].includes(to);
}
export function safeUrl(value: string | null): string | null {
  try {
    const u = new URL(value ?? "");
    return u.protocol === "https:" && !u.username && !u.password
      ? u.toString()
      : null;
  } catch {
    return null;
  }
}
export function mapUrl(
  l: Pick<Listing, "latitude" | "longitude" | "address" | "title">,
) {
  return l.latitude !== null && l.longitude !== null
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.latitude},${l.longitude}`)}`
    : l.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.address + " " + l.title)}`
      : null;
}
const escapeIcs = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
function fold(line: string) {
  let out = "";
  let bytes = 0;
  for (const char of line) {
    const n = new TextEncoder().encode(char).length;
    if (bytes + n > 75) {
      out += "\r\n ";
      bytes = 1;
    }
    out += char;
    bytes += n;
  }
  return out;
}
export function calendarIcs(
  plan: Pick<
    Plan,
    "id" | "title" | "starts_at" | "meeting_note" | "version" | "status"
  >,
  now = new Date(),
) {
  const stamp = (value: string) =>
    new Date(value)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Qayda//Plans//RU",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${plan.id}@qayda`,
      `DTSTAMP:${stamp(now.toISOString())}`,
      `DTSTART:${stamp(plan.starts_at)}`,
      `SUMMARY:${escapeIcs(plan.title)}`,
      `LOCATION:${escapeIcs(plan.meeting_note)}`,
      // Status transitions also change an export, even when the RSVP version stays the same.
      `SEQUENCE:${plan.version * 10 + ({ draft: 0, proposed: 1, confirmed: 2, cancelled: 3, completed: 4 } as const)[plan.status]}`,
      `STATUS:${plan.status === "cancelled" ? "CANCELLED" : plan.status === "confirmed" || plan.status === "completed" ? "CONFIRMED" : "TENTATIVE"}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .map(fold)
      .join("\r\n") + "\r\n"
  );
}
export function overlaps(a: Plan, b: Plan) {
  return (
    a.id !== b.id &&
    a.starts_at === b.starts_at &&
    a.status === "confirmed" &&
    b.status === "confirmed"
  );
}
export const demoListings: Listing[] = [
  [
    "semey",
    "Наследие",
    "По следам Абая",
    "Идея знакомства с литературным наследием региона. Условия посещения нужно уточнить.",
  ],
  [
    "semey",
    "Музеи",
    "Литературный Семей",
    "Музеи и истории города для неспешного выходного.",
  ],
  [
    "semey",
    "Прогулки",
    "Прогулка у Иртыша",
    "Редакционная идея прогулки с друзьями. Маршрут пока не проверен.",
  ],
  [
    "semey",
    "Театры",
    "Театральный вечер",
    "Выберите площадку и проверьте актуальную афишу у организатора.",
  ],
  [
    "almaty",
    "Этнотуры",
    "Знакомство с этнокультурой",
    "Идея выезда за город. Оператор и программа требуют проверки.",
  ],
  [
    "almaty",
    "Природа",
    "Выходной у гор",
    "Идея поездки в окрестности Алматы без обещания готового тура.",
  ],
  [
    "almaty",
    "Театры",
    "Вечер оперы и балета",
    "Культурный вечер в Алматы. Расписание и билеты уточняются отдельно.",
  ],
  [
    "almaty",
    "Музеи",
    "Алматы через истории",
    "Идея музейного дня для знакомства с городом.",
  ],
].map(([city, category, title, summary], i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  city: city as City,
  category,
  title,
  summary,
  address: null,
  latitude: null,
  longitude: null,
  source_url: null,
  checked_at: null,
  origin: "demo_fixture",
  price_minor: null,
  publication_status: "published",
  image_url: null,
}));

export function searchCatalogue(
  listings: Listing[],
  city: string,
  category: string,
  query: string,
) {
  const normalize = (value: string) =>
    value
      .toLocaleLowerCase("ru")
      .replace(/[‐‑–—-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const q = normalize(query);
  const aliases: Record<string, City> = {
    семей: "semey",
    семипалатинск: "semey",
    semey: "semey",
    алматы: "almaty",
    "алма ата": "almaty",
    almaty: "almaty",
  };
  const target = aliases[q] ?? city;
  const text = aliases[q] ? "" : q;
  return listings.filter(
    (l) =>
      l.city === target &&
      (category === "Все" || l.category === category) &&
      normalize(`${l.title} ${l.summary}`).includes(text),
  );
}

export { photos, listingPhoto, type PhotoKey } from "./media";

/** Shared creation rules, matching the create_plan RPC boundary. */
export function validatePlanCreation(
  input: { title: string; starts_at: string; meeting_note: string },
  now = Date.now(),
) {
  if (input.title.trim().length < 3 || input.title.trim().length > 160)
    throw new Error("Название плана должно содержать от 3 до 160 символов");
  const starts = Date.parse(input.starts_at);
  if (!Number.isFinite(starts))
    throw new Error("Укажите корректные дату и время встречи");
  if (starts <= now)
    throw new Error("Дата встречи уже прошла. Выберите будущие дату и время");
  const latest = new Date(now);
  latest.setUTCFullYear(latest.getUTCFullYear() + 2);
  if (starts > latest.getTime())
    throw new Error("Выберите дату встречи в пределах ближайших двух лет");
  if (
    input.meeting_note.trim().length < 3 ||
    input.meeting_note.trim().length > 500
  )
    throw new Error("Место встречи должно содержать от 3 до 500 символов");
}
export * from "./providers";
export * from "./provider-forms";
