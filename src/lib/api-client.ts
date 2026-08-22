import type {
  AppUser,
  Role,
  WorkItem,
  WorkObject,
  WorkRecord,
  WorkRequest,
  WorkType,
  RequestComment,
} from "@/data/mock";

// В браузере запросы идут на тот же домен (относительный /api/...) — nginx
// проксирует /api на backend-сервис, отдельного CORS не требуется.
const BASE = "/api";

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: isFormData
      ? (init?.headers ?? {})
      : { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body.error ?? message;
    } catch {
      /* тело не JSON — оставляем стандартное сообщение */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---- даты: backend хранит ISO (yyyy-mm-dd), фронтенд везде показывает dd.mm.yyyy ----
function isoToRu(iso: string) {
  const d = iso.slice(0, 10);
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : d;
}
export function ruToIso(ru: string) {
  const m = ru.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(d);
}
function formatDateTime(iso?: string | null) {
  if (!iso) return undefined;
  const d = new Date(iso);
  return `${new Intl.DateTimeFormat("ru-RU").format(d)}, ${new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(d)}`;
}

// ---- Адаптеры: API-формат (snake_case, shares, относительные пути фото) → типы фронтенда ----

type ApiItem = {
  name: string;
  unit: string;
  qty: string | number;
  price: string | number;
  manual: boolean;
  shares: { employee_name: string; qty: string | number }[];
};

type ApiRecord = {
  id: number;
  object_id: number | null;
  object_name_raw: string;
  employees: string[];
  claimed_by: string;
  date: string;
  total: string | number;
  comment: string;
  status: string;
  created_at: string;
  modified_by: string | null;
  modified_at: string | null;
  items: ApiItem[];
  photos: string[];
};

function photoUrl(relativePath: string) {
  // relativePath вида "336/uuid.jpg" -> /api/records/336/photos/uuid.jpg
  const [recordId, filename] = relativePath.split("/");
  return `${BASE}/records/${recordId}/photos/${filename}`;
}

function apiRecordToWorkRecord(r: ApiRecord): WorkRecord {
  const items: WorkItem[] = r.items.map((it) => ({
    name: it.name,
    unit: it.unit,
    qty: Number(it.qty),
    price: Number(it.price),
    manual: it.manual,
    allocations: it.shares.map((s) => ({ employee: s.employee_name, qty: Number(s.qty) })),
  }));
  const updatedAt = formatDateTime(r.modified_at);
  return {
    id: String(r.id),
    object_id: r.object_id != null ? String(r.object_id) : "",
    execution_type: "employee",
    employees: r.employees,
    date: isoToRu(r.date),
    time: formatTime(r.created_at),
    items,
    total: Number(r.total),
    comment: r.comment ?? "",
    photos: r.photos.map(photoUrl),
    status: r.status === "draft" ? "draft" : "done",
    created_by: r.claimed_by,
    ...(r.modified_by ? { updated_by: r.modified_by } : {}),
    ...(updatedAt ? { updated_at: updatedAt } : {}),
  };
}

function workRecordToApiPayload(r: WorkRecord) {
  return {
    object_id: r.object_id ? Number(r.object_id) : null,
    object_name: r.object_id, // заполняется вызывающей стороной реальным именем, см. adapters ниже
    employees: r.employees,
    date: ruToIso(r.date),
    comment: r.comment,
    status: r.status,
    items: r.items.map((it) => ({
      name: it.name,
      unit: it.unit,
      qty: it.qty,
      price: it.price,
      manual: it.manual ?? false,
      shares: (it.allocations ?? []).map((a) => ({ employee: a.employee, qty: a.qty })),
    })),
  };
}

// ---- Публичное API ----

export const api = {
  async login(login: string, password: string) {
    return request<{ id: number; login: string; full_name: string; role: Role }>("/login", {
      method: "POST",
      body: JSON.stringify({ login, password }),
    });
  },
  async logout() {
    return request<{ ok: true }>("/logout", { method: "POST" });
  },
  async me() {
    return request<{ id: number; login: string; full_name: string; role: Role; active: boolean }>(
      "/me",
    );
  },

  async listObjects(): Promise<WorkObject[]> {
    const rows =
      await request<{ id: number; name: string; address: string; progress_percent: number }[]>(
        "/objects",
      );
    return rows.map((o) => ({
      id: String(o.id),
      name: o.name,
      address: o.address ?? "",
      records_today: 0,
      progress_percent: o.progress_percent ?? 0,
    }));
  },

  async createObject(input: {
    name: string;
    address: string;
    progress_percent: number;
  }): Promise<WorkObject> {
    const row = await request<{
      id: number;
      name: string;
      address: string;
      progress_percent: number;
    }>("/objects", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return {
      id: String(row.id),
      name: row.name,
      address: row.address ?? "",
      records_today: 0,
      progress_percent: row.progress_percent ?? 0,
    };
  },

  async updateObject(
    id: string,
    input: { name: string; address: string; progress_percent: number },
  ): Promise<WorkObject> {
    const row = await request<{
      id: number;
      name: string;
      address: string;
      progress_percent: number;
    }>(`/objects/${id}`, { method: "PUT", body: JSON.stringify(input) });
    return {
      id: String(row.id),
      name: row.name,
      address: row.address ?? "",
      records_today: 0,
      progress_percent: row.progress_percent ?? 0,
    };
  },

  async deleteObject(id: string): Promise<void> {
    await request<{ deleted: number }>(`/objects/${id}`, { method: "DELETE" });
  },

  async listEmployees(): Promise<string[]> {
    const rows = await request<{ id: number; name: string }[]>("/employees");
    return rows.map((e) => e.name);
  },

  // Возвращает id вместе с именем — нужен только разделу администрирования
  // (переименовать/удалить конкретную запись справочника можно только по id).
  async listEmployeesFull(): Promise<{ id: string; name: string }[]> {
    const rows = await request<{ id: number; name: string }[]>("/employees");
    return rows.map((e) => ({ id: String(e.id), name: e.name }));
  },

  async createEmployee(name: string): Promise<{ id: string; name: string }> {
    const row = await request<{ id: number; name: string }>("/employees", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    return { id: String(row.id), name: row.name };
  },

  async renameEmployee(id: string, name: string): Promise<{ id: string; name: string }> {
    const row = await request<{ id: number; name: string }>(`/employees/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    });
    return { id: String(row.id), name: row.name };
  },

  async deleteEmployee(id: string): Promise<void> {
    await request<{ deleted: number }>(`/employees/${id}`, { method: "DELETE" });
  },

  async listUnits(): Promise<string[]> {
    const rows = await request<{ id: number; name: string }[]>("/units");
    return rows.map((u) => u.name);
  },

  async listUnitsFull(): Promise<{ id: string; name: string }[]> {
    const rows = await request<{ id: number; name: string }[]>("/units");
    return rows.map((u) => ({ id: String(u.id), name: u.name }));
  },

  async createUnit(name: string): Promise<{ id: string; name: string }> {
    const row = await request<{ id: number; name: string }>("/units", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    return { id: String(row.id), name: row.name };
  },

  async renameUnit(id: string, name: string): Promise<{ id: string; name: string }> {
    const row = await request<{ id: number; name: string }>(`/units/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    });
    return { id: String(row.id), name: row.name };
  },

  async deleteUnit(id: string): Promise<void> {
    await request<{ deleted: number }>(`/units/${id}`, { method: "DELETE" });
  },

  async listWorkTypes(): Promise<WorkType[]> {
    const rows =
      await request<{ id: number; name: string; unit: string; price: string | number }[]>(
        "/work-types",
      );
    return rows.map((w) => ({
      id: String(w.id),
      name: w.name,
      unit: w.unit,
      price: Number(w.price),
    }));
  },

  async createWorkType(input: { name: string; unit: string; price: number }): Promise<WorkType> {
    const row = await request<{ id: number; name: string; unit: string; price: string | number }>(
      "/work-types",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
    return { id: String(row.id), name: row.name, unit: row.unit, price: Number(row.price) };
  },

  async updateWorkType(
    id: string,
    input: { name: string; unit: string; price: number },
  ): Promise<WorkType> {
    const row = await request<{ id: number; name: string; unit: string; price: string | number }>(
      `/work-types/${id}`,
      { method: "PUT", body: JSON.stringify(input) },
    );
    return { id: String(row.id), name: row.name, unit: row.unit, price: Number(row.price) };
  },

  async deleteWorkType(id: string): Promise<void> {
    await request<{ deleted: number }>(`/work-types/${id}`, { method: "DELETE" });
  },

  async listPinnedObjects(): Promise<string[]> {
    const rows = await request<(number | string)[]>("/pinned-objects");
    return rows.map(String);
  },

  async pinObject(id: string): Promise<void> {
    await request<{ ok: true }>(`/pinned-objects/${id}`, { method: "POST" });
  },

  async unpinObject(id: string): Promise<void> {
    await request<{ ok: true }>(`/pinned-objects/${id}`, { method: "DELETE" });
  },

  async listUsers(): Promise<AppUser[]> {
    const rows =
      await request<
        { id: number; login: string; full_name: string; role: Role; active: boolean }[]
      >("/users");
    return rows.map((u) => ({
      id: String(u.id),
      login: u.login,
      password: "",
      full_name: u.full_name,
      role: u.role,
      active: u.active,
    }));
  },

  // Пароль хранится на backend только в виде bcrypt-хэша и никогда не возвращается —
  // "подтянуть" старый пароль в принципе невозможно, только задать новый.
  async createUser(input: {
    login: string;
    password: string;
    full_name: string;
    role: Role;
  }): Promise<AppUser> {
    const row = await request<{ id: number; login: string; full_name: string; role: Role }>(
      "/users",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
    return {
      id: String(row.id),
      login: row.login,
      password: "",
      full_name: row.full_name,
      role: row.role,
      active: true,
    };
  },

  async updateUser(
    id: string,
    input: { full_name?: string; role?: Role; active?: boolean; password?: string },
  ): Promise<AppUser> {
    const row = await request<{
      id: number;
      login: string;
      full_name: string;
      role: Role;
      active: boolean;
    }>(`/users/${id}`, { method: "PUT", body: JSON.stringify(input) });
    return {
      id: String(row.id),
      login: row.login,
      password: "",
      full_name: row.full_name,
      role: row.role,
      active: row.active,
    };
  },

  async listRequests(): Promise<WorkRequest[]> {
    const rows = await request<
      {
        id: number;
        text: string;
        submitted_by: string;
        status: string;
        resolved_name: string | null;
        resolved_unit: string | null;
        resolved_price: number | string | null;
        reject_reason: string | null;
        created_at: string;
        comments: { id: number; author: string; text: string; created_at: string }[];
      }[]
    >("/requests");
    return rows.map((r) => ({
      id: String(r.id),
      author: r.submitted_by,
      requested_text: r.text,
      status: r.status as WorkRequest["status"],
      ...(r.resolved_name != null ? { resolved_name: r.resolved_name } : {}),
      ...(r.resolved_unit != null ? { resolved_unit: r.resolved_unit } : {}),
      ...(r.resolved_price != null ? { resolved_price: Number(r.resolved_price) } : {}),
      ...(r.reject_reason != null ? { reject_reason: r.reject_reason } : {}),
      created_at: isoToRu(r.created_at),
      comments: r.comments.map((c) => ({
        id: String(c.id),
        author: c.author,
        own: false,
        text: c.text,
        time: formatTime(c.created_at),
      })),
    }));
  },

  async addRequestComment(requestId: string, text: string): Promise<RequestComment> {
    const c = await request<{ id: number; author: string; text: string; created_at: string }>(
      `/requests/${requestId}/comments`,
      { method: "POST", body: JSON.stringify({ text }) },
    );
    return {
      id: String(c.id),
      author: c.author,
      own: false,
      text: c.text,
      time: formatTime(c.created_at),
    };
  },

  async createRequest(text: string): Promise<WorkRequest> {
    const r = await request<{
      id: number;
      text: string;
      submitted_by: string;
      status: string;
      created_at: string;
    }>("/requests", { method: "POST", body: JSON.stringify({ text }) });
    return {
      id: String(r.id),
      author: r.submitted_by,
      requested_text: r.text,
      status: r.status as WorkRequest["status"],
      created_at: isoToRu(r.created_at),
      comments: [],
    };
  },

  async deleteRequest(id: string): Promise<{ hardDeleted: true; id: string } | WorkRequest> {
    const r = await request<{
      id: number;
      deleted?: boolean;
      text?: string;
      submitted_by?: string;
      status?: string;
      resolved_name?: string | null;
      resolved_unit?: string | null;
      resolved_price?: number | string | null;
      reject_reason?: string | null;
      created_at?: string;
    }>(`/requests/${id}`, { method: "DELETE" });

    if (r.deleted) {
      return { hardDeleted: true, id: String(r.id) };
    }

    return {
      id: String(r.id),
      author: r.submitted_by ?? "",
      requested_text: r.text ?? "",
      status: (r.status ?? "deleted") as WorkRequest["status"],
      ...(r.resolved_name != null ? { resolved_name: r.resolved_name } : {}),
      ...(r.resolved_unit != null ? { resolved_unit: r.resolved_unit } : {}),
      ...(r.resolved_price != null ? { resolved_price: Number(r.resolved_price) } : {}),
      ...(r.reject_reason != null ? { reject_reason: r.reject_reason } : {}),
      created_at: r.created_at ? isoToRu(r.created_at) : "",
      comments: [],
    };
  },

  async decideRequest(
    id: string,
    input: {
      status: "approved" | "rejected";
      resolved_name?: string;
      resolved_unit?: string;
      resolved_price?: number;
      reject_reason?: string;
    },
  ): Promise<WorkRequest> {
    const r = await request<{
      id: number;
      text: string;
      submitted_by: string;
      status: string;
      resolved_name: string | null;
      resolved_unit: string | null;
      resolved_price: number | string | null;
      reject_reason: string | null;
      created_at: string;
    }>(`/requests/${id}`, { method: "PUT", body: JSON.stringify(input) });
    return {
      id: String(r.id),
      author: r.submitted_by,
      requested_text: r.text,
      status: r.status as WorkRequest["status"],
      ...(r.resolved_name != null ? { resolved_name: r.resolved_name } : {}),
      ...(r.resolved_unit != null ? { resolved_unit: r.resolved_unit } : {}),
      ...(r.resolved_price != null ? { resolved_price: Number(r.resolved_price) } : {}),
      ...(r.reject_reason != null ? { reject_reason: r.reject_reason } : {}),
      created_at: isoToRu(r.created_at),
      comments: [],
    };
  },

  async listRecords(): Promise<WorkRecord[]> {
    const { records } = await request<{ records: ApiRecord[] }>("/records?limit=1000");
    return records.map(apiRecordToWorkRecord);
  },

  async createRecord(record: WorkRecord, objectName: string): Promise<WorkRecord> {
    const payload = { ...workRecordToApiPayload(record), object_name: objectName };
    const created = await request<ApiRecord>("/records", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return apiRecordToWorkRecord(created);
  },

  async updateRecord(record: WorkRecord, objectName: string): Promise<WorkRecord> {
    const payload = { ...workRecordToApiPayload(record), object_name: objectName };
    const updated = await request<ApiRecord>(`/records/${record.id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    return apiRecordToWorkRecord(updated);
  },

  async deleteRecord(recordId: string): Promise<void> {
    await request<{ deleted: number }>(`/records/${recordId}`, { method: "DELETE" });
  },

  async uploadPhotos(recordId: string, files: File[]): Promise<string[]> {
    const form = new FormData();
    for (const f of files) form.append("photos", f);
    const result = await request<{ photos: string[] }>(`/records/${recordId}/photos`, {
      method: "POST",
      body: form,
    });
    return result.photos.map(photoUrl);
  },
};

export { ApiError };
