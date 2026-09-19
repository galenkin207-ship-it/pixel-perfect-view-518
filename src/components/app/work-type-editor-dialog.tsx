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
import type {
  CatalogType,
  WorkTypeAncestor,
  WorkTypeDetail,
  WorkTypeLeafInput,
  WorkTypeSearchResult,
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
      // Тип каталога выбирается в самой форме (хозяин, у которого нет своей
      // вкладки каталога — экран заявок). Только при пустом расположении.
      chooseCatalogType?: boolean;
    };

export type WorkTypeEditorResult = {
  // Лист ДО правки (для старой цепочки предков и старого parent_id);
  // null при создании.
  before: WorkTypeDetail | null;
  after: WorkTypeDetail;
};

type Option = { id: string; name: string; gesnCode: string | null };

// Четыре уровня расположения: индекс в selection === level - 1.
const LOCATION_LEVELS = [
  { label: "Сборник", addTitle: "Добавить новый сборник", placeholder: "Название нового сборника" },
  { label: "Раздел", addTitle: "Добавить новый раздел", placeholder: "Название нового раздела" },
  { label: "Таблица", addTitle: "Добавить новую таблицу", placeholder: "Название новой таблицы" },
  { label: "Группа", addTitle: "Добавить новую группу", placeholder: "Название новой группы" },
];

const fieldClass =
  "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary disabled:opacity-60";
const labelClass = "label-caps";

type FormState = {
  name: string;
  variantLabel: string;
  unit: string;
  price: string;
  hasPrice: boolean;
  laborHours: string;
  gesnCode: string;
  composition: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  variantLabel: "",
  unit: "",
  price: "",
  hasPrice: true,
  laborHours: "",
  gesnCode: "",
  composition: "",
};

function formFromDetail(d: WorkTypeDetail): FormState {
  return {
    name: d.name,
    variantLabel: d.variant_label ?? "",
    unit: d.unit,
    price: String(d.price),
    hasPrice: d.has_price,
    laborHours: d.labor_hours == null ? "" : String(d.labor_hours),
    gesnCode: d.gesn_code ?? "",
    composition: d.work_composition ?? "",
  };
}

// Цепочка предков сопоставляется с селекторами по ПОРЯДКУ (i-й предок от
// корня — i-й селектор), а не по level: позиция может лежать прямо под
// сборником, разделом, таблицей или группой — недостающие нижние селекторы
// остаются пустыми («— нет —»).
function selectionFromAncestors(ancestors: WorkTypeAncestor[]): (string | null)[] {
  return LOCATION_LEVELS.map((_, i) => ancestors[i]?.id ?? null);
}

