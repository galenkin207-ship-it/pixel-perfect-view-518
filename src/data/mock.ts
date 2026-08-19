export type Role = "user" | "curator" | "admin";
export type RecordStatus = "done" | "draft";
export type ExecutionType = "employee" | "brigade";

export type WorkObject = {
  id: string;
  name: string;
  address: string;
  records_today: number;
  progress_percent: number;
};

export type EmployeeQty = { employee: string; qty: number };

export type WorkItem = {
  name: string;
  unit: string;
  qty: number;
  price: number;
  allocations?: EmployeeQty[];
  manual?: boolean;
};

export type WorkRecord = {
  id: string;
  object_id: string;
  execution_type: ExecutionType;
  employees: string[];
  brigade_name?: string;
  brigade_members?: string[];
  date: string;
  time: string;
  items: WorkItem[];
  total: number;
  comment: string;
  photos: string[];
  status: RecordStatus;
  created_by: string;
  started_at?: string;
  finished_at?: string;
  material?: string;
};

export type RequestComment = {
  id: string;
  author: string;
  own: boolean;
  text: string;
  time: string;
};

export type WorkRequest = {
  id: string;
  author: string;
  requested_text: string;
  status: "pending" | "approved" | "rejected";
  resolved_name?: string;
  resolved_unit?: string;
  resolved_price?: number;
  created_at: string;
  comments: RequestComment[];
};

export type AppUser = { id: string; login: string; password: string; full_name: string; role: Role };

export type WorkType = { id: string; name: string; unit: string; price: number };

export const objects: WorkObject[] = [
  { id: "14", name: "Объект №14", address: "ул. Строителей, уч. 3", records_today: 3, progress_percent: 56 },
  { id: "9", name: "Объект №9", address: "Заречная, стр. 2", records_today: 1, progress_percent: 28 },
  { id: "21", name: "Объект №21", address: "пр. Мира, 118", records_today: 0, progress_percent: 84 },
  { id: "5", name: "Объект №5", address: "Южный проезд, 7", records_today: 5, progress_percent: 41 },
  { id: "31", name: "Объект №31", address: "ул. Кузнечная, 12к2", records_today: 2, progress_percent: 67 },
];

export const employees: string[] = [
  "Петров В.",
  "Козлов И.",
  "Смирнов М.",
  "Иванов К.",
  "Гаврилов А.",
  "Николаев Д.",
  "Ткачук О.",
];

export const brigades: { name: string; members: string[] }[] = [
  { name: "Бригада 1", members: ["Петров В.", "Козлов И.", "Гаврилов А."] },
  { name: "Бригада 2", members: ["Смирнов М.", "Николаев Д."] },
  { name: "Бригада 3", members: ["Ткачук О.", "Иванов К."] },
];

export const units: string[] = ["м²", "м³", "м. п.", "т", "шт", "компл."];

export const workTypes: WorkType[] = [
  { id: "w1", name: "Устройство бетонной стяжки", unit: "м²", price: 420 },
  { id: "w2", name: "Кладка блоков, наружная стена", unit: "м³", price: 3900 },
  { id: "w3", name: "Монтаж арматурного каркаса", unit: "т", price: 18500 },
  { id: "w4", name: "Гидроизоляция фундамента", unit: "м²", price: 310 },
  { id: "w5", name: "Штукатурка фасадная", unit: "м²", price: 560 },
  { id: "w6", name: "Устройство кровли", unit: "м²", price: 890 },
  { id: "w7", name: "Демонтаж перегородок", unit: "м²", price: 240 },
  { id: "w8", name: "Монтаж плинтуса", unit: "м. п.", price: 180 },
  { id: "w9", name: "Электрика: прокладка кабеля", unit: "м. п.", price: 130 },
  { id: "w10", name: "Монтаж оконных блоков", unit: "шт", price: 2600 },
];

