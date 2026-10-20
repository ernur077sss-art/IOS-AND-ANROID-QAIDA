export type ProviderKind = "guide" | "driver" | "company" | "host";
export type ReviewStatus = "draft" | "pending" | "published" | "rejected";
export interface Provider {
  id: string;
  owner_id?: string;
  listing_ids?: string[];
  kind: ProviderKind;
  city: string;
  name: string;
  description: string;
  languages: string;
  phone: string | null;
  contact_url: string | null;
  source_url: string | null;
  checked_at: string | null;
  vehicle: string | null;
  seats: number | null;
  status: ReviewStatus;
  verified: boolean;
  managed: boolean;
  rejection_reason?: string | null;
  version: number;
}
export interface ServiceOffer {
  id: string;
  provider_id: string;
  listing_id: string;
  kind: "excursion" | "transport" | "tour" | "workshop";
  title: string;
  program: string;
  included: string;
  excluded: string;
  departure: string;
  duration_minutes: number;
  min_guests: number;
  max_guests: number;
  price_minor: string | number | null;
  price_basis: "person" | "group";
  cancellation: string;
  status: ReviewStatus;
  rejection_reason?: string | null;
  version: number;
}
export interface TripRequest {
  id: string;
  customer_id: string;
  provider_id: string;
  provider_name: string;
  offer_id: string;
  plan_id: string | null;
  guests: number;
  starts_at: string;
  contact_name: string;
  contact_phone: string;
  note: string;
  offer_snapshot: ServiceOffer & {
    provider_name: string;
    vehicle?: string;
    seats?: number;
  };
  status:
    "sent" | "proposed" | "confirmed" | "declined" | "cancelled" | "completed";
  proposed_starts: string | null;
  proposed_total_minor: string | number | null;
  response: string;
  version: number;
  is_provider: boolean;
  created_at: string;
  events: { action: string; version: number; created_at: string }[];
}
export const providerKinds: Record<ProviderKind, string> = {
  guide: "Гид",
  driver: "Водитель",
  company: "Турфирма",
  host: "Местный организатор",
};
export const offerKinds = {
  excursion: "Экскурсия",
  transport: "Транспорт с водителем",
  tour: "Готовый тур",
  workshop: "Мастер-класс",
};
export const requestStatuses = {
  sent: "Заявка отправлена",
  proposed: "Условия от исполнителя",
  confirmed: "Условия приняты",
  declined: "Исполнитель отказал",
  cancelled: "Заявка отменена",
  completed: "Поездка завершена",
};
export const reviewStatuses = {
  draft: "Черновик",
  pending: "На проверке",
  published: "Опубликовано",
  rejected: "Нужно исправить",
};
export function normalizePhone(value: string): string {
  let n = value.replace(/[\s()-]/g, "");
  if (/^8\d{10}$/.test(n)) n = "+7" + n.slice(1);
  if (/^\d{10}$/.test(n)) n = "+7" + n;
  if (/^7\d{10}$/.test(n)) n = "+" + n;
  if (!/^\+\d{10,15}$/.test(n))
    throw new Error(
      "Введите телефон с кодом страны, например +7 700 123 45 67",
    );
  return n;
}
