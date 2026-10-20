import {
  useState,
  useEffect,
  useCallback,
  useRef,
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { usePathname, useRouter, type Href } from "expo-router";
import * as ExpoLinking from "expo-linking";
import { api, humanError } from "@qayda/api-client";
import {
  searchCatalogue,
  demoListings,
  type Listing,
  type Plan,
} from "@qayda/domain";
import { db } from "./backend";
function useNativeModel() {
  const path = usePathname();
  const router = useRouter();
  const link = ExpoLinking.useURL();
  const parts = path.split("/").filter(Boolean);
  const section = parts[0] ?? "home";
  const id = parts[1];
  const go = (p: string) => router.push(p as Href);
  const [user, setUser] = useState<string | null>(null);
  const [listings, setListings] = useState<Listing[]>(db ? [] : demoListings);
  const [loading, setLoading] = useState(!!db);
  const [city, setCity] = useState("semey");
  const [category, setCategory] = useState("Все");
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [room, setRoom] = useState<Awaited<ReturnType<typeof api.room>> | null>(
    null,
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [starts, setStarts] = useState("");
  const [meeting, setMeeting] = useState("");
  const [body, setBody] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [amount, setAmount] = useState("");
  const [itemTitle, setItemTitle] = useState("");
  const [kind, setKind] = useState("shared");
  const [editingItem, setEditingItem] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [notifications, setNotifications] = useState<
    { id: string; body: string; created_at: string }[]
  >([]);
  const [tab, setTab] = useState("План");
  const [olderDone, setOlderDone] = useState(false);
  const [token, setToken] = useState("");
  const [preview, setPreview] = useState("");
  const [submissions, setSubmissions] = useState<Listing[]>([]);
  const [submissionId, setSubmissionId] = useState("");
  const [submissionKind, setSubmissionKind] = useState("place");
  const request = useRef("");
  const messageRequest = useRef("");
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
  const previousUser = useRef<string | null>(null);
  const activeScope = useRef("");
  activeScope.current = `${user ?? ""}|${path}`;
  useEffect(() => {
    if (!db) return;
    const accept = (id: string | null) => {
      if (previousUser.current !== id) {
        setRoom(null);
        setPlans([]);
        setSaved([]);
        setSubmissions([]);
        setNotifications([]);
        setSubmissionId("");
        previousUser.current = id;
      }
      setUser(id);
    };
    db.auth
      .getSession()
      .then(({ data }) => accept(data.session?.user.id ?? null));
    const { data } = db.auth.onAuthStateChange((_, v) =>
      accept(v?.user.id ?? null),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  const catalog = useCallback(async () => {
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
    void catalog();
  }, [catalog]);
  const refresh = useCallback(async () => {
    if (!db || !user) return;
    const scope = activeScope.current;
    const [p, v] = await Promise.all([api.plans(db), api.saved(db)]);
    if (scope !== activeScope.current) return;
    setPlans(p);
    setSaved(v);
    if (section === "plans" && id) {
      try {
        const r = await api.room(db, id);
        if (scope === activeScope.current) setRoom(r);
      } catch (e) {
        setRoom(null);
        throw e;
      }
    }
    if (section === "profile") {
      const [sub, n] = await Promise.all([
        api.submissions(db),
        api.notifications(db),
      ]);
      if (scope === activeScope.current) {
        setSubmissions(sub);
        setNotifications(n);
      }
    }
  }, [user, section, id]);
  useEffect(() => {
    setRoom(null);
    setEditingItem("");
    setTab("План");
    setOlderDone(false);
    setError("");
    void act(refresh);
  }, [refresh, act]);
  useEffect(() => {
    if (!link) return;
    const authCode = ExpoLinking.parse(link).queryParams?.code;
    if (typeof authCode === "string" && db) {
      void act(async () => {
        const { error } = await db!.auth.exchangeCodeForSession(authCode);
        if (error) throw error;
        go("/plans");
      });
      return;
    }
    const secret = link.split("#t=")[1];
    if (secret) {
      setToken(decodeURIComponent(secret));
      go("/invite");
    }
  }, [link]);
  useEffect(() => {
    if (db && token)
      void act(async () => {
        const p = await api.preview(db!, token);
        setPreview(p.title);
      });
  }, [token, act]);
  const l = listings.find((x) => x.id === id);
  const owner = room?.plan.owner_id === user;
  const visible = searchCatalogue(listings, city, category, query).filter(
    (x) => section !== "saved" || saved.includes(x.id),
  );
  const auth = () => {
    if (!db) {
      setError(
        "Подключите Supabase для сохранения. Демокаталог доступен только для просмотра.",
      );
      return false;
    }
    if (!user) {
      go("/login");
      return false;
    }
    return true;
  };
  return {
    path,
    router,
    section,
    id,
    go,
    user,
    listings,
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
  };
}
const ModelContext = createContext<ReturnType<typeof useNativeModel> | null>(
  null,
);
export function NativeProvider({ children }: { children: ReactNode }) {
  const model = useNativeModel();
  return (
    <ModelContext.Provider value={model}>{children}</ModelContext.Provider>
  );
}

export function useModel() {
  const model = useContext(ModelContext);
  if (!model) throw new Error("NativeProvider missing");
  return model;
}
