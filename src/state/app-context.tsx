import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  AppContext,
  type AppState,
  type NotificationSettings,
  type ThemeMode,
} from "./use-app";
import { brigades as mockBrigades, type AppUser, type Role, type WorkRecord } from "@/data/mock";
import { api, ApiError } from "@/lib/api-client";

const EMPTY_USER: AppUser = { id: "", login: "", password: "", full_name: "", role: "user" };

export function AppProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const [roleOverride, setRoleOverride] = useState<Role | null>(null); // локальный переключатель роли для предпросмотра UI (реальные права проверяет backend)
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
    inAppSound: false,
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

  // Проверяем сессию один раз при загрузке приложения.
  useEffect(() => {
    api
      .me()
      .then((me) =>
        setSessionUser({ id: String(me.id), login: me.login, password: "", full_name: me.full_name, role: me.role }),
      )
      .catch(() => setSessionUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  // Как только знаем, что пользователь авторизован — подгружаем справочники и записи.
  useEffect(() => {
    if (!authChecked || !sessionUser) return;
    let cancelled = false;
    Promise.all([
      api.listObjects(),
      api.listEmployees(),
      api.listUnits(),
      api.listWorkTypes(),
      api.listRecords(),
      api.listRequests(),
      sessionUser.role === "admin" ? api.listUsers() : Promise.resolve([]),
    ])
      .then(([objs, emps, uns, types, recs, reqs, usrs]) => {
        if (cancelled) return;
        setObjects(objs);
        setEmployees(emps);
        setUnits(uns);
        setWorkTypes(types);
        setRecords(recs);
        setRequests(reqs);
        if (usrs.length) setUsers(usrs);
        setDataLoaded(true);
      })
      .catch(() => {
        if (!cancelled) toast.error("Не удалось загрузить данные приложения");
      });
    return () => {
      cancelled = true;
    };
  }, [authChecked, sessionUser]);

  // Редирект неавторизованных на /login (кроме самой страницы логина).
  useEffect(() => {
    if (!authChecked) return;
    if (!sessionUser && pathname !== "/login") {
      void navigate({ to: "/login" });
    }
    if (sessionUser && pathname === "/login") {
      void navigate({ to: sessionUser.role === "user" ? "/" : "/reports" });
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
  const currentUser = sessionUser ?? EMPTY_USER;
  const role = roleOverride ?? currentUser.role;

  const objectNameById = useMemo(() => new Map(objects.map((o) => [o.id, o.name])), [objects]);

  const login = async (loginValue: string, password: string) => {
    const me = await api.login(loginValue, password);
    setSessionUser({ id: String(me.id), login: me.login, password: "", full_name: me.full_name, role: me.role });
  };

  const logout = async () => {
    await api.logout();
    setSessionUser(null);
    setDataLoaded(false);
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

  const value: AppState = {
    role,
    setRole: setRoleOverride,
    currentUser,
    theme,
    themeMode,
    setThemeMode,
    toggleTheme: () => setThemeMode(theme === "light" ? "dark" : "light"),
    notifications,
    setNotifications,
    objects,
    setObjects,
    records,
    addRecord,
    updateRecord,
    deleteRecord,
    requests,
    setRequests,
    workTypes,
    setWorkTypes,
    employees,
    setEmployees,
    units,
    setUnits,
    users,
    setUsers,
    brigades: mockBrigades,
    notificationsCount: 0,
    login,
    logout,
    isAuthenticated: !!sessionUser,
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
