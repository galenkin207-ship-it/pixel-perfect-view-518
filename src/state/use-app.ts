import { createContext, useContext } from "react";
import type { AppUser, Role, WorkObject, WorkRecord, WorkRequest, WorkType } from "@/data/mock";

export type AppState = {
  role: Role;
  currentUser: AppUser;
  theme: "light" | "dark";
  themeMode: ThemeMode;
  setThemeMode: (m: ThemeMode) => void;
  toggleTheme: () => void;
  notifications: NotificationSettings;
  setNotifications: React.Dispatch<React.SetStateAction<NotificationSettings>>;
  objects: WorkObject[];
  setObjects: React.Dispatch<React.SetStateAction<WorkObject[]>>;
  records: WorkRecord[];
  addRecord: (r: WorkRecord) => Promise<WorkRecord>;
  updateRecord: (r: WorkRecord) => Promise<WorkRecord>;
  deleteRecord: (id: string) => Promise<void>;
  requests: WorkRequest[];
  setRequests: React.Dispatch<React.SetStateAction<WorkRequest[]>>;
  workTypes: WorkType[];
  setWorkTypes: React.Dispatch<React.SetStateAction<WorkType[]>>;
  employees: string[];
  setEmployees: React.Dispatch<React.SetStateAction<string[]>>;
  units: string[];
  setUnits: React.Dispatch<React.SetStateAction<string[]>>;
  users: AppUser[];
  setUsers: React.Dispatch<React.SetStateAction<AppUser[]>>;
  addUser: (input: { login: string; password: string; full_name: string; role: Role }) => Promise<AppUser>;
  updateUser: (
    id: string,
    input: { full_name?: string; role?: Role; active?: boolean; password?: string },
  ) => Promise<AppUser>;
  brigades: { name: string; members: string[] }[];
  notificationsCount: number;
  login: (login: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
};

export type ThemeMode = "light" | "dark" | "system";

export type NotificationSettings = {
  telegramEnabled: boolean;
  telegramUsername: string;
  telegramNewRecords: boolean;
  telegramRequests: boolean;
  telegramDailyDigest: boolean;
  inAppEnabled: boolean;
  inAppNewRecords: boolean;
  inAppRequests: boolean;
  inAppMessages: boolean;
  inAppSound: boolean;
};

export const AppContext = createContext<AppState | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
