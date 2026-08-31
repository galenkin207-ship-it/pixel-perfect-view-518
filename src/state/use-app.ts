import { createContext, useContext } from "react";
import type {
  AppUser,
  Brigade,
  Role,
  WorkObject,
  WorkRecord,
  WorkRequest,
  WorkType,
  RequestComment,
} from "@/data/mock";
import type { NotificationItem } from "@/lib/notification-items";

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
  addObject: (input: {
    name: string;
    address: string;
    progress_percent: number;
  }) => Promise<WorkObject>;
  updateObject: (
    id: string,
    input: { name: string; address: string; progress_percent: number },
  ) => Promise<WorkObject>;
  deleteObject: (id: string) => Promise<void>;
  archiveObject: (id: string) => Promise<WorkObject>;
  restoreObject: (id: string) => Promise<WorkObject>;
  pinnedObjectIds: string[];
  pinObject: (id: string) => Promise<void>;
  unpinObject: (id: string) => Promise<void>;
  hiddenObjectIds: string[];
  hideObject: (id: string) => Promise<void>;
  unhideObject: (id: string) => Promise<void>;
  showObjectOnHome: (id: string) => Promise<void>;
  hideObjectFromHome: (id: string) => Promise<void>;
  records: WorkRecord[];
  addRecord: (r: WorkRecord) => Promise<WorkRecord>;
  updateRecord: (r: WorkRecord) => Promise<WorkRecord>;
  deleteRecord: (id: string) => Promise<void>;
  /**
   * Обновляет photos записи прямо в общем кэше (без похода на сервер).
   * Нужна, потому что фото загружаются отдельным запросом ПОСЛЕ создания/
   * обновления записи — без этого addRecord/updateRecord уже успели положить
   * в стейт версию записи с пустыми photos, и она значилась бы без фото до
   * следующей полной синхронизации.
   */
  setRecordPhotos: (id: string, photos: string[]) => void;
  requests: WorkRequest[];
  setRequests: React.Dispatch<React.SetStateAction<WorkRequest[]>>;
  createRequest: (text: string) => Promise<WorkRequest>;
  decideRequest: (
    id: string,
    input: {
      status: "approved" | "rejected";
      resolved_name?: string;
      resolved_unit?: string;
      resolved_price?: number;
      reject_reason?: string;
    },
  ) => Promise<WorkRequest>;
  deleteRequest: (id: string) => Promise<void>;
  addRequestComment: (requestId: string, text: string) => Promise<RequestComment>;
  editRequestComment: (requestId: string, commentId: string, text: string) => Promise<RequestComment>;
  deleteRequestComment: (requestId: string, commentId: string) => Promise<void>;
  workTypes: WorkType[];
  setWorkTypes: React.Dispatch<React.SetStateAction<WorkType[]>>;
  addWorkType: (input: { name: string; unit: string; price: number }) => Promise<WorkType>;
  updateWorkType: (
    id: string,
    input: { name: string; unit: string; price: number },
  ) => Promise<WorkType>;
  deleteWorkType: (id: string) => Promise<void>;
  employees: string[];
  setEmployees: React.Dispatch<React.SetStateAction<string[]>>;
  addEmployee: (name: string) => Promise<void>;
  renameEmployee: (id: string, name: string) => Promise<void>;
  deleteEmployee: (id: string) => Promise<void>;
  units: string[];
  setUnits: React.Dispatch<React.SetStateAction<string[]>>;
  addUnit: (name: string) => Promise<void>;
  renameUnit: (id: string, name: string) => Promise<void>;
  deleteUnit: (id: string) => Promise<void>;
  users: AppUser[];
  setUsers: React.Dispatch<React.SetStateAction<AppUser[]>>;
  // ФИО пользователей, вручную добавленных в "Кто подал" (флаг is_submitter),
  // независимо от их роли — для фильтров "Кто подал" на страницах отчётов.
  submitterNames: string[];
  addUser: (input: {
    login: string;
    password: string;
    full_name: string;
    role: Role;
    is_submitter?: boolean;
  }) => Promise<AppUser>;
  updateUser: (
    id: string,
    input: {
      full_name?: string;
      role?: Role;
      active?: boolean;
      password?: string;
      is_submitter?: boolean;
    },
  ) => Promise<AppUser>;
  /** Личные бригады текущего пользователя — видны и редактируются только им. */
  brigades: Brigade[];
  addBrigade: (input: { name: string; members: string[] }) => Promise<Brigade>;
  updateBrigade: (id: string, input: { name: string; members: string[] }) => Promise<Brigade>;
  deleteBrigade: (id: string) => Promise<void>;
  notificationsCount: number;
  notificationItems: NotificationItem[];
  /** id уведомлений, которые текущий пользователь уже открыл/просмотрел. */
  readNotificationIds: Set<string>;
  /** Помечает уведомления как прочитанные (локально и на сервере). */
  markNotificationsRead: (ids: string[]) => void;
  /** id уведомлений, которые пользователь скрыл ("удалил") из списка. */
  hiddenNotificationIds: Set<string>;
  /** Скрывает уведомления из списка (локально и на сервере). Сами заявки/сообщения не удаляются. */
  hideNotifications: (ids: string[]) => void;
  login: (login: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  /** Перечитывает объекты/записи/справочники с сервера (используется фоновым
   * автообновлением и pull-to-refresh на телефоне). */
  refreshData: () => Promise<void>;
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
