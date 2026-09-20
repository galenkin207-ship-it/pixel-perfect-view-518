import { useEffect, useRef, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DeleteNodeDialog, NodeNameDialog } from "@/components/app/work-type-node-dialogs";
import { AutoTextarea, LocationSelect } from "@/components/app/work-type-editor-fields";
import {
  fieldClass,
  labelClass,
  PriceField,
  UnitField,
  VariantList,
  type VariantForm,
} from "@/components/app/work-type-variant-fields";
import type {
  CatalogType,
  WorkTypeAncestor,
  WorkTypeDetail,
  WorkTypeLeafInput,
} from "@/data/work-type-tree";
import { api, ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { formatGesnNumberLabel } from "@/lib/work-type-format";
import { useApp } from "@/state/use-app";

export type WorkTypeEditorTarget =
  | { kind: "edit"; id: string }
  // Новая позиция: расположение предзаполнено цепочкой предков (реальные
  // узлы — сборник → раздел → таблица → группа), catalogType нужен для
  // создания нового сборника.
  | {
      kind: "create";
      catalogType: CatalogType;
      ancestors: WorkTypeAncestor[];
      // Предзаполнение полей (заявка мастера: название и единица).
      prefill?: { name?: string; unit?: string };
    };

export type WorkTypeEditorResult = {
  // Лист ДО правки (для старой цепочки предков и старого parent_id);
  // null при создании.
  before: WorkTypeDetail | null;
  // При создании — первый созданный лист (по его цепочке предков хозяин
  // раскрывает каскад).
  after: WorkTypeDetail;
  // Только создание: id всех созданных позиций (в порядке создания).
  createdIds?: string[];
};

type Option = { id: string; name: string; gesnCode: string | null };

// Четыре уровня расположения: индекс в selection === level - 1.
const LOCATION_LEVELS = [
  { label: "Сборник", addTitle: "Добавить новый сборник", placeholder: "Название нового сборника" },
  { label: "Раздел", addTitle: "Добавить новый раздел", placeholder: "Название нового раздела" },
  { label: "Таблица", addTitle: "Добавить новую таблицу", placeholder: "Название новой таблицы" },
  { label: "Группа", addTitle: "Добавить новую группу", placeholder: "Название новой группы" },
];

const CATALOG_TYPE_OPTIONS: { value: CatalogType; label: string }[] = [
  { value: "новое строительство", label: "Строительство" },
  { value: "ремонт", label: "Ремонт" },
];

// Состав работ + строки позиций. Режим создания: строк несколько, каждая —
// отдельный лист (text = вариант под группой или полное название без группы),
// name не используется. Режим правки: строка одна (text — вариант позиции под
// группой), name — название позиции, когда группы нет.
type FormState = {
  name: string;
  composition: string;
  variants: VariantForm[];
};

let variantKeySeq = 0;

function newVariant(patch: Partial<VariantForm> = {}): VariantForm {
  variantKeySeq += 1;
  return {
    key: `v${variantKeySeq}`,
    text: "",
    unit: "",
    price: "",
    hasPrice: true,
    laborHours: "",
    gesnCode: "",
    showMore: false,
    ...patch,
  };
}

function emptyForm(): FormState {
  return { name: "", composition: "", variants: [newVariant()] };
}

function formFromDetail(d: WorkTypeDetail): FormState {
  return {
    name: d.name,
    composition: d.work_composition ?? "",
    variants: [
      newVariant({
        text: d.variant_label ?? "",
        unit: d.unit,
        price: String(d.price),
        hasPrice: d.has_price,
        laborHours: d.labor_hours == null ? "" : String(d.labor_hours),
        gesnCode: d.gesn_code ?? "",
      }),
    ],
  };
}

// Ключи строк и «раскрыто ли Ещё» — не данные формы: в снимок «есть
// несохранённые изменения» не попадают.
function snapshotOf(form: FormState, selection: (string | null)[]): string {
  return JSON.stringify({
    form: {
      ...form,
      variants: form.variants.map(({ key: _key, showMore: _showMore, ...rest }) => rest),
    },
    selection,
  });
}

// Слот i соответствует типу узла level = i + 1. Предки сопоставляются со
// слотами по level предка (а не по порядку): позиция может лежать прямо под
// сборником, а группа (level 4) — прямо под сборником, минуя раздел и таблицу.
// Недостающие уровни остаются пустыми («— нет —»).
function selectionFromAncestors(ancestors: WorkTypeAncestor[]): (string | null)[] {
  return LOCATION_LEVELS.map((_, i) => ancestors.find((a) => a.level === i + 1)?.id ?? null);
}

// Родитель списка слота — самый глубокий выбранный узел ВЫШЕ слота ("root" —
// для сборников). null — слот пока недоступен (сборник не выбран).
function slotParentId(slotIdx: number, sel: (string | null)[]): string | null {
  if (slotIdx === 0) return "root";
  for (let j = slotIdx - 1; j >= 0; j -= 1) {
    const id = sel[j];
    if (id) return id;
  }
  return null;
}

// Ключ кэша списка слота: родитель + level (у одного родителя разные слоты —
// разные списки: level=2, level=3, level=4 среди его прямых детей).
function slotKey(slotIdx: number, sel: (string | null)[]): string | null {
  const parent = slotParentId(slotIdx, sel);
  return parent ? `${parent}:${slotIdx + 1}` : null;
}

function parseNumber(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

// Ошибка batch приходит как «Строка N: текст» — разбираем, чтобы показать её у
// нужной строки формы. null — сообщение без номера строки.
function parseRowError(message: string): { row: number; text: string } | null {
  const m = /^Строка (\d+):\s*([\s\S]*)$/.exec(message);
  return m ? { row: Number(m[1]) - 1, text: m[2]! } : null;
}

// Понятный русский текст для ошибки сохранения. Сервер на 400/409 отдаёт
// готовое сообщение по-русски (дубль названия, дубль кода ГЭСН, неверная
// цена…) — показываем его как есть.
function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "Недостаточно прав для изменения справочника";
    if (err.status === 404) return "Позиция не найдена — возможно, её уже удалили";
    if (err.status === 400 || err.status === 409) return err.message;
  }
  return "Не удалось сохранить, попробуйте ещё раз";
}

