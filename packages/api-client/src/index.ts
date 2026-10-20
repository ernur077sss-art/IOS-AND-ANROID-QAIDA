import { validatePlanCreation } from "@qayda/domain";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  Listing,
  Plan,
  Member,
  Rsvp,
  Message,
  BudgetItem,
  BudgetSnapshot,
  Invitation,
  Answer,
} from "@qayda/domain";
export type StorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};
export function client(url: string, key: string, storage?: StorageAdapter) {
  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: "pkce",
      ...(storage ? { storage } : {}),
    },
  });
}
export type Client = SupabaseClient;
export function humanError(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    const code = String(error.code);
    if (["23514", "23502", "22P02", "22007", "22008"].includes(code))
      return "Проверьте заполненные поля и допустимые значения";
    if (code === "42501") return "Нет доступа к этому действию";
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String(error.message)
        : "Не удалось выполнить запрос. Проверьте соединение и повторите.";
  const codes: Record<string, string> = {
    NOT_AUTHENTICATED: "Войдите в аккаунт",
    FORBIDDEN: "Нет доступа к этому действию",
    VERSION_CONFLICT: "План изменился. Обновите страницу",
    INVALID_INVITATION: "Приглашение истекло, отозвано или исчерпано",
    INVALID_TRANSITION: "Сейчас это действие недоступно",
    RATE_LIMIT: "Слишком много запросов. Повторите позже",
    NO_PARTICIPANTS: "Сначала подтвердите участие в плане",
    NOT_FOUND: "План недоступен",
    INVALID_INPUT: "Проверьте заполненные поля",
    BUDGET_STALE: "Состав или план изменился. Пересчитайте бюджет",
    OWNER_MUST_TRANSFER: "Сначала передайте владение компанией",
  };
  return (
    Object.entries(codes).find(([code]) => message.includes(code))?.[1] ??
    message
  );
}
async function rpc<T>(
  c: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await c.rpc(name, args);
  if (error) throw error;
  return data as T;
}
export const api = {
  saveCatalog: (c: Client, values: Record<string, unknown>) =>
    rpc<string>(c, "save_catalog", { p_values: values }),
  messages: (c: Client, id: string, before?: Message) =>
    rpc<{ items: Message[]; has_more: boolean }>(c, "message_page", {
      p_plan: id,
      p_before: before?.created_at ?? null,
      p_before_id: before?.id ?? null,
    }),
  async listings(c: Client) {
    const { data, error } = await c
      .from("listings")
      .select(
        "id,title,city,category,summary,address,latitude,longitude,source_url,checked_at,origin,price_minor,image_url,publication_status,kind,event_starts,out_of_city,verified_fields",
      )
      .eq("publication_status", "published")
      .order("title")
      .limit(200);
    if (error) throw error;
    return data as Listing[];
  },
  async saved(c: Client) {
    const { data, error } = await c.from("saved_listings").select("listing_id");
    if (error) throw error;
    return (data ?? []).map((x) => String(x.listing_id));
  },
  save: (c: Client, id: string, value: boolean) =>
    rpc(c, "toggle_saved", { p_listing: id, p_save: value }),
  plans: (c: Client) => rpc<Plan[]>(c, "my_plans"),
  room: (c: Client, id: string) =>
    rpc<{
      plan: Plan;
      members: Member[];
      rsvps: Rsvp[];
      messages: Message[];
      items: BudgetItem[];
      budget: BudgetSnapshot | null;
      invitations: Invitation[];
    }>(c, "get_room", { p_plan: id }),
  createPlan: (
    c: Client,
    input: {
      listing_id: string;
      title: string;
      starts_at: string;
      meeting_note: string;
      request_id: string;
      group_id?: string;
    },
  ) => {
    validatePlanCreation(input);
    return rpc<string>(c, "create_plan", {
      p_listing: input.listing_id,
      p_title: input.title.trim(),
      p_starts: input.starts_at,
      p_meeting: input.meeting_note.trim(),
      p_request: input.request_id,
      p_group: input.group_id ?? null,
    });
  },
  action: (
    c: Client,
    id: string,
    version: number,
    action: string,
    values: Record<string, unknown> = {},
  ) =>
    rpc(c, "plan_action", {
      p_plan: id,
      p_version: version,
      p_action: action,
      p_values: values,
    }),
  rsvp: (c: Client, id: string, version: number, answer: Answer) =>
    rpc(c, "set_rsvp", { p_plan: id, p_version: version, p_answer: answer }),
  invite: (c: Client, id: string, title: string, maxUses = 20, hours = 168) =>
    rpc<{ token: string; id: string }>(c, "create_invitation", {
      p_plan: id,
      p_title: title,
      p_max_uses: maxUses,
      p_hours: hours,
    }),
  preview: (c: Client, token: string) =>
    rpc<{ title: string; expires_at: string }>(c, "preview_invitation", {
      p_token: token,
    }),
  redeem: (c: Client, token: string) =>
    rpc<string>(c, "redeem_invitation", { p_token: token }),
  revoke: (c: Client, id: string) =>
    rpc(c, "revoke_invitation", { p_invitation: id }),
  message: (c: Client, id: string, body: string, request: string) =>
    rpc(c, "send_message", { p_plan: id, p_body: body, p_request: request }),
  budget: (
    c: Client,
    id: string,
    version: number,
    title: string,
    amount: string,
    kind: string,
  ) =>
    rpc(c, "add_budget_item", {
      p_plan: id,
      p_version: version,
      p_title: title,
      p_amount: amount,
      p_kind: kind,
    }),
  deleteMessage: (c: Client, id: string, message: string) =>
    rpc(c, "delete_message", { p_plan: id, p_message: message }),
  editBudget: (
    c: Client,
    id: string,
    version: number,
    item: string,
    title: string,
    amount: string,
    kind: string,
  ) =>
    rpc(c, "edit_budget_item", {
      p_plan: id,
      p_version: version,
      p_item: item,
      p_title: title,
      p_amount: amount,
      p_kind: kind,
    }),
  recalculate: (c: Client, id: string, version: number) =>
    rpc(c, "recalculate_budget", { p_plan: id, p_version: version }),
  agreeBudget: (c: Client, id: string, version: number) =>
    rpc(c, "agree_budget", { p_plan: id, p_budget_version: version }),
  removeBudget: (c: Client, id: string, version: number, item: string) =>
    rpc(c, "remove_budget_item", {
      p_plan: id,
      p_version: version,
      p_item: item,
    }),
  removeMember: (c: Client, id: string, user: string) =>
    rpc(c, "remove_member", { p_plan: id, p_user: user }),
  transfer: (c: Client, id: string, user: string) =>
    rpc(c, "transfer_ownership", { p_plan: id, p_user: user }),
  leave: (c: Client, id: string) => rpc(c, "leave_group", { p_plan: id }),
  profile: (c: Client, name: string) =>
    rpc(c, "update_profile", { p_name: name }),
  submit: (c: Client, values: Record<string, unknown>) =>
    rpc<string>(c, "submit_listing", { p_values: values }),
  submissions: (c: Client) => rpc<Listing[]>(c, "my_submissions"),
  queue: (c: Client) => rpc<Listing[]>(c, "review_queue"),
  review: (c: Client, id: string, publish: boolean, reason: string) =>
    rpc(c, "review_listing", {
      p_listing: id,
      p_publish: publish,
      p_reason: reason,
    }),
  report: (c: Client, id: string, reason: string) =>
    rpc(c, "report_listing", { p_listing: id, p_reason: reason }),
  notifications: (c: Client) =>
    rpc<{ id: string; body: string; created_at: string }[]>(
      c,
      "my_notifications",
    ),
  deletion: (c: Client) => rpc(c, "request_deletion"),
};