export const records: WorkRecord[] = [
  {
    id: "r1",
    object_id: "14",
    execution_type: "brigade",
    employees: [],
    brigade_name: "Бригада 2",
    brigade_members: ["Смирнов М.", "Николаев Д."],
    date: "18.08.2026",
    time: "07:40",
    items: [{ name: "Устройство бетонной стяжки", unit: "м²", qty: 42, price: 420 }],
    total: 17640,
    comment: "Захватка А, работа принята",
    photos: [],
    status: "done",
    created_by: "Иванов К.",
    started_at: "07:40",
    finished_at: "12:10",
    material: "Бетон М300",
  },
  {
    id: "r2",
    object_id: "14",
    execution_type: "employee",
    employees: ["Петров В."],
    date: "18.08.2026",
    time: "09:15",
    items: [{ name: "Кладка блоков, наружная стена", unit: "м³", qty: 18.5, price: 3900 }],
    total: 72150,
    comment: "Заявка отправлена на согласование расценки",
    photos: [],
    status: "done",
    created_by: "Иванов К.",
    started_at: "09:15",
    finished_at: "14:20",
    material: "Блок газобетонный D500",
  },
  {
    id: "r3",
    object_id: "9",
    execution_type: "brigade",
    employees: [],
    brigade_name: "Бригада 1",
    brigade_members: ["Петров В.", "Козлов И.", "Гаврилов А."],
    date: "18.08.2026",
    time: "11:00",
    items: [{ name: "Монтаж арматурного каркаса", unit: "т", qty: 1.2, price: 18500 }],
    total: 22200,
    comment: "",
    photos: [],
    status: "done",
    created_by: "Смирнов М.",
    started_at: "11:00",
    material: "Арматура А500С",
  },
  {
    id: "r4",
    object_id: "21",
    execution_type: "employee",
    employees: ["Петров В."],
    date: "18.08.2026",
    time: "13:20",
    items: [{ name: "Гидроизоляция фундамента", unit: "м²", qty: 64, price: 310 }],
    total: 19840,
    comment: "Обмазочная в два слоя",
    photos: [],
    status: "done",
    created_by: "Иванов К.",
    started_at: "13:20",
    finished_at: "17:00",
    material: "Мастика битумная",
  },
  {
    id: "r5",
    object_id: "5",
    execution_type: "brigade",
    employees: [],
    brigade_name: "Бригада 3",
    brigade_members: ["Ткачук О.", "Иванов К."],
    date: "18.08.2026",
    time: "14:05",
    items: [{ name: "Штукатурка фасадная", unit: "м²", qty: 96, price: 560 }],
    total: 53760,
    comment: "Объём не подтверждён замером",
    photos: [],
    status: "done",
    created_by: "Смирнов М.",
    started_at: "14:05",
    finished_at: "18:30",
    material: "Смесь фасадная",
  },
  {
    id: "r6",
    object_id: "9",
    execution_type: "brigade",
    employees: [],
    brigade_name: "Бригада 1",
    brigade_members: ["Петров В.", "Козлов И."],
    date: "18.08.2026",
    time: "15:40",
    items: [{ name: "Устройство кровли", unit: "м²", qty: 210, price: 890 }],
    total: 186900,
    comment: "",
    photos: [],
    status: "done",
    created_by: "Петров В.",
    started_at: "15:40",
    material: "Мембрана ПВХ",
  },
  {
    id: "r7",
    object_id: "31",
    execution_type: "employee",
    employees: ["Козлов И."],
    date: "17.08.2026",
    time: "08:30",
    items: [{ name: "Демонтаж перегородок", unit: "м²", qty: 38, price: 240 }],
    total: 9120,
    comment: "Вывоз мусора отдельной заявкой",
    photos: [],
    status: "done",
    created_by: "Иванов К.",
    started_at: "08:30",
    finished_at: "13:00",
    material: "—",
  },
  {
    id: "r8",
    object_id: "14",
    execution_type: "employee",
    employees: ["Гаврилов А."],
    date: "17.08.2026",
    time: "16:10",
    items: [{ name: "Электрика: прокладка кабеля", unit: "м. п.", qty: 145, price: 130 }],
    total: 18850,
    comment: "",
    photos: [],
    status: "done",
    created_by: "Иванов К.",
    started_at: "16:10",
    finished_at: "19:00",
    material: "ВВГнг 3х2.5",
  },
];

records.unshift({
  id: "r0",
  object_id: "14",
  execution_type: "employee",
  employees: ["Петров В.", "Козлов И."],
  date: "18.08.2026",
  time: "16:45",
  items: [
    {
      name: "Устройство примыкания кровли к парапету с монтажом фартука из оцинкованной стали",
      unit: "м. п.",
      qty: 24,
      price: 470,
      allocations: [
        { employee: "Петров В.", qty: 12 },
        { employee: "Козлов И.", qty: 12 },
      ],
    },
  ],
  total: 11280,
  comment: "Не завершено: нужно добавить объёмы по второму участку",
  photos: ["Фото 1", "Фото 2"],
  status: "draft",
  created_by: "Иванов К.",
});

export const requests: WorkRequest[] = [
  {
    id: "q1",
    author: "Иванов К.",
    requested_text: "Устройство примыкания кровли к парапету, погонные метры",
    status: "pending",
    created_at: "18.08.2026",
    comments: [
      { id: "c1", author: "Иванов К.", own: true, text: "На объекте №14 работа есть, в справочнике нет позиции.", time: "10:12" },
      { id: "c2", author: "Константин Г.", own: false, text: "Уточните, включён ли фартук из оцинковки.", time: "10:40" },
    ],
  },
  {
    id: "q2",
    author: "Смирнов М.",
    requested_text: "Монтаж закладных деталей под ограждение",
    status: "approved",
    resolved_name: "Монтаж закладных деталей",
    resolved_unit: "шт",
    resolved_price: 340,
    created_at: "16.08.2026",
    comments: [{ id: "c3", author: "Константин Г.", own: false, text: "Добавил в справочник, 340 ₽/шт.", time: "09:05" }],
  },
  {
    id: "q3",
    author: "Иванов К.",
    requested_text: "Уборка территории после демонтажа",
    status: "rejected",
    created_at: "15.08.2026",
    comments: [{ id: "c4", author: "Константин Г.", own: false, text: "Входит в состав демонтажных работ.", time: "12:30" }],
  },
];

export const users: AppUser[] = [
  { id: "u1", login: "ivanov", password: "8471", full_name: "Иванов К.", role: "user" },
  { id: "u2", login: "smirnov", password: "2290", full_name: "Смирнов М.", role: "user" },
  { id: "u3", login: "kurator", password: "5512", full_name: "Дьяченко Л.", role: "curator" },
  { id: "u4", login: "admin", password: "1234", full_name: "Константин Г.", role: "admin" },
];

export const roleLabels: Record<Role, string> = {
  user: "Прораб",
  curator: "Куратор",
  admin: "Администратор",
};

export const statusLabels: Record<RecordStatus, string> = {
  done: "Готово",
  draft: "Не завершена",
};