// Большая модалка редактирования (и создания) позиции справочника видов
// работ. Каскад под ней НЕ размонтируется — модалка рендерится порталом
// поверх, а после сохранения хозяин точечно обновляет кэш и оставляет
// пользователя ровно там, где он был.
export function WorkTypeEditorDialog({
  target,
  onClose,
  onSaved,
  onNodeCreated,
  onNodeRenamed,
  onNodeDeleted,
}: {
  target: WorkTypeEditorTarget;
  onClose: () => void;
  // keepOpen — «Сохранить и добавить ещё»: форма остаётся открытой (хозяин её
  // не закрывает), но каскад под модалкой обновляется.
  onSaved: (result: WorkTypeEditorResult, opts?: { keepOpen?: boolean }) => void;
  // Структуру справочника правят прямо из селекторов «Расположение» (только
  // admin). Хозяин (страница справочника) точечно обновляет свой каскад под
  // модалкой; parentId — реальный родитель узла (null — корень каталога).
  onNodeCreated?: (parentId: string | null) => void | Promise<void>;
  onNodeRenamed?: (id: string, name: string, parentId: string | null) => void | Promise<void>;
  onNodeDeleted?: (id: string, parentId: string | null) => void | Promise<void>;
}) {
  const { units, role } = useApp();
  // Создавать разделы (уровни 1–4) может только admin (POST /work-types/nodes
  // для куратора — 403): куратор выбирает расположение только из существующих.
  const isAdmin = role === "admin";
  const isCreate = target.kind === "create";

  const [createType, setCreateType] = useState<CatalogType>(isCreate ? target.catalogType : "новое строительство");
  const [initialCreateForm] = useState<FormState>(() =>
    isCreate
      ? {
          ...emptyForm(),
          variants: [newVariant({ text: target.prefill?.name ?? "", unit: target.prefill?.unit ?? "" })],
        }
      : emptyForm(),
  );
  const [detail, setDetail] = useState<WorkTypeDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialCreateForm);
  const [selection, setSelection] = useState<(string | null)[]>(() =>
    isCreate ? selectionFromAncestors(target.ancestors) : [null, null, null, null],
  );
  // Ключ — slotKey (родитель + level слота), значение — уже известные
  // варианты выбора в этом слоте.
  const [options, setOptions] = useState<Record<string, Option[]>>({});
  const [ready, setReady] = useState(isCreate);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // «Сохранено: <название>» после «Сохранить и добавить ещё».
  const [savedName, setSavedName] = useState<string | null>(null);
  // Снимок состояния на момент открытия — по нему считаем "есть несохранённые
  // изменения".
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(
    isCreate ? snapshotOf(initialCreateForm, selectionFromAncestors(target.ancestors)) : null,
  );
  // Ошибки по индексу строки вариантов (клиентская проверка и «Строка N» из batch).
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});

  const catalogType: CatalogType | null =
    detail?.catalog_type ?? (isCreate ? createType : null);
  // Актуальное расположение для async-обработчиков (создание узла ждёт ответ
  // сервера, а выбор за это время мог поменяться).
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const catalogTypeRef = useRef(catalogType);
  catalogTypeRef.current = catalogType;

  // Загрузка листа (режим правки).
  useEffect(() => {
    if (target.kind !== "edit") return;
    let cancelled = false;
    api
      .getWorkTypeDetail(target.id)
      .then((d) => {
        if (cancelled) return;
        const sel = selectionFromAncestors(d.ancestors);
        const f = formFromDetail(d);
        setDetail(d);
        setForm(f);
        setSelection(sel);
        setInitialSnapshot(snapshotOf(f, sel));
        setReady(true);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(describeLoadError(err));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Реальные предки, известные из detail/create-цепочки, гарантированно
  // присутствуют в списках выбора — даже если /tree их не отдаёт (бэкенд
  // "разворачивает" группы, дублирующие имя таблицы, и не показывает пустые
  // контейнеры).
  const knownAncestors = isCreate ? target.ancestors : (detail?.ancestors ?? []);
  const ancestorSelection = selectionFromAncestors(knownAncestors);

  // Селекторы получают только контейнеры; admin — ещё и пустые (иначе только
  // что созданный раздел нельзя было бы выбрать целью переноса). Куратор
  // выбирает только из существующих (непустых) разделов.
  const treeOpts = { containersOnly: true, includeEmpty: isAdmin };

  // Список слота уровня N = контейнеры level=N среди ПРЯМЫХ детей самого
  // глубокого выбранного узла выше (эндпоинт детей с параметром level);
  // сборники — корневой список каталога. Слоты 2–4 доступны, как только выбран
  // сборник, даже если предыдущие слоты — «— нет —».
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    LOCATION_LEVELS.forEach((_, i) => {
      const key = slotKey(i, selection);
      if (!key) return;
      if (options[key]) return;
      const parentId = slotParentId(i, selection)!;
      const request =
        i === 0
          ? catalogTypeRef.current
            ? api.getWorkTypeTree({ type: catalogTypeRef.current }, treeOpts)
            : Promise.resolve([])
          : api.getWorkTypeTree({ parentId }, { ...treeOpts, level: i + 1 });
      request
        .then((nodes) => {
          if (cancelled) return;
          const fetched: Option[] = nodes
            .filter((n) => n.level === i + 1 && n.source !== "legacy_root")
            .map((n) => ({ id: n.id, name: n.name, gesnCode: n.gesn_code }));
          setOptions((prev) => {
            // Известный предок этого уровня, лежащий именно в этом списке,
            // гарантированно остаётся в нём.
            const seededAncestor = knownAncestors.find((a) => a.level === i + 1);
            const seeded: Option[] =
              seededAncestor && key === slotKey(i, ancestorSelection)
                ? [{ id: seededAncestor.id, name: seededAncestor.name, gesnCode: null }]
                : [];
            const existing = prev[key] ?? [];
            const merged = [...fetched];
            for (const extra of [...existing, ...seeded]) {
              if (!merged.some((o) => o.id === extra.id)) merged.push(extra);
            }
            return { ...prev, [key]: merged };
          });
        })
        .catch(() => {
          if (cancelled) return;
          setOptions((prev) => ({ ...prev, [key]: prev[key] ?? [] }));
        });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selection]);

  // Единицы соседних позиций выбранного родителя (только создание): листья
  // самого глубокого выбранного узла — подсказка «как у соседей».
  const [neighborUnits, setNeighborUnits] = useState<string[]>([]);
  const deepestSelected = [...selection].reverse().find((id) => id !== null) ?? null;
  useEffect(() => {
    if (!isCreate || !deepestSelected) {
      setNeighborUnits([]);
      return;
    }
    let cancelled = false;
    api
      .getWorkTypeTree({ parentId: deepestSelected }, { includeEmpty: isAdmin })
      .then((nodes) => {
        if (cancelled) return;
        const found: string[] = [];
        for (const n of nodes) {
          const u = n.unit?.trim();
          if (n.level === 5 && u && !found.includes(u)) found.push(u);
        }
        setNeighborUnits(found.slice(0, 6));
      })
      .catch(() => {
        if (!cancelled) setNeighborUnits([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isCreate, isAdmin, deepestSelected]);

  // Группа = самый глубокий выбранный узел имеет level 4 (слот «Группа»). От
  // этого зависят подписи полей, правило названия и предпросмотр; смена группы
  // введённый текст не трогает. Имя берём из известных предков (они есть
  // раньше, чем догрузятся списки слотов).
  const groupId = selection[3];
  const underGroup = Boolean(groupId);
  const groupName = groupId
    ? (knownAncestors.find((a) => a.id === groupId)?.name ?? optionName(3, groupId))
    : null;

  const dirty = initialSnapshot !== null && snapshotOf(form, selection) !== initialSnapshot;

  function requestClose() {
    if (saving) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  function setField<K extends "name" | "composition">(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFormError(null);
  }

  function setVariant(index: number, patch: Partial<VariantForm>) {
    setForm((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) => (i === index ? { ...v, ...patch } : v)),
    }));
    // «Ещё» — только раскрытие, ошибку строки не гасит.
    if (Object.keys(patch).some((k) => k !== "showMore")) {
      setFormError(null);
      setRowErrors((prev) => {
        if (!(index in prev)) return prev;
        const { [index]: _dropped, ...rest } = prev;
        return rest;
      });
    }
  }

  // Новая строка: единица — как у предыдущей, цена пустая.
  function addVariant() {
    setForm((prev) => ({
      ...prev,
      variants: [...prev.variants, newVariant({ unit: prev.variants[prev.variants.length - 1]?.unit ?? "" })],
    }));
  }

  function removeVariant(index: number) {
    setForm((prev) =>
      prev.variants.length > 1 ? { ...prev, variants: prev.variants.filter((_, i) => i !== index) } : prev,
    );
    // Индексы строк сдвинулись — старые ошибки к ним уже не относятся.
    setRowErrors({});
  }

  // Смена типа каталога (только создание): выбранное расположение относилось к
  // другому каталогу — сбрасываем все слоты, список сборников перечитается для
  // нового типа. Введённые поля позиции остаются.
  function changeCatalogType(next: CatalogType) {
    if (next === createType) return;
    setCreateType(next);
    setSelection([null, null, null, null]);
    setOptions({});
    setAdding(null);
    setNodeAction(null);
    setFormError(null);
  }

  // Смена слота сбрасывает слоты ниже; их списки (родитель мог поменяться)
  // выкидываем из кэша — эффект выше перечитает их с сервера.
  function changeSelection(levelIdx: number, id: string | null) {
    const next = selectionRef.current.map((v, i) => (i < levelIdx ? v : i === levelIdx ? id : null));
    setSelection(next);
    setOptions((prev) => {
      const copy = { ...prev };
      for (let j = levelIdx + 1; j < LOCATION_LEVELS.length; j += 1) {
        const key = slotKey(j, next);
        if (key) delete copy[key];
      }
      return copy;
    });
    setFormError(null);
  }

  // Инлайн-создание узла на уровне levelIdx («+» справа от селекта).
  const [adding, setAdding] = useState<{ levelIdx: number; name: string; busy: boolean; error: string | null } | null>(null);

  // Переименование/удаление выбранного узла (карандаш/корзина справа от
  // селектора, только admin). Форма позиции при этом не трогается: меняется
  // только список вариантов и, при удалении выбранного узла, selection.
  const [nodeAction, setNodeAction] = useState<
    { kind: "rename" | "delete"; levelIdx: number; id: string; name: string } | null
  >(null);

  function optionName(levelIdx: number, id: string): string {
    const key = slotKey(levelIdx, selection);
    return (key ? options[key] : undefined)?.find((o) => o.id === id)?.name ?? "";
  }

  // Реальный родитель узла слота (null — корень каталога): для обработчиков
  // хозяина, которые перечитывают список этого родителя.
  function slotNodeParent(levelIdx: number, sel: (string | null)[]): string | null {
    const parent = slotParentId(levelIdx, sel);
    return parent === "root" ? null : parent;
  }

  async function createNode() {
    if (!adding) return;
    const name = adding.name.trim();
    if (!name) {
      setAdding({ ...adding, error: "Введите название" });
      return;
    }
    const { levelIdx } = adding;
    // Родитель — самый глубокий выбранный узел выше слота; level — номер слота
    // (явно, иначе сервер поставил бы parent.level+1 и пропущенный уровень
    // «схлопнулся» бы).
    const parentId = slotNodeParent(levelIdx, selection);
    if (levelIdx > 0 && !parentId) return;
    const key = slotKey(levelIdx, selection);
    if (!key) return;
    setAdding({ ...adding, busy: true, error: null });
    try {
      const node = await api.createWorkTypeNode({
        parentId,
        name,
        ...(parentId === null && catalogType ? { catalogType } : {}),
        ...(levelIdx > 0 ? { level: levelIdx + 1 } : {}),
      });
      setOptions((prev) => ({
        ...prev,
        [key]: [
          ...(prev[key] ?? []).filter((o) => o.id !== node.id),
          { id: node.id, name: node.name, gesnCode: node.gesn_code },
        ],
      }));
      // Новый узел сразу выбираем (глубже — сбрасываем, у нового пусто).
      changeSelection(levelIdx, node.id);
      setAdding(null);
      void onNodeCreated?.(parentId);
    } catch (err) {
      setAdding({ levelIdx, name: adding.name, busy: false, error: describeError(err) });
    }
  }

  async function save(another = false) {
    setFormError(null);
    setRowErrors({});
    setSavedName(null);

    // Режим правки без группы: название обязательно (под группой название
    // собирает сервер из группы и варианта).
    if (!isCreate && !underGroup && !form.name.trim()) return setFormError("Укажите название позиции");

    // Проверка строк: ошибки показываем у самой строки.
    const errors: Record<number, string> = {};
    const parsed = form.variants.map((v, i) => {
      const price = parseNumber(v.price);
      const laborHours = parseNumber(v.laborHours);
      if (isCreate && !underGroup && !v.text.trim()) errors[i] = "Введите название позиции";
      else if (isCreate && underGroup && form.variants.length > 1 && !v.text.trim()) errors[i] = "Укажите вариант";
      else if (!v.unit.trim()) errors[i] = "Укажите единицу измерения";
      else if (price !== null && (Number.isNaN(price) || price < 0)) errors[i] = "Цена должна быть неотрицательным числом";
      else if (laborHours !== null && (Number.isNaN(laborHours) || laborHours < 0)) {
        errors[i] = "Трудозатраты должны быть неотрицательным числом";
      }
      return { price, laborHours };
    });
    if (Object.keys(errors).length > 0) {
      setRowErrors(errors);
      return scrollToRow(Math.min(...Object.keys(errors).map(Number)));
    }

    const deepest = [...selection].reverse().find((id) => id !== null) ?? null;
    const originalParent = detail?.parent_id ?? null;
    const locationChanged = isCreate || deepest !== originalParent;
    if (locationChanged && !deepest) {
      return setFormError("Выберите хотя бы сборник");
    }

    const composition = form.composition.trim() ? form.composition : null;
    // Строка → числовые/общие поля листа.
    const rowFields = (i: number) => {
      const v = form.variants[i]!;
      return {
        unit: v.unit.trim(),
        price: parsed[i]!.price ?? 0,
        has_price: v.hasPrice,
        labor_hours: parsed[i]!.laborHours,
        gesn_code: v.gesnCode.trim() || null,
      };
    };

    setSaving(true);
    try {
      if (target.kind === "create") {
        // Единственный путь создания — batch; имя каждой позиции считает сервер.
        const createdNodes = await api.createWorkTypeBatch({
          parent_id: deepest!,
          work_composition: composition,
          items: form.variants.map((v, i) => ({ text: v.text.trim(), ...rowFields(i) })),
        });
        const createdIds = createdNodes.map((n) => n.id);
        const savedLabel = createdNodes.length === 1 ? createdNodes[0]!.name : `позиций: ${createdNodes.length}`;
        // Хозяину нужен полный лист (цепочка предков — раскрыть каскад): берём
        // первый созданный. Позиции к этому моменту уже сохранены.
        let first: WorkTypeDetail;
        try {
          first = await api.getWorkTypeDetail(createdIds[0]!);
        } catch {
          const fresh = emptyForm();
          setForm(fresh);
          setInitialSnapshot(snapshotOf(fresh, selection));
          setFormError(
            `Позиции сохранены (${createdNodes.length}), но справочник не обновился — закройте окно и обновите страницу`,
          );
          setSaving(false);
          return;
        }
        onSaved({ before: null, after: first, createdIds }, { keepOpen: another });
        if (another) {
          // Расположение остаётся, строки и состав работ очищаются, фокус — в первую строку.
          const fresh = emptyForm();
          setForm(fresh);
          setInitialSnapshot(snapshotOf(fresh, selection));
          setSavedName(savedLabel);
          setSaving(false);
          setTimeout(() => {
            document.querySelector<HTMLTextAreaElement>('[data-variant-row="0"] textarea')?.focus();
          }, 0);
        }
      } else {
        // Под группой шлём variant_label (только если он изменился — пустой
        // вариант у старой позиции название не трогает), name не шлём: его
        // пересчитывает сервер. Без группы — name.
        const variantText = form.variants[0]!.text.trim();
        const variantChanged = variantText !== (detail?.variant_label ?? "").trim();
        const saved = await api.editWorkType(target.id, {
          ...(underGroup ? (variantChanged ? { variant_label: variantText || null } : {}) : { name: form.name.trim() }),
          ...rowFields(0),
          work_composition: composition,
          ...(locationChanged && deepest ? { parent_id: deepest } : {}),
        });
        onSaved({ before: detail, after: saved });
      }
    } catch (err) {
      const message = describeError(err);
      const rowError = target.kind === "create" ? parseRowError(message) : null;
      if (rowError && rowError.row >= 0 && rowError.row < form.variants.length) {
        // Ошибка batch — у нужной строки, окно не закрываем.
        setRowErrors({ [rowError.row]: rowError.text });
        scrollToRow(rowError.row);
      } else {
        setFormError(message);
      }
      setSaving(false);
    }
  }

  function scrollToRow(index: number) {
    setTimeout(() => {
      document
        .querySelector(`[data-variant-row="${index}"]`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 0);
  }

  // Тип каталога позиции в режиме правки (не меняется — только показывается).
  const catalogTypeField = (
    <div className="space-y-1.5">
      <span className={labelClass}>Тип каталога</span>
      <div className={cn(fieldClass, "bg-muted/50 text-muted-foreground")}>
        {catalogType === "ремонт" ? "Ремонт" : "Строительство"}
      </div>
    </div>
  );

  const title = isCreate ? "Новая позиция" : "Редактирование позиции";

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && requestClose()}>
        <DialogContent
          // Ширина — по содержимому (w-max), но не уже 46rem и не шире
          // ~1100px и не шире экрана; высота как раньше, вертикально
          // прокручивается тело (шапка и кнопки внизу — shrink-0).
          className="flex h-[92dvh] max-h-[92dvh] w-max min-w-[min(46rem,calc(100vw-2rem))] max-w-[min(68.75rem,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0"
          // Закрытие только осознанное: Esc/клик мимо/крестик идут через
          // requestClose() (см. onOpenChange), поэтому при несохранённых
          // изменениях сначала спрашиваем подтверждение.
        >
          <div className="flex shrink-0 items-center gap-3 border-b border-border px-6 py-4 pr-12">
            <DialogTitle>{title}</DialogTitle>
            {dirty && (
              <span className="flex items-center gap-1.5 rounded-full bg-status-review-soft px-2.5 py-0.5 text-xs font-semibold text-status-review">
                <span className="size-1.5 rounded-full bg-status-review" />
                Есть несохранённые изменения
              </span>
            )}
          </div>
          <DialogDescription className="sr-only">
            Расположение позиции в справочнике, её параметры и состав работ
          </DialogDescription>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {loadError ? (
              <div className="flex flex-col items-center gap-3 p-10 text-center text-sm text-muted-foreground">
                <p>{loadError}</p>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-border bg-surface px-4 py-2 font-semibold text-foreground"
                >
                  Закрыть
                </button>
              </div>
            ) : !ready ? (
              <div className="flex items-center justify-center p-10 text-sm text-muted-foreground">
                Загрузка...
              </div>
            ) : (
              <div className="space-y-6">
                {/* Расположение */}
                <section className="space-y-3">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="text-sm font-bold">Расположение в справочнике</h3>
                    {isCreate && (
                      <span className="text-xs text-muted-foreground">
                        Тип каталога: {catalogType === "ремонт" ? "Ремонт" : "Строительство"}
                      </span>
                    )}
                  </div>
                  {isCreate && (
                    // Переключатель типа каталога: от него зависит список
                    // сборников, «+» у слота «Сборник» создаёт сборник этого типа.
                    <div role="group" aria-label="Тип каталога" className="flex w-fit rounded-xl border border-border bg-surface p-1">
                      {CATALOG_TYPE_OPTIONS.map((t) => (
                        <button
                          key={t.value}
                          type="button"
                          disabled={saving}
                          aria-pressed={t.value === createType}
                          onClick={() => changeCatalogType(t.value)}
                          className={cn(
                            "rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-60",
                            t.value === createType
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="space-y-3">
                    {LOCATION_LEVELS.map((lvl, i) => {
                      const key = slotKey(i, selection);
                      const opts = key ? (options[key] ?? []) : [];
                      // Сборник обязателен и доступен всегда; остальные слоты —
                      // как только выбран сборник (предыдущие могут быть «— нет —»).
                      const slotLocked = i > 0 && !selection[0];
                      const isAddingHere = isAdmin && adding?.levelIdx === i;
                      return (
                        <div key={lvl.label} className="flex min-w-0 flex-col gap-1.5">
                          <span className={labelClass}>{lvl.label}</span>
                          {/* Селектор — на всю ширину, иконки — в ряд справа от него
                              и по его верху (items-start): триггер растёт по высоте
                              под длинное название. */}
                          <div className="flex items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <LocationSelect
                                ariaLabel={lvl.label}
                                value={selection[i] ?? null}
                                disabled={slotLocked || saving}
                                onChange={(id) => changeSelection(i, id)}
                                placeholder="Выберите…"
                                noneLabel={i === 0 ? null : slotLocked ? "Сначала выберите сборник" : "— нет —"}
                                noneDisabled={slotLocked}
                                options={opts.map((o) => ({
                                  id: o.id,
                                  label:
                                    i === 0 && formatGesnNumberLabel(o.gesnCode)
                                      ? `${formatGesnNumberLabel(o.gesnCode)} ${o.name}`
                                      : o.name,
                                }))}
                              />
                            </div>
                            {isAdmin && (
                              <>
                                <button
                                  type="button"
                                  title={`Переименовать: ${lvl.label.toLowerCase()}`}
                                  aria-label={`Переименовать: ${lvl.label.toLowerCase()}`}
                                  disabled={!selection[i] || saving}
                                  onClick={() =>
                                    setNodeAction({
                                      kind: "rename",
                                      levelIdx: i,
                                      id: selection[i]!,
                                      name: optionName(i, selection[i]!),
                                    })
                                  }
                                  className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
                                >
                                  <Pencil className="size-4" />
                                </button>
                                <button
                                  type="button"
                                  title={`Удалить: ${lvl.label.toLowerCase()}`}
                                  aria-label={`Удалить: ${lvl.label.toLowerCase()}`}
                                  disabled={!selection[i] || saving}
                                  onClick={() =>
                                    setNodeAction({
                                      kind: "delete",
                                      levelIdx: i,
                                      id: selection[i]!,
                                      name: optionName(i, selection[i]!),
                                    })
                                  }
                                  className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
                                >
                                  <Trash2 className="size-4" />
                                </button>
                                <button
                                  type="button"
                                  title={lvl.addTitle}
                                  aria-label={lvl.addTitle}
                                  disabled={slotLocked || saving}
                                  onClick={() =>
                                    setAdding(isAddingHere ? null : { levelIdx: i, name: "", busy: false, error: null })
                                  }
                                  className={cn(
                                    "flex size-10 shrink-0 items-center justify-center rounded-xl border border-dashed border-border text-primary transition-colors hover:border-primary hover:bg-primary/10 disabled:opacity-40",
                                    isAddingHere && "border-primary bg-primary/10",
                                  )}
                                >
                                  <Plus className="size-4" />
                                </button>
                              </>
                            )}
                          </div>
                          {isAddingHere && adding && (
                            <div className="space-y-1.5 rounded-xl border border-border bg-muted/40 p-2.5">
                              <div className="flex items-center gap-2">
                                <input
                                  autoFocus
                                  value={adding.name}
                                  disabled={adding.busy}
                                  placeholder={lvl.placeholder}
                                  onChange={(e) => setAdding({ ...adding, name: e.target.value, error: null })}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      void createNode();
                                    }
                                  }}
                                  className={cn(fieldClass, "min-w-0 flex-1 py-2")}
                                />
                                <button
                                  type="button"
                                  disabled={adding.busy}
                                  onClick={() => void createNode()}
                                  className="shrink-0 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                                >
                                  {adding.busy ? "…" : "Создать"}
                                </button>
                                <button
                                  type="button"
                                  disabled={adding.busy}
                                  onClick={() => setAdding(null)}
                                  aria-label="Отмена"
                                  className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted"
                                >
                                  <X className="size-4" />
                                </button>
                              </div>
                              {adding.error && <p className="text-xs text-destructive">{adding.error}</p>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Пропущенные уровни можно оставить «— нет —»: позиция в справочнике сместится влево.
                    {!isCreate && " Выберите другое место — позиция переедет в эту ветку справочника."}
                  </p>
                </section>

                {isCreate ? (
                  /* Позиции: общий состав работ + по строке на лист справочника */
                  <section className="space-y-3">
                    <h3 className="text-sm font-bold">Позиции</h3>
                    <CompositionField
                      label="Состав работ — общий для всех позиций"
                      value={form.composition}
                      onChange={(v) => setField("composition", v)}
                    />
                    <div className="space-y-1 text-xs text-muted-foreground">
                      {groupName !== null ? (
                        <p>
                          Группа: <span className="font-semibold text-foreground">{groupName}</span>. Позиция = группа +
                          вариант
                        </p>
                      ) : (
                        <>
                          <p>Группа не выбрана — введите полное название каждой позиции</p>
                          {isAdmin && (
                            <p>
                              Чтобы создать несколько вариантов под общим названием, создайте группу через «+» рядом с
                              полем «Группа».
                            </p>
                          )}
                        </>
                      )}
                    </div>
                    <VariantList
                      group={groupName}
                      rows={form.variants}
                      rowErrors={rowErrors}
                      units={units}
                      neighbors={neighborUnits}
                      disabled={saving}
                      onChange={setVariant}
                      onAdd={addVariant}
                      onRemove={removeVariant}
                    />
                  </section>
                ) : (
                  <>
                    {/* Позиция */}
                    <section className="space-y-3">
                      <h3 className="text-sm font-bold">Позиция</h3>
                      <div className="grid gap-3 md:grid-cols-2">
                        {underGroup ? (
                          <label className="block space-y-1.5 md:col-span-2">
                            <span className={labelClass}>Вариант</span>
                            <AutoTextarea
                              singleLine
                              value={form.variants[0]!.text}
                              onChange={(e) => setVariant(0, { text: e.target.value })}
                              placeholder="Необязательно"
                            />
                            <span className="block text-xs text-muted-foreground">Название = группа + вариант</span>
                          </label>
                        ) : (
                          <label className="block space-y-1.5 md:col-span-2">
                            <span className={labelClass}>
                              Название <span className="text-destructive">*</span>
                            </span>
                            <AutoTextarea
                              singleLine
                              value={form.name}
                              onChange={(e) => setField("name", e.target.value)}
                            />
                          </label>
                        )}
                        <UnitField
                          value={form.variants[0]!.unit}
                          units={units}
                          neighbors={neighborUnits}
                          showChips={false}
                          onChange={(unit) => setVariant(0, { unit })}
                        />
                        <PriceField
                          price={form.variants[0]!.price}
                          hasPrice={form.variants[0]!.hasPrice}
                          onPriceChange={(price) => setVariant(0, { price })}
                          onHasPriceChange={(hasPrice) => setVariant(0, { hasPrice })}
                        />
                        <label className="block space-y-1.5">
                          <span className={labelClass}>Трудозатраты, чел.-ч</span>
                          <input
                            value={form.variants[0]!.laborHours}
                            onChange={(e) => setVariant(0, { laborHours: e.target.value })}
                            inputMode="decimal"
                            className={fieldClass}
                          />
                        </label>
                        <label className="block space-y-1.5">
                          <span className={labelClass}>Код ГЭСН</span>
                          <input
                            value={form.variants[0]!.gesnCode}
                            onChange={(e) => setVariant(0, { gesnCode: e.target.value })}
                            className={fieldClass}
                          />
                        </label>
                        {catalogTypeField}
                        {rowErrors[0] && (
                          <p role="alert" className="text-sm text-destructive md:col-span-2">
                            {rowErrors[0]}
                          </p>
                        )}
                      </div>
                    </section>

                    {/* Состав работ */}
                    <section className="space-y-3">
                      <h3 className="text-sm font-bold">Состав работ</h3>
                      <CompositionField value={form.composition} onChange={(v) => setField("composition", v)} />
                    </section>
                  </>
                )}

                {/* Материалы — пока только внешний вид, без запросов */}
                <section className="space-y-3">
                  <h3 className="text-sm font-bold">Материалы</h3>
                  <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                    Материалы пока не подключены
                  </div>
                  <button
                    type="button"
                    disabled
                    className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-semibold text-muted-foreground opacity-60"
                  >
                    <Plus className="size-4" />
                    Добавить материал
                  </button>
                </section>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-border px-6 py-4">
            {formError && (
              <p role="alert" className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-3">
              {savedName && (
                <p role="status" className="mr-auto min-w-0 truncate text-sm font-medium text-status-done">
                  Сохранено: {savedName}
                </p>
              )}
              <button
                type="button"
                onClick={requestClose}
                disabled={saving}
                className="rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                Закрыть
              </button>
              {isCreate && (
                <button
                  type="button"
                  onClick={() => void save(true)}
                  disabled={saving || !ready || Boolean(loadError)}
                  className="rounded-xl border border-primary bg-surface px-5 py-2.5 text-sm font-semibold text-primary disabled:opacity-60"
                >
                  Сохранить и добавить ещё
                </button>
              )}
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !ready || Boolean(loadError)}
                className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                {saving ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отменить изменения?</AlertDialogTitle>
            <AlertDialogDescription>
              Внесённые изменения не сохранены и будут потеряны.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Продолжить редактирование</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onClose}
            >
              Отменить изменения
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isAdmin && nodeAction?.kind === "rename" && (
        <NodeNameDialog
          key={`rename:${nodeAction.id}`}
          title={`Изменить: ${LOCATION_LEVELS[nodeAction.levelIdx]!.label.toLowerCase()}`}
          initialName={nodeAction.name}
          submitLabel="Сохранить"
          onClose={() => setNodeAction(null)}
          onSubmit={async (name) => {
            const { levelIdx, id } = nodeAction;
            await api.renameNode(id, name);
            const key = slotKey(levelIdx, selection);
            if (key) {
              setOptions((prev) => ({
                ...prev,
                [key]: (prev[key] ?? []).map((o) => (o.id === id ? { ...o, name } : o)),
              }));
            }
            setNodeAction(null);
            void onNodeRenamed?.(id, name, slotNodeParent(levelIdx, selection));
          }}
        />
      )}

      {isAdmin && nodeAction?.kind === "delete" && (
        <DeleteNodeDialog
          key={`delete:${nodeAction.id}`}
          node={{ id: nodeAction.id, name: nodeAction.name }}
          onClose={() => setNodeAction(null)}
          onDeleted={() => {
            const { levelIdx, id } = nodeAction;
            const key = slotKey(levelIdx, selection);
            const parentId = slotNodeParent(levelIdx, selection);
            // Удалён выбранный узел — снимаем выбор этого и нижних слотов; поля
            // самой позиции (название, цена, состав…) остаются как есть.
            changeSelection(levelIdx, null);
            if (key) {
              setOptions((prev) => ({ ...prev, [key]: (prev[key] ?? []).filter((o) => o.id !== id) }));
            }
            setNodeAction(null);
            void onNodeDeleted?.(id, parentId);
          }}
        />
      )}
    </>
  );
}

function describeLoadError(err: unknown): string {
  if (err instanceof ApiError && err.status === 404) return "Позиция не найдена — возможно, её уже удалили";
  if (err instanceof ApiError && err.status === 403) return "Недостаточно прав для просмотра позиции";
  return "Не удалось загрузить позицию";
}

function CompositionField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <div className="space-y-1.5">
      {label && <span className={labelClass}>{label}</span>}
      <AutoTextarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={7}
        placeholder="Что входит в работу — по одному пункту на строку"
        className="leading-relaxed"
      />
    </div>
  );
}