function parseNumber(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
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
  const canChooseType = isCreate && Boolean(target.chooseCatalogType) && target.ancestors.length === 0;
  const initialCreateForm: FormState = isCreate
    ? { ...EMPTY_FORM, name: target.prefill?.name ?? "", unit: target.prefill?.unit ?? "" }
    : EMPTY_FORM;
  const [detail, setDetail] = useState<WorkTypeDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialCreateForm);
  const [selection, setSelection] = useState<(string | null)[]>(() =>
    isCreate ? selectionFromAncestors(target.ancestors) : [null, null, null, null],
  );
  // Ключ — id родителя (или "root" для сборников), значение — уже известные
  // варианты выбора на этом уровне.
  const [options, setOptions] = useState<Record<string, Option[]>>({});
  const [ready, setReady] = useState(isCreate);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // «Сохранено: <название>» после «Сохранить и добавить ещё».
  const [savedName, setSavedName] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  // Снимок состояния на момент открытия — по нему считаем "есть несохранённые
  // изменения".
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(
    isCreate
      ? JSON.stringify({ form: initialCreateForm, selection: selectionFromAncestors(target.ancestors) })
      : null,
  );

  const catalogType: CatalogType | null =
    detail?.catalog_type ?? (isCreate ? createType : null);
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
        setInitialSnapshot(JSON.stringify({ form: f, selection: sel }));
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

  function parentKey(levelIdx: number, sel: (string | null)[]): string | null {
    return levelIdx === 0 ? "root" : (sel[levelIdx - 1] ?? null);
  }

  // Подгружаем варианты для каждого выбранного родителя: корневой список
  // сборников, затем детей выбранного сборника, раздела, таблицы.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    LOCATION_LEVELS.forEach((_, i) => {
      const key = parentKey(i, selection);
      if (!key) return;
      if (options[key]) return;
      const request =
        key === "root"
          ? catalogTypeRef.current
            ? api.getWorkTypeTree({ type: catalogTypeRef.current }, treeOpts)
            : Promise.resolve([])
          : api.getWorkTypeTree({ parentId: key }, treeOpts);
      request
        .then((nodes) => {
          if (cancelled) return;
          const fetched: Option[] = nodes
            .filter((n) => n.level < 5 && n.source !== "legacy_root")
            .map((n) => ({ id: n.id, name: n.name, gesnCode: n.gesn_code }));
          setOptions((prev) => {
            // Известный предок этого уровня, лежащий именно под этим
            // родителем, гарантированно остаётся в списке.
            const seededAncestor = knownAncestors[i];
            const seeded: Option[] =
              seededAncestor && key === (i === 0 ? "root" : ancestorSelection[i - 1])
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

  // Подсказка о дублях (только создание): по мере ввода названия ищем
  // похожие позиции существующим серверным поиском. Только информирует —
  // сохранение не блокирует (точное совпадение в том же родителе сервер
  // отклонит сам, 409 покажется в форме).
  const [similar, setSimilar] = useState<WorkTypeSearchResult[]>([]);
  useEffect(() => {
    if (!isCreate) return;
    const q = form.name.trim();
    if (q.length < 3) {
      setSimilar([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .searchWorkTypes(q, 5)
        .then((items) => {
          if (!cancelled) setSimilar(items.slice(0, 5));
        })
        .catch(() => {
          if (!cancelled) setSimilar([]);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isCreate, form.name]);

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

  const dirty =
    initialSnapshot !== null && JSON.stringify({ form, selection }) !== initialSnapshot;

  function requestClose() {
    if (saving) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFormError(null);
  }

  // Смена типа каталога в форме создания: выбранное расположение относилось к
  // другому каталогу — сбрасываем его, корневой список сборников перечитается.
  function changeCatalogType(next: CatalogType) {
    if (next === createType) return;
    setCreateType(next);
    setSelection([null, null, null, null]);
    setOptions({});
    setAdding(null);
    setFormError(null);
  }

  function changeSelection(levelIdx: number, id: string | null) {
    setSelection((prev) => prev.map((v, i) => (i < levelIdx ? v : i === levelIdx ? id : null)));
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
    const key = parentKey(levelIdx, selection);
    return (key ? options[key] : undefined)?.find((o) => o.id === id)?.name ?? "";
  }

  async function createNode() {
    if (!adding) return;
    const name = adding.name.trim();
    if (!name) {
      setAdding({ ...adding, error: "Введите название" });
      return;
    }
    const { levelIdx } = adding;
    const parentId = levelIdx === 0 ? null : (selection[levelIdx - 1] ?? null);
    if (levelIdx > 0 && !parentId) return;
    setAdding({ ...adding, busy: true, error: null });
    try {
      const node = await api.createWorkTypeNode({
        parentId,
        name,
        ...(parentId === null && catalogType ? { catalogType } : {}),
      });
      const key = parentId ?? "root";
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
    setSavedName(null);

    const name = form.name.trim();
    const unit = form.unit.trim();
    if (!name) return setFormError("Укажите название позиции");
    if (!unit) return setFormError("Укажите единицу измерения");

    const price = parseNumber(form.price);
    if (price !== null && (Number.isNaN(price) || price < 0)) {
      return setFormError("Цена должна быть неотрицательным числом");
    }
    const laborHours = parseNumber(form.laborHours);
    if (laborHours !== null && (Number.isNaN(laborHours) || laborHours < 0)) {
      return setFormError("Трудозатраты должны быть неотрицательным числом");
    }

    const deepest = [...selection].reverse().find((id) => id !== null) ?? null;
    const originalParent = detail?.parent_id ?? null;
    const locationChanged = isCreate || deepest !== originalParent;
    if (locationChanged && !deepest) {
      return setFormError("Выберите хотя бы сборник");
    }

    const input: WorkTypeLeafInput = {
      name,
      variant_label: form.variantLabel.trim() || null,
      unit,
      price: price ?? 0,
      has_price: form.hasPrice,
      labor_hours: laborHours,
      gesn_code: form.gesnCode.trim() || null,
      work_composition: form.composition.trim() ? form.composition : null,
    };

    setSaving(true);
    try {
      if (target.kind === "create") {
        const created = await api.createWorkType({ ...input, parent_id: deepest! });
        onSaved({ before: null, after: created }, { keepOpen: another });
        if (another) {
          // Расположение остаётся, поля очищаются, фокус — в название.
          setForm(EMPTY_FORM);
          setSimilar([]);
          setInitialSnapshot(JSON.stringify({ form: EMPTY_FORM, selection }));
          setSavedName(created.name);
          setSaving(false);
          setTimeout(() => nameInputRef.current?.focus(), 0);
        }
      } else {
        const saved = await api.editWorkType(target.id, {
          ...input,
          ...(locationChanged && deepest ? { parent_id: deepest } : {}),
        });
        onSaved({ before: detail, after: saved });
      }
    } catch (err) {
      setFormError(describeError(err));
      setSaving(false);
    }
  }

  const title = isCreate ? "Новая позиция" : "Редактирование позиции";

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && requestClose()}>
        <DialogContent
          className="flex h-[92dvh] max-h-[92dvh] w-[calc(100%-2rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0"
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
                  <h3 className="text-sm font-bold">Расположение в справочнике</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    {LOCATION_LEVELS.map((lvl, i) => {
                      const key = parentKey(i, selection);
                      const opts = key ? (options[key] ?? []) : [];
                      const parentMissing = i > 0 && !selection[i - 1];
                      const isAddingHere = isAdmin && adding?.levelIdx === i;
                      return (
                        <div key={lvl.label} className="space-y-1.5">
                          <span className={labelClass}>{lvl.label}</span>
                          <div className="flex items-center gap-2">
                            <select
                              value={selection[i] ?? ""}
                              disabled={parentMissing || saving}
                              onChange={(e) => changeSelection(i, e.target.value || null)}
                              className={cn(fieldClass, "min-w-0 flex-1")}
                            >
                              {/* Верхний уровень (сборник) обязателен. Ниже позиция может
                                  лежать прямо под выбранным узлом — «— нет —» это
                                  осознанный выбор, а не пустое значение. Селектор
                                  заблокирован только пока не выбран предыдущий уровень. */}
                              {i === 0 ? (
                                <option value="" disabled>
                                  Выберите…
                                </option>
                              ) : (
                                <option value="" disabled={parentMissing}>
                                  {parentMissing && !selection[0]
                                    ? `Сначала выберите ${LOCATION_LEVELS[i - 1]!.label.toLowerCase()}`
                                    : "— нет —"}
                                </option>
                              )}
                              {opts.map((o) => (
                                <option key={o.id} value={o.id}>
                                  {i === 0 && formatGesnNumberLabel(o.gesnCode)
                                    ? `${formatGesnNumberLabel(o.gesnCode)} ${o.name}`
                                    : o.name}
                                </option>
                              ))}
                            </select>
                            {isAdmin && selection[i] && (
                              <>
                                <button
                                  type="button"
                                  title={`Переименовать: ${lvl.label.toLowerCase()}`}
                                  aria-label={`Переименовать: ${lvl.label.toLowerCase()}`}
                                  disabled={saving}
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
                                  disabled={saving}
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
                              </>
                            )}
                            {isAdmin && (
                              <button
                                type="button"
                                title={lvl.addTitle}
                                aria-label={lvl.addTitle}
                                disabled={parentMissing || saving}
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
                    Позиция может лежать прямо в сборнике, разделе, таблице или группе: нижние уровни можно оставить
                    «— нет —».{" "}
                    {isCreate
                      ? "Обязательно выберите хотя бы сборник."
                      : "Выберите другое место — позиция переедет в эту ветку справочника."}
                  </p>
                </section>

                {/* Позиция */}
                <section className="space-y-3">
                  <h3 className="text-sm font-bold">Позиция</h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block space-y-1.5 md:col-span-2">
                      <span className={labelClass}>
                        Название <span className="text-destructive">*</span>
                      </span>
                      <input
                        ref={nameInputRef}
                        value={form.name}
                        onChange={(e) => setField("name", e.target.value)}
                        className={fieldClass}
                      />
                      {isCreate && similar.length > 0 && (
                        <div className="space-y-1.5 rounded-xl border border-border bg-muted/40 p-2.5">
                          <p className="text-xs font-semibold text-muted-foreground">Уже есть в справочнике</p>
                          <ul className="space-y-1.5">
                            {similar.map((item) => (
                              <li key={item.id} className="text-sm leading-snug">
                                <span className="font-medium break-words">
                                  {item.variant_label ? `${item.name} — ${item.variant_label}` : item.name}
                                </span>
                                <span className="ml-1.5 text-xs text-muted-foreground">{item.unit}</span>
                                {item.breadcrumb.length > 0 && (
                                  <span className="block text-xs break-words text-muted-foreground">
                                    {item.breadcrumb.join(" › ")}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </label>
                    <label className="block space-y-1.5 md:col-span-2">
                      <span className={labelClass}>Вариант</span>
                      <input
                        value={form.variantLabel}
                        onChange={(e) => setField("variantLabel", e.target.value)}
                        placeholder="Подпись варианта на карточке (необязательно)"
                        className={fieldClass}
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className={labelClass}>
                        Ед. изм. <span className="text-destructive">*</span>
                      </span>
                      <select
                        value={form.unit}
                        onChange={(e) => setField("unit", e.target.value)}
                        className={fieldClass}
                      >
                        <option value="" disabled>
                          Выберите ед. изм.
                        </option>
                        {/* Единица, которой нет в справочнике (ГЭСН-единицы вроде
                            «100 м2»), всё равно показывается выбранной. */}
                        {(form.unit && !units.includes(form.unit) ? [form.unit, ...units] : units).map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                      {isCreate && (
                        <UnitChips
                          neighbors={neighborUnits}
                          common={units}
                          current={form.unit}
                          onPick={(u) => setField("unit", u)}
                        />
                      )}
                    </label>
                    <div className="space-y-1.5">
                      <span className={labelClass}>Цена, руб./ед.</span>
                      <div className="flex items-center gap-3">
                        <input
                          value={form.price}
                          onChange={(e) => setField("price", e.target.value)}
                          inputMode="decimal"
                          disabled={!form.hasPrice}
                          className={cn(fieldClass, "min-w-0 flex-1")}
                        />
                        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={form.hasPrice}
                            onChange={(e) => setField("hasPrice", e.target.checked)}
                            className="size-4 accent-primary"
                          />
                          Цена указана
                        </label>
                      </div>
                    </div>
                    <label className="block space-y-1.5">
                      <span className={labelClass}>Трудозатраты, чел.-ч</span>
                      <input
                        value={form.laborHours}
                        onChange={(e) => setField("laborHours", e.target.value)}
                        inputMode="decimal"
                        className={fieldClass}
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className={labelClass}>Код ГЭСН</span>
                      <input
                        value={form.gesnCode}
                        onChange={(e) => setField("gesnCode", e.target.value)}
                        className={fieldClass}
                      />
                    </label>
                    <div className="space-y-1.5">
                      <span className={labelClass}>Тип каталога</span>
                      {canChooseType ? (
                        <select
                          value={createType}
                          disabled={saving}
                          onChange={(e) => changeCatalogType(e.target.value as CatalogType)}
                          className={fieldClass}
                        >
                          <option value="новое строительство">Строительство</option>
                          <option value="ремонт">Ремонт</option>
                        </select>
                      ) : (
                        <div className={cn(fieldClass, "bg-muted/50 text-muted-foreground")}>
                          {catalogType === "ремонт" ? "Ремонт" : "Строительство"}
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {/* Состав работ */}
                <section className="space-y-3">
                  <h3 className="text-sm font-bold">Состав работ</h3>
                  <textarea
                    value={form.composition}
                    onChange={(e) => setField("composition", e.target.value)}
                    rows={7}
                    placeholder="Что входит в работу — по одному пункту на строку"
                    className={cn(fieldClass, "resize-y leading-relaxed")}
                  />
                </section>

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
            <div className="flex items-center justify-end gap-3">
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
            const key = parentKey(levelIdx, selection);
            if (key) {
              setOptions((prev) => ({
                ...prev,
                [key]: (prev[key] ?? []).map((o) => (o.id === id ? { ...o, name } : o)),
              }));
            }
            setNodeAction(null);
            void onNodeRenamed?.(id, name, key === "root" ? null : key);
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
            const key = parentKey(levelIdx, selection);
            if (key) {
              setOptions((prev) => ({ ...prev, [key]: (prev[key] ?? []).filter((o) => o.id !== id) }));
            }
            // Удалён выбранный узел — снимаем выбор этого и нижних уровней; поля
            // самой позиции (название, цена, состав…) остаются как есть.
            changeSelection(levelIdx, null);
            setNodeAction(null);
            void onNodeDeleted?.(id, key === "root" ? null : key);
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

// Быстрый выбор единицы: как у соседних позиций выбранного родителя и общие
// единицы справочника (без повторов). Полный список — в селекте выше.
function UnitChips({
  neighbors,
  common,
  current,
  onPick,
}: {
  neighbors: string[];
  common: string[];
  current: string;
  onPick: (unit: string) => void;
}) {
  const commonShort = common.filter((u) => !neighbors.includes(u)).slice(0, 6);
  if (neighbors.length === 0 && commonShort.length === 0) return null;
  const chip = (u: string) => (
    <button
      key={u}
      type="button"
      onClick={() => onPick(u)}
      className={cn(
        "rounded-lg border px-2 py-1 text-xs font-semibold transition-colors",
        u === current
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-surface text-muted-foreground hover:border-primary/50 hover:text-foreground",
      )}
    >
      {u}
    </button>
  );
  return (
    <div className="space-y-1 pt-0.5">
      {neighbors.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Как у соседних:</span>
          {neighbors.map(chip)}
        </div>
      )}
      {commonShort.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Общие:</span>
          {commonShort.map(chip)}
        </div>
      )}
    </div>
  );
}
