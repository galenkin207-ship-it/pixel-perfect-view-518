import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { Inbox, MessageSquare, Trash2 } from "lucide-react";
import { AppContext, type AppState, type NotificationSettings, type ThemeMode } from "./use-app";
import {
  brigades as mockBrigades,
  type AppUser,
  type Role,
  type WorkObject,
  type WorkRecord,
  type WorkRequest,
  type WorkType,
  type RequestComment,
} from "@/data/mock";
import { api, ApiError } from "@/lib/api-client";
import { playNotificationChime } from "@/lib/notification-sound";
import { isPushSupported, resyncPushSubscription } from "@/lib/push";

const EMPTY_USER: AppUser = { id: "", login: "", password: "", full_name: "", role: "user" };

export function AppProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light");
  const [notifications, setNotifications] = useState<NotificationSettings>({
    telegramEnabled: true,
    telegramUsername: "@konstantin_g",
    telegramNewRecords: true,
    telegramRequests: true,
    telegramDailyDigest: false,
    inAppEnabled: true,
    inAppNewRecords: true,
    inAppRequests: true,
    inAppMessages: true,
    inAppSound: true,
  });

  const [authChecked, setAuthChecked] = useState(false);
  const [sessionUser, setSessionUser] = useState<AppUser | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  const [objects, setObjects] = useState<AppState["objects"]>([]);
  const [records, setRecords] = useState<WorkRecord[]>([]);
  const [requests, setRequests] = useState<AppState["requests"]>([]);
  const [workTypes, setWorkTypes] = useState<AppState["workTypes"]>([]);
  const [employees, setEmployees] = useState<string[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [pinnedObjectIds, setPinnedObjectIds] = useState<string[]>([]);

  // Проверяем сессию один раз при загрузке приложения.
  useEffect(() => {
    api
      .me()
      .then((me) =>
        setSessionUser({
          id: String(me.id),
          login: me.login,
          password: "",
          full_name: me.full_name,
          role: me.role,
        }),
      )
      .catch(() => setSessionUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  const currentUser = sessionUser ?? EMPTY_USER;
  const role = currentUser.role;

  // Переиспользуемая загрузка всех данных приложения — используется и при первом
  // входе, и фоновым автообновлением, и pull-to-refresh на телефоне.
  const loadAppData = useCallback(async () => {
    if (!sessionUser) return;
    const [objs, emps, uns, types, recs, reqs, usrs, pinned] = await Promise.all([
      api.listObjects(),
      api.listEmployees(),
      api.listUnits(),
      api.listWorkTypes(),
      api.listRecords(),
      api.listRequests(),
      sessionUser.role === "admin" ? api.listUsers() : Promise.resolve([]),
      api.listPinnedObjects(),
    ]);
    setObjects(objs);
    setEmployees(emps);
    setUnits(uns);
    setWorkTypes(types);
    setRecords(recs);
    setRequests(reqs);
    if (usrs.length) setUsers(usrs);
    setPinnedObjectIds(pinned);
  }, [sessionUser]);

  // Как только знаем, что пользователь авторизован — подгружаем справочники и записи.
  useEffect(() => {
    if (!authChecked || !sessionUser) return;
    let cancelled = false;
    loadAppData()
      .then(() => {
        if (!cancelled) setDataLoaded(true);
      })
      .catch(() => {
        if (!cancelled) toast.error("Не удалось загрузить данные приложения");
      });
    return () => {
      cancelled = true;
    };
  }, [authChecked, sessionUser, loadAppData]);

  // Фоновое автообновление данных, чтобы изменения, внесённые с других устройств
  // (или другим пользователем), появлялись без перезагрузки страницы. Опрашиваем
  // сервер, пока вкладка активна; на фоне/свёрнутой вкладке — не дёргаем сервер
  // впустую, а сразу подтягиваем свежие данные при возврате.
  const loadAppDataRef = useRef(loadAppData);
  useEffect(() => {
    loadAppDataRef.current = loadAppData;
  }, [loadAppData]);

  useEffect(() => {
    if (!dataLoaded) return;

    const POLL_INTERVAL_MS = 8000;
    let timer: ReturnType<typeof setInterval> | null = null;

    const silentRefresh = () => {
      void loadAppDataRef.current().catch(() => {
        // фоновое обновление не должно мешать пользователю всплывающими ошибками
      });
    };

    const startPolling = () => {
      if (timer) return;
      timer = setInterval(silentRefresh, POLL_INTERVAL_MS);
    };
    const stopPolling = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        silentRefresh();
        startPolling();
      } else {
        stopPolling();
      }
    };
    const onFocus = () => silentRefresh();

    if (document.visibilityState === "visible") startPolling();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [dataLoaded]);

  // Глобальные уведомления (баннер + звук) о новых заявках, сообщениях в
  // переписке и удалённых заявках — работает на любой странице приложения,
  // не только на /messages и /notifications.
  const seenNotificationIdsRef = useRef<Set<string> | null>(null);

  // Если браузер на этом устройстве уже был подписан на push под другим
  // аккаунтом (например, ранее тестировали под admin, а теперь зашли как
  // прораб) — тихо переассоциируем подписку с текущим пользователем, чтобы
  // push не продолжал уходить не туда.
  useEffect(() => {
    if (!dataLoaded || !isPushSupported()) return;
    resyncPushSubscription().catch(() => {});
  }, [dataLoaded, currentUser.id]);
  useEffect(() => {
    if (!dataLoaded) return;
    if (!notifications.inAppEnabled) return;

    const isForeman = role === "user";
    const visibleRequests = isForeman
      ? requests.filter((r) => r.author === currentUser.full_name)
      : requests;

    type NotifyItem = {
      id: string;
      requestId: string;
      kind: "request" | "comment" | "deleted";
      author: string;
      title: string;
      text: string;
    };
    const items: NotifyItem[] = [];
    for (const r of visibleRequests) {
      if (notifications.inAppRequests) {
        items.push({
          id: `${r.id}-new`,
          requestId: r.id,
          kind: "request",
          author: r.author,
          title: "Новая заявка на вид работ",
          text: r.requested_text,
        });
        if (r.status === "deleted") {
          items.push({
            id: `${r.id}-deleted`,
            requestId: r.id,
            kind: "deleted",
            author: r.author,
            title: "Заявка удалена автором",
            text: r.requested_text,
          });
        }
      }
      if (notifications.inAppMessages) {
        for (const c of r.comments) {
          items.push({
            id: c.id,
            requestId: r.id,
            kind: "comment",
            author: c.author,
            title: `Сообщение по заявке: ${r.requested_text}`,
            text: c.text,
          });
        }
      }
    }

    if (!seenNotificationIdsRef.current) {
      // Первая загрузка после входа — просто запоминаем уже существующее,
      // не показываем баннеры пачкой по всей истории.
      seenNotificationIdsRef.current = new Set(items.map((i) => i.id));
      return;
    }

    const seen = seenNotificationIdsRef.current;
    const kindIcon = { request: Inbox, comment: MessageSquare, deleted: Trash2 } as const;
    const kindLabel = {
      request: "Новая заявка",
      comment: "Новое сообщение",
      deleted: "Заявка удалена",
    } as const;

    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      if (item.author === currentUser.full_name) continue; // свои действия не уведомляем

      const Icon = kindIcon[item.kind];
      toast(
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{item.author}</p>
            <p className="text-xs text-muted-foreground">{kindLabel[item.kind]}</p>
            <p className="mt-0.5 line-clamp-2 text-sm break-words">{item.text}</p>
          </div>
        </div>,
        {
          duration: 6000,
          action: {
            label: "Открыть",
            onClick: () => void navigate({ to: "/messages", search: { request: item.requestId } }),
          },
        },
      );
      if (notifications.inAppSound) playNotificationChime();
    }
  }, [
    requests,
    dataLoaded,
    notifications.inAppEnabled,
    notifications.inAppRequests,
    notifications.inAppMessages,
    notifications.inAppSound,
    role,
    currentUser.full_name,
    navigate,
  ]);

  // Редирект неавторизованных на /login (кроме самой страницы логина).
  useEffect(() => {
    if (!authChecked) return;
    if (!sessionUser && pathname !== "/login") {
      void navigate({ to: "/login" });
    }
    if (sessionUser && pathname === "/login") {
      void navigate({ to: "/" });
    }
  }, [authChecked, sessionUser, pathname, navigate]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setSystemTheme(mq.matches ? "dark" : "light");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const theme = themeMode === "system" ? systemTheme : themeMode;

  const objectNameById = useMemo(() => new Map(objects.map((o) => [o.id, o.name])), [objects]);

  // Считаем так же, как страница "Уведомления": новые заявки и комментарии от
  // других участников (прораб видит только свои заявки, admin/curator — все).
  const notificationsCount = useMemo(() => {
    const isForeman = role === "user";
    const visible = isForeman
      ? requests.filter((r) => r.author === currentUser.full_name)
      : requests;
    let count = 0;
    for (const r of visible) {
      if (r.author !== currentUser.full_name) count += 1;
      for (const c of r.comments) {
        if (c.author !== currentUser.full_name) count += 1;
      }
    }
    return count;
  }, [requests, role, currentUser.full_name]);

  const login = async (loginValue: string, password: string) => {
    const me = await api.login(loginValue, password);
    setSessionUser({
      id: String(me.id),
      login: me.login,
      password: "",
      full_name: me.full_name,
      role: me.role,
    });
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch (err) {
      // Даже если запрос к серверу не удался (сеть, таймаут и т.п.), всё равно
      // выходим локально — иначе кнопка "Выйти" выглядит как нерабочая.
      console.error("logout request failed", err);
    } finally {
      setSessionUser(null);
      setDataLoaded(false);
      seenNotificationIdsRef.current = null;
    }
  };

  const addRecord = async (r: WorkRecord): Promise<WorkRecord> => {
    const objectName = objectNameById.get(r.object_id) ?? r.object_id;
    try {
      const saved = await api.createRecord(r, objectName);
      setRecords((prev) => [saved, ...prev]);
      return saved;
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to create record");
    }
  };

  const updateRecord = async (r: WorkRecord): Promise<WorkRecord> => {
    const objectName = objectNameById.get(r.object_id) ?? r.object_id;
    try {
      const saved = await api.updateRecord(r, objectName);
      setRecords((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
      return saved;
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to update record");
    }
  };

  const deleteRecord = async (id: string): Promise<void> => {
    try {
      await api.deleteRecord(id);
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to delete record");
    }
  };

  const createRequest = async (text: string): Promise<WorkRequest> => {
    try {
      const created = await api.createRequest(text);
      setRequests((prev) => [created, ...prev]);
      return created;
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to create request");
    }
  };

  const decideRequest = async (
    id: string,
    input: {
      status: "approved" | "rejected";
      resolved_name?: string;
      resolved_unit?: string;
      resolved_price?: number;
      reject_reason?: string;
    },
  ): Promise<WorkRequest> => {
    try {
      const saved = await api.decideRequest(id, input);
      setRequests((prev) =>
        prev.map((r) => (r.id === saved.id ? { ...saved, comments: r.comments } : r)),
      );
      // Одобренная заявка бэкенд сам добавляет в справочник видов работ —
      // перечитываем список, чтобы он сразу появился в приложении.
      if (input.status === "approved") {
        try {
          setWorkTypes(await api.listWorkTypes());
        } catch {
          // не критично — подтянется следующим фоновым обновлением
        }
      }
      return saved;
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to decide request");
    }
  };

  const addRequestComment = async (requestId: string, text: string): Promise<RequestComment> => {
    try {
      const comment = await api.addRequestComment(requestId, text);
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, comments: [...r.comments, comment] } : r)),
      );
      return comment;
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to add comment");
    }
  };

  const deleteRequest = async (id: string): Promise<void> => {
    try {
      const result = await api.deleteRequest(id);
      if ("hardDeleted" in result) {
        // Admin удалил чужую заявку из истории — убираем её из списка совсем
        setRequests((prev) => prev.filter((r) => r.id !== result.id));
      } else {
        // Автор удалил свою заявку — оставляем карточку с пометкой "удалена"
        setRequests((prev) =>
          prev.map((r) => (r.id === result.id ? { ...result, comments: r.comments } : r)),
        );
      }
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to delete request");
    }
  };

  const addUser = async (input: {
    login: string;
    password: string;
    full_name: string;
    role: Role;
  }): Promise<AppUser> => {
    try {
      const created = await api.createUser(input);
      setUsers((prev) => [...prev, created]);
      return created;
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to create user");
    }
  };

  const updateUser = async (
    id: string,
    input: { full_name?: string; role?: Role; active?: boolean; password?: string },
  ): Promise<AppUser> => {
    try {
      const saved = await api.updateUser(id, input);
      setUsers((prev) => prev.map((u) => (u.id === saved.id ? { ...u, ...saved } : u)));
      return saved;
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to update user");
    }
  };

  const addObject = async (input: {
    name: string;
    address: string;
    progress_percent: number;
  }): Promise<WorkObject> => {
    try {
      const created = await api.createObject(input);
      setObjects((prev) => [...prev, created]);
      return created;
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to create object");
    }
  };

  const updateObject = async (
    id: string,
    input: { name: string; address: string; progress_percent: number },
  ): Promise<WorkObject> => {
    try {
      const saved = await api.updateObject(id, input);
      setObjects((prev) => prev.map((o) => (o.id === saved.id ? { ...o, ...saved } : o)));
      return saved;
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to update object");
    }
  };

  const deleteObject = async (id: string): Promise<void> => {
    try {
      await api.deleteObject(id);
      setObjects((prev) => prev.filter((o) => o.id !== id));
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to delete object");
    }
  };

  const pinObject = async (id: string): Promise<void> => {
    setPinnedObjectIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    try {
      await api.pinObject(id);
    } catch (err) {
      setPinnedObjectIds((prev) => prev.filter((x) => x !== id)); // откатываем оптимистичное обновление
      throw err instanceof ApiError ? err : new Error("failed to pin object");
    }
  };

  const unpinObject = async (id: string): Promise<void> => {
    const had = pinnedObjectIds.includes(id);
    setPinnedObjectIds((prev) => prev.filter((x) => x !== id));
    try {
      await api.unpinObject(id);
    } catch (err) {
      if (had) setPinnedObjectIds((prev) => (prev.includes(id) ? prev : [...prev, id])); // откат
      throw err instanceof ApiError ? err : new Error("failed to unpin object");
    }
  };

  const addWorkType = async (input: {
    name: string;
    unit: string;
    price: number;
  }): Promise<WorkType> => {
    try {
      const created = await api.createWorkType(input);
      setWorkTypes((prev) => [...prev, created]);
      return created;
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to create work type");
    }
  };

  const updateWorkType = async (
    id: string,
    input: { name: string; unit: string; price: number },
  ): Promise<WorkType> => {
    try {
      const saved = await api.updateWorkType(id, input);
      setWorkTypes((prev) => prev.map((w) => (w.id === saved.id ? { ...w, ...saved } : w)));
      return saved;
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to update work type");
    }
  };

  const deleteWorkType = async (id: string): Promise<void> => {
    try {
      await api.deleteWorkType(id);
      setWorkTypes((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to delete work type");
    }
  };

  // Сотрудники/единицы измерения везде в приложении используются как простые
  // списки имён (WorkRecord.employees и т.п. ссылаются на сотрудника по имени,
  // не по id), поэтому глобальный список остаётся string[] — после любой
  // мутации просто перечитываем его с backend, чтобы не рассинхронизироваться.
  const addEmployee = async (name: string): Promise<void> => {
    try {
      await api.createEmployee(name);
      setEmployees(await api.listEmployees());
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to create employee");
    }
  };

  const renameEmployee = async (id: string, name: string): Promise<void> => {
    try {
      await api.renameEmployee(id, name);
      setEmployees(await api.listEmployees());
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to rename employee");
    }
  };

  const deleteEmployee = async (id: string): Promise<void> => {
    try {
      await api.deleteEmployee(id);
      setEmployees(await api.listEmployees());
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to delete employee");
    }
  };

  const addUnit = async (name: string): Promise<void> => {
    try {
      await api.createUnit(name);
      setUnits(await api.listUnits());
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to create unit");
    }
  };

  const renameUnit = async (id: string, name: string): Promise<void> => {
    try {
      await api.renameUnit(id, name);
      setUnits(await api.listUnits());
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to rename unit");
    }
  };

  const deleteUnit = async (id: string): Promise<void> => {
    try {
      await api.deleteUnit(id);
      setUnits(await api.listUnits());
    } catch (err) {
      throw err instanceof ApiError ? err : new Error("failed to delete unit");
    }
  };

  const value: AppState = {
    role,
    currentUser,
    theme,
    themeMode,
    setThemeMode,
    toggleTheme: () => setThemeMode(theme === "light" ? "dark" : "light"),
    notifications,
    setNotifications,
    objects,
    setObjects,
    addObject,
    updateObject,
    deleteObject,
    pinnedObjectIds,
    pinObject,
    unpinObject,
    records,
    addRecord,
    updateRecord,
    deleteRecord,
    requests,
    setRequests,
    createRequest,
    decideRequest,
    deleteRequest,
    addRequestComment,
    workTypes,
    setWorkTypes,
    addWorkType,
    updateWorkType,
    deleteWorkType,
    employees,
    setEmployees,
    addEmployee,
    renameEmployee,
    deleteEmployee,
    units,
    setUnits,
    addUnit,
    renameUnit,
    deleteUnit,
    users,
    setUsers,
    addUser,
    updateUser,
    brigades: mockBrigades,
    notificationsCount,
    login,
    logout,
    isAuthenticated: !!sessionUser,
    refreshData: loadAppData,
  };

  // Пока не выяснили статус сессии — показываем пустой экран вместо мигания
  // защищённым контентом или преждевременного редиректа.
  if (!authChecked || (sessionUser && !dataLoaded)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-shell">
        <span className="text-sm text-white/50">Загрузка...</span>
      </div>
    );
  }

  return (
    <AppContext.Provider value={value}>
      <div className={theme === "dark" ? "dark" : undefined}>{children}</div>
    </AppContext.Provider>
  );
}
