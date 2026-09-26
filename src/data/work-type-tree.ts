// Дерево видов работ нового каталога (/api/work-types/tree, /api/work-types/search).
// Отдельно от плоского WorkType (data/mock.ts) — это узлы иерархии
// (сборник → раздел → таблица → ... → лист), а не сама позиция для записи.

export type CatalogType = "новое строительство" | "ремонт";

export type WorkTypeTreeNode = {
  id: string;
  name: string;
  level: number;
  parent_id: string | null;
  unit: string;
  price: number;
  has_price: boolean;
  gesn_code: string | null;
  catalog_type: CatalogType | null;
  is_step_item: boolean;
  step_unit_label: string | null;
  step_base_work_type_id: string | null;
  variant_label: string | null;
  work_composition: string | null;
  labor_hours: number | null;
  has_children: boolean;
  has_counter_steps: boolean;
  // Происхождение позиции — присутствует только у листьев (level=5):
  // 'gesn_catalog' — из справочника ГЭСН, иначе (legacy, user_added) — своя.
  // У промежуточных узлов бэкенд поле не отдаёт.
  source: string | null;
  // Право на правку узла (admin/curator) — приходит только из /tree, у
  // /search такого поля нет (там false; для карточек поиска ориентируемся
  // на роль). Сервер всё равно проверяет права на каждую мутацию.
  can_edit: boolean;
  // Право на правку контейнера (уровни 1–4: создание/переименование/архив
  // разделов) — только admin, куратор получает false. Присутствует только у
  // контейнеров в /tree; у листьев и в /search — false.
  can_edit_node: boolean;
  // Контейнер (уровни 1–4) без единого живого листа в поддереве. Бэкенд
  // отдаёт true только при GET /tree?include_empty=1 (только admin); во всех
  // остальных ответах поля нет (здесь false).
  is_empty: boolean;
  // Только у групп (level 4) в обычном /tree (пикер): единственная позиция
  // группы, если она там одна. По ней карточка группы схлопывается сразу, без
  // загрузки детей. Иначе (несколько позиций, нет позиций, другой уровень,
  // справочник) — null.
  only_leaf: WorkTypeTreeNode | null;
};

// GET /work-types/:id/path — путь позиции от сборника до листа (без цены).
export type WorkTypePath = {
  catalog_type: CatalogType | null;
  levels: { id: string; level: number; name: string; gesn_code: string | null }[];
  leaf: { id: string; name: string };
};

export type WorkTypeSearchResult = WorkTypeTreeNode & { breadcrumb: string[] };

// GET /work-types/search-smart?mode=ai — уверенность ИИ в лучшем результате.
// null — реранк не сработал (порядок только по эмбеддингам).
export type WorkTypeAiConfidence = "exact" | "likely" | "similar" | null;

// GET /work-types/:id/details — полные сведения о позиции для модалки «Сведения»
// (admin/curator, только чтение). path — от сборника до группы, без самой
// позиции. У «своих» позиций (user_added/legacy) catalog_type, gesn_code,
// work_composition и labor_hours могут быть null, а path короче.
export type WorkTypeInfo = {
  id: string;
  name: string;
  variant_label: string | null;
  gesn_code: string | null;
  source: string | null;
  catalog_type: CatalogType | null;
  unit: string | null;
  price: number;
  has_price: boolean;
  labor_hours: number | null;
  work_composition: string | null;
  path: { id: string; level: number; name: string; gesn_code: string | null }[];
};

// Сколько всего внутри контейнера (GET /work-types/nodes/:id/usage, только
// admin): листья и подконтейнеры на любой глубине поддерева.
export type WorkTypeNodeUsage = {
  id: string;
  name: string;
  level: number;
  status: string;
  leaves_active: number;
  leaves_archived: number;
  containers_active: number;
  containers_archived: number;
  record_items_count: number;
};

// Независимый шаговый модификатор (is_counter_step=true) базовой позиции —
// см. GET /api/work-types/:baseId/counter-steps. У самой базовой позиции
// (WorkTypeTreeNode с has_counter_steps=true) цена за "стандартный" объём,
// у каждого шага — цена за один инкремент своей единицы (step_unit_label).
export type WorkTypeCounterStep = {
  id: string;
  gesn_code: string | null;
  step_unit_label: string | null;
  price: number;
};

// Звено цепочки предков листа (сборник → раздел → таблица → группа) из
// GET /work-types/:id/detail — реальные узлы БЕЗ схлопывания дублирующих
// групп (в отличие от /tree).
export type WorkTypeAncestor = {
  id: string;
  level: number;
  name: string;
  catalog_type: CatalogType | null;
};

// Лист целиком для редактора (GET /work-types/:id/detail, ответ PATCH
// /:id/edit). Служебные признаки (is_step_item,
// is_counter_step, step_*) в редакторе не показываются и не меняются, но
// приходят с сервера — держим их в типе, чтобы не терять.
export type WorkTypeDetail = {
  id: string;
  parent_id: string | null;
  level: number;
  catalog_type: CatalogType | null;
  gesn_code: string | null;
  labor_hours: number | null;
  work_composition: string | null;
  variant_label: string | null;
  name: string;
  unit: string;
  price: number;
  has_price: boolean;
  sbornik_id: string | null;
  source: string | null;
  sort_order: number;
  status: string;
  is_step_item: boolean;
  is_counter_step: boolean;
  step_base_work_type_id: string | null;
  step_unit_label: string | null;
  ancestors: WorkTypeAncestor[];
};

// Редактируемые поля листа для PATCH /:id/edit. parent_id передаётся только
// если расположение изменилось. Под группой (level 4) шлётся variant_label
// (имя сервер пересчитывает сам), иначе — name.
export type WorkTypeLeafInput = {
  name: string;
  variant_label: string | null;
  unit: string;
  price: number;
  has_price: boolean;
  labor_hours: number | null;
  gesn_code: string | null;
  work_composition: string | null;
  parent_id?: string;
};

// Тело POST /work-types/batch: общий родитель и состав работ + строки. Итоговое
// имя листа считает сервер: под группой (level 4) text — вариант (имя = группа +
// вариант), под другим контейнером — полное название позиции.
export type WorkTypeBatchItemInput = {
  text: string;
  unit: string;
  price: number;
  has_price: boolean;
  labor_hours: number | null;
  gesn_code: string | null;
};

export type WorkTypeBatchInput = {
  parent_id: string;
  work_composition: string | null;
  items: WorkTypeBatchItemInput[];
};
