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
};

export type WorkTypeSearchResult = WorkTypeTreeNode & { breadcrumb: string[] };

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
