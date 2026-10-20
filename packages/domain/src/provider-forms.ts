import { normalizePhone } from "./providers";
export interface PartnerField {
  key: string;
  label: string;
  type?: "text" | "tel" | "url" | "number" | "multiline";
  options?: Record<string, string>;
  optional?: boolean;
  initial?: string;
}
export const providerFields: PartnerField[] = [
  { key: "name", label: "Имя или название" },
  {
    key: "kind",
    label: "Кто вы",
    options: {
      guide: "Гид",
      driver: "Водитель",
      company: "Турфирма",
      host: "Местный организатор",
    },
  },
  {
    key: "city",
    label: "Основное направление",
    options: { semey: "Семей и область Абай", almaty: "Алматы" },
  },
  { key: "description", label: "О ваших услугах", type: "multiline" },
  { key: "languages", label: "Языки", initial: "Русский" },
  {
    key: "phone",
    label: "Телефон для публикации",
    type: "tel",
    optional: true,
  },
  {
    key: "contact_url",
    label: "Сайт или ссылка для связи (https)",
    type: "url",
    optional: true,
  },
  { key: "vehicle", label: "Автомобиль (для водителя)", optional: true },
  {
    key: "seats",
    label: "Пассажирских мест (для водителя)",
    type: "number",
    optional: true,
  },
];
export const offerFields: PartnerField[] = [
  { key: "title", label: "Название услуги" },
  {
    key: "kind",
    label: "Формат услуги",
    options: {
      excursion: "Экскурсия",
      transport: "Транспорт с водителем",
      tour: "Готовый тур",
      workshop: "Мастер-класс",
    },
  },
  { key: "program", label: "Программа и маршрут", type: "multiline" },
  { key: "departure", label: "Откуда выезжаем или где встречаемся" },
  {
    key: "duration_minutes",
    label: "Продолжительность в минутах",
    type: "number",
    initial: "180",
  },
  { key: "min_guests", label: "Минимум гостей", type: "number", initial: "1" },
  { key: "max_guests", label: "Максимум гостей", type: "number", initial: "4" },
  {
    key: "price",
    label: "Стоимость в тенге (пусто — по запросу)",
    optional: true,
  },
  {
    key: "price_basis",
    label: "За что указана цена",
    options: { person: "За человека", group: "За всю компанию" },
  },
  { key: "included", label: "Что включено", type: "multiline" },
  { key: "excluded", label: "Что оплачивается отдельно", type: "multiline" },
  { key: "cancellation", label: "Условия отмены", type: "multiline" },
];
export function partnerDefaults(
  fields: PartnerField[],
): Record<string, string> {
  return Object.fromEntries(
    fields.map((f) => [
      f.key,
      f.initial ?? (f.options ? Object.keys(f.options)[0] : ""),
    ]),
  );
}
export function providerPayload(
  values: Record<string, string>,
): Record<string, unknown> {
  const phone = values.phone?.trim() ? normalizePhone(values.phone) : null;
  const contact = values.contact_url?.trim() || null;
  if (!phone && !contact)
    throw new Error("Укажите телефон или https-ссылку для связи");
  if (contact) {
    let url: URL;
    try {
      url = new URL(contact);
    } catch {
      throw new Error("Укажите корректную https-ссылку");
    }
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error("Нужна https-ссылка без логина и пароля");
  }
  if (
    values.kind === "driver" &&
    (!values.vehicle?.trim() ||
      !Number.isInteger(Number(values.seats)) ||
      Number(values.seats) < 1 ||
      Number(values.seats) > 50)
  )
    throw new Error(
      "Водителю нужно указать автомобиль и от 1 до 50 пассажирских мест",
    );
  return { ...values, phone, contact_url: contact };
}
