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
};

export type WorkTypeSearchResult = WorkTypeTreeNode & { breadcrumb: string[] };
