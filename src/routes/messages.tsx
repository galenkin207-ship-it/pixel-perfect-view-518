import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronDown, ListTree, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app/app-shell";
import { FieldLabel, PageHeading } from "@/components/app/bits";
import { WorkTypePicker } from "@/components/app/record-form";
import { RequestAddToRecordDialog } from "@/components/app/request-add-to-record-dialog";
import type { WorkTypeEditorTarget } from "@/components/app/work-type-editor-dialog";
import {
  usePreloadWorkTypeEditorDialog,
  WorkTypeEditorDialog,
} from "@/components/app/work-type-editor-dialog-lazy";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { roleLabels, type WorkRequest } from "@/data/mock";
import { useApp } from "@/state/use-app";
import { notificationIdsForRequest } from "@/lib/notification-items";
import { buildWorkTypePathChain } from "@/lib/work-type-format";
import { ApiError } from "@/lib/api-client";

type MessagesSearch = { request?: string | undefined; from?: "notifications" | undefined };

export const Route = createFileRoute("/messages")({
  validateSearch: (search: Record<string, unknown>): MessagesSearch => ({
    request: typeof search["request"] === "string" ? (search["request"] as string) : undefined,
    from: search["from"] === "notifications" ? "notifications" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Переписка и заявки — Учёт работ" },
      {
        name: "description",
        content:
          "Заявки прорабов на новые виды работ и переписка с администратором по каждой заявке.",
      },
      { property: "og:title", content: "Переписка и заявки — Учёт работ" },
      { property: "og:description", content: "Согласование расценок и новых видов работ." },
    ],
  }),
  component: MessagesPage,
});

// approved — «Выполнена»: заявка закрыта позицией справочника (work_type), а
// у старых заявок (до миграции 031) — без позиции, просто одобрена.
const statusText: Record<WorkRequest["status"], string> = {
  pending: "На рассмотрении",
  approved: "Выполнена",
  rejected: "Отклонена",
  deleted: "Удалена автором",
};

// Решение по заявке (выполнена/отклонена) — id уведомления для автора, см.
// buildNotificationItems.
function decisionNotificationId(r: WorkRequest): string | null {
  if (r.status === "approved") return `${r.id}-approved`;
  if (r.status === "rejected") return `${r.id}-rejected`;
  return null;
}

function autoResizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

function MessagesPage() {
  const {
    requests,
    role,
    currentUser,
    decideRequest,
    completeRequest,
    deleteRequest,
    addRequestComment,
    editRequestComment,
    deleteRequestComment,
    markNotificationsRead,
    readNotificationIds,
    workTypes,
  } = useApp();
  const { request: focusId, from } = Route.useSearch();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const isAdmin = role === "admin";
  const isForeman = role === "user";
  // Решение по заявке (выполнить позицией справочника / отклонить) — admin и
  // curator, как и на бэкенде (PUT /requests/:id, POST /requests/:id/complete).
  const canDecide = isAdmin || role === "curator";
  // «Создать позицию» — только десктоп (форма — большая модалка каскадного
  // справочника). «Выбрать из справочника» — и на телефоне.
  const canCreatePosition = canDecide && !isMobile;
  const [createTarget, setCreateTarget] = useState<{
    request: WorkRequest;
    editor: WorkTypeEditorTarget;
  } | null>(null);
  usePreloadWorkTypeEditorDialog(canCreatePosition);
  // Заявка, для которой открыт каскадный выбор позиции.
  const [linkTarget, setLinkTarget] = useState<WorkRequest | null>(null);
  const counterValuesRef = useRef(new Map<string, Record<string, number>>());
  // Мастер: «Внести в запись» по выполненной заявке.
  const [addTarget, setAddTarget] = useState<WorkRequest | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  // Свёрнутость блока переписки по каждой заявке в общем списке. По
  // умолчанию свёрнуто — разворачивается по тапу.
  const [expandedChats, setExpandedChats] = useState<Record<string, boolean>>({});
  // Свёрнутость переписки внутри диалога заявки — отдельное состояние, не
  // общее со списком (иначе тап по стрелке в диалоге незаметно переключал бы
  // ту же карточку в фоновом списке вместо самого диалога). По умолчанию
  // развёрнуто, сбрасывается в развёрнутое при открытии диалога — см. эффект
  // ниже.
  const [dialogChatExpanded, setDialogChatExpanded] = useState(true);
  // Разворачивание переписки прямо в списке (не через диалог из уведомлений)
  // считается тем, что пользователь посмотрел заявку целиком — помечаем
  // прочитанным сразу всё, что с ней связано (саму заявку, решение по ней и
  // сообщения переписки), а не только сообщения.
  const toggleChat = (r: WorkRequest, inDialog: boolean) => {
    if (inDialog) {
      setDialogChatExpanded((v) => !v);
      return;
    }
    const willExpand = !(expandedChats[r.id] ?? false);
    setExpandedChats((s) => ({ ...s, [r.id]: willExpand }));
    if (willExpand) markNotificationsRead(notificationIdsForRequest(r));
  };

  // Реальные DOM-ссылки на textarea сообщений — нужны, чтобы схлопнуть поле
  // обратно после отправки (когда текст очищается программно, а не вводом).
  const commentRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  const visible = isForeman
    ? requests.filter((r) =>
        r.author_user_id != null
          ? r.author_user_id === currentUser.id
          : r.author === currentUser.full_name,
      )
    : requests;
  const pending = visible.filter((r) => r.status === "pending");
  const history = visible.filter((r) => r.status !== "pending");

  // Мастер открыл раздел заявок — решения по его заявкам (выполнена/отклонена)
  // считаются просмотренными: бейдж на вкладке гаснет. Какие были новыми на
  // момент открытия — запоминаем, чтобы пометить карточки «Новое».
  const [freshDecisionIds] = useState(
    () =>
      new Set(
        isForeman
          ? visible
              .map(decisionNotificationId)
              .filter((id): id is string => id != null && !readNotificationIds.has(id))
          : [],
      ),
  );
  const unreadDecisionIds = isForeman
    ? visible
        .map(decisionNotificationId)
        .filter((id): id is string => id != null && !readNotificationIds.has(id))
    : [];
  const unreadDecisionKey = unreadDecisionIds.join(",");
  useEffect(() => {
    if (unreadDecisionKey) markNotificationsRead(unreadDecisionKey.split(","));
  }, [unreadDecisionKey, markNotificationsRead]);

  const [exportingPending, setExportingPending] = useState(false);

  const exportPendingToExcel = async () => {
    if (pending.length === 0) {
      toast.error("Нет заявок на рассмотрении");
      return;
    }
    setExportingPending(true);
    try {
      const NAVY = "FF2E4A6B";
      const ORANGE = "FFE0611C";
      const GRAY_TXT = "FF6B665E";
      const LIGHT_BEIGE = "FFF2EFE7";
      const WHITE = "FFFFFFFF";
      const DARK_TXT = "FF1F2933";
      const BORDER_CLR = "FFD8D1C2";

      const fill = (argb: string) => ({
        type: "pattern" as const,
        pattern: "solid" as const,
        fgColor: { argb },
      });
      const border = {
        top: { style: "thin" as const, color: { argb: BORDER_CLR } },
        bottom: { style: "thin" as const, color: { argb: BORDER_CLR } },
        left: { style: "thin" as const, color: { argb: BORDER_CLR } },
        right: { style: "thin" as const, color: { argb: BORDER_CLR } },
      };

      // ExcelJS тяжёлый (~250 kB gzip) — грузим только в момент экспорта.
      const { default: ExcelJS } = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      wb.creator = "Учёт работ";
      wb.created = new Date();

      const sheet = wb.addWorksheet("Заявки", {
        views: [{ state: "frozen", ySplit: 4 }],
      });
      sheet.columns = [{ width: 40 }, { width: 22 }, { width: 16 }];

      const titleRow = sheet.addRow(["ЗАЯВКИ НА РАССМОТРЕНИИ"]);
      sheet.mergeCells(titleRow.number, 1, titleRow.number, 3);
      titleRow.height = 24;
      titleRow.getCell(1).font = { size: 14, bold: true, color: { argb: WHITE } };
      titleRow.getCell(1).fill = fill(ORANGE);
      titleRow.getCell(1).alignment = { vertical: "middle" };

      const subRow = sheet.addRow([`Всего: ${pending.length}`]);
      sheet.mergeCells(subRow.number, 1, subRow.number, 3);
      subRow.getCell(1).font = { italic: true, color: { argb: GRAY_TXT } };

      sheet.addRow([]);

      const headRow = sheet.addRow(["Название", "Подал", "Дата подачи"]);
      headRow.height = 20;
      headRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: WHITE } };
        cell.fill = fill(NAVY);
        cell.alignment = { vertical: "middle", wrapText: true };
      });

      pending.forEach((r, idx) => {
        const row = sheet.addRow([r.requested_text, r.author, r.created_at]);
        row.eachCell((cell) => {
          cell.font = { color: { argb: DARK_TXT } };
          cell.fill = fill(idx % 2 === 0 ? WHITE : LIGHT_BEIGE);
          cell.border = border;
        });
      });

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const today = new Date().toISOString().slice(0, 10);
      a.download = `Заявки_на_рассмотрении_${today}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Не удалось сформировать файл, попробуйте ещё раз");
    } finally {
      setExportingPending(false);
    }
  };

  // Заявка, открытая из уведомления — показываем её отдельным окном поверх
  // списка (акцентированный переход), а не просто подсветкой карточки в
  // общем списке. Открытие автоматически помечает прочитанным всё, что
  // относится к этой заявке (саму заявку и все сообщения переписки).
  const dialogRequest = focusId ? visible.find((r) => r.id === focusId) : undefined;
  const closeDialog = () =>
    void navigate(
      from === "notifications"
        ? { to: "/notifications" }
        : { to: "/messages", search: { request: undefined } },
    );

  useEffect(() => {
    if (!dialogRequest) return;
    markNotificationsRead(notificationIdsForRequest(dialogRequest));
    setDialogChatExpanded(true);
  }, [dialogRequest, markNotificationsRead]);

  // Сообщение появляется в переписке сразу (оптимистично, см. addRequestComment),
  // поле ввода не блокируется — можно сразу писать следующее, клавиатура на
  // телефоне не прячется.
  const sendComment = async (id: string) => {
    const text = (draft[id] ?? "").trim();
    if (!text) return;
    setDraft((d) => ({ ...d, [id]: "" }));
    requestAnimationFrame(() => autoResizeTextarea(commentRefs.current[id] ?? null));
    try {
      await addRequestComment(id, text);
    } catch {
      // Возвращаем текст в поле, не затирая то, что пользователь успел
      // набрать после отправки.
      setDraft((d) => {
        const current = (d[id] ?? "").trim();
        return { ...d, [id]: current ? `${text}\n${current}` : text };
      });
      requestAnimationFrame(() => autoResizeTextarea(commentRefs.current[id] ?? null));
      toast.error("Не удалось отправить сообщение, попробуйте ещё раз");
    }
  };

  // Редактирование собственного сообщения в переписке — как в Телеграме:
  // один и тот же textarea на всю страницу переиспользуется под сообщение,
  // которое сейчас открыто на редактирование (editingCommentId).
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [savingCommentEdit, setSavingCommentEdit] = useState(false);

  const startCommentEdit = (commentId: string, text: string) => {
    setEditingCommentId(commentId);
    setEditText(text);
  };

  const cancelCommentEdit = () => {
    setEditingCommentId(null);
    setEditText("");
  };

  const saveCommentEdit = async (requestId: string, commentId: string) => {
    const text = editText.trim();
    if (!text) return;
    setSavingCommentEdit(true);
    try {
      await editRequestComment(requestId, commentId, text);
      cancelCommentEdit();
    } catch {
      toast.error("Не удалось изменить сообщение, попробуйте ещё раз");
    } finally {
      setSavingCommentEdit(false);
    }
  };

  // Удаление сообщения — "удаляется у всех", подтверждаем действие, т.к. оно
  // необратимо.
  const [deleteCommentTarget, setDeleteCommentTarget] = useState<{
    requestId: string;
    commentId: string;
  } | null>(null);
  const [deletingComment, setDeletingComment] = useState(false);

  const confirmDeleteComment = async () => {
    if (!deleteCommentTarget) return;
    setDeletingComment(true);
    try {
      await deleteRequestComment(deleteCommentTarget.requestId, deleteCommentTarget.commentId);
      if (editingCommentId === deleteCommentTarget.commentId) cancelCommentEdit();
      setDeleteCommentTarget(null);
    } catch {
      toast.error("Не удалось удалить сообщение, попробуйте ещё раз");
    } finally {
      setDeletingComment(false);
    }
  };

  const [deciding, setDeciding] = useState<string | null>(null);

  // Отклонение — через окно с необязательным комментарием мастеру
  // (requests.reject_reason).
  const [rejectTarget, setRejectTarget] = useState<WorkRequest | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const rejectCommentRef = useRef<HTMLTextAreaElement | null>(null);

  const openReject = (r: WorkRequest) => {
    setRejectComment("");
    setRejectTarget(r);
  };

  const reject = async () => {
    if (!rejectTarget) return;
    const comment = rejectComment.trim();
    setDeciding(rejectTarget.id);
    try {
      await decideRequest(rejectTarget.id, {
        status: "rejected",
        ...(comment ? { reject_reason: comment } : {}),
      });
      setRejectTarget(null);
      toast.success("Заявка отклонена");
    } catch {
      toast.error("Не удалось сохранить решение, попробуйте ещё раз");
    } finally {
      setDeciding(null);
    }
  };

  // Выбор существующей позиции из справочника — заявка сразу закрывается со
  // ссылкой на неё.
  const completeWithExisting = async (r: WorkRequest, workTypeId: string) => {
    setDeciding(r.id);
    try {
      const saved = await completeRequest(r.id, { work_type_id: workTypeId });
      toast.success(`Заявка выполнена: ${saved.work_type?.name ?? "позиция привязана"}`);
    } catch (err) {
      toast.error(
        err instanceof ApiError && (err.status === 400 || err.status === 409)
          ? err.message
          : "Не удалось закрыть заявку, попробуйте ещё раз",
      );
    } finally {
      setDeciding(null);
    }
  };

  const [deletingSelected, setDeletingSelected] = useState(false);

  const deleteSelected = async () => {
    setDeletingSelected(true);
    try {
      const results = await Promise.allSettled(selected.map((id) => deleteRequest(id)));
      const failed = results.filter((r) => r.status === "rejected").length;
      setSelected([]);
      if (failed > 0) {
        toast.error(
          failed === results.length
            ? "Не удалось удалить заявки"
            : `Удалены не все заявки (${failed} не удалось)`,
        );
      } else {
        toast.success(selected.length > 1 ? "Заявки удалены" : "Заявка удалена");
      }
    } finally {
      setDeletingSelected(false);
    }
  };

  const renderCard = (r: WorkRequest, section: "pending" | "history", inDialog = false) => {
    const canSelect = isForeman || (isAdmin && section === "history");
    return (
      <div
        key={r.id}
        {...(inDialog ? {} : { id: `request-${r.id}` })}
        className="rounded-2xl border border-border bg-card p-4 md:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            {canSelect && (
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.includes(r.id)}
                onChange={(e) =>
                  setSelected((prev) =>
                    e.target.checked ? [...prev, r.id] : prev.filter((s) => s !== r.id),
                  )
                }
              />
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Запрошено автором
              </p>
              <p className="font-semibold md:text-lg">{r.requested_text}</p>
              <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
                {r.author} · {r.created_at}
              </p>
            </div>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] uppercase",
              r.status === "approved" && "bg-status-done-soft text-status-done",
              r.status === "pending" && "bg-status-review-soft text-status-review",
              r.status === "rejected" && "bg-status-rejected-soft text-status-rejected",
              r.status === "deleted" && "bg-muted text-muted-foreground",
            )}
          >
            {statusText[r.status]}
          </span>
        </div>
        {(() => {
          const decisionId = decisionNotificationId(r);
          return decisionId && freshDecisionIds.has(decisionId) ? (
            <p className="mt-1 text-[10px] font-semibold tracking-[0.08em] text-primary uppercase">
              Новое
            </p>
          ) : null;
        })()}

        {r.status === "deleted" && (
          <div className="mt-2 rounded-xl bg-muted px-3 py-2">
            <p className="text-sm text-muted-foreground">
              Автор ({r.author}) удалил(а) эту заявку.
            </p>
          </div>
        )}

        {r.status === "approved" && r.resolved_name && (
          // Заявки, одобренные до перехода на «сообщение мастеру».
          <div className="mt-2 rounded-xl bg-status-done-soft px-3 py-2 md:px-4 md:py-3">
            <p className="text-[10px] font-semibold tracking-[0.08em] text-status-done uppercase">
              Одобрено как
            </p>
            <p className="mt-0.5 text-sm font-semibold md:text-base">{r.resolved_name}</p>
            <p className="text-xs text-muted-foreground md:text-sm">
              {r.resolved_unit}
              {isAdmin && r.resolved_price != null
                ? ` · ${r.resolved_price.toLocaleString("ru-RU")} ₽`
                : ""}
            </p>
          </div>
        )}

        {r.status === "approved" && r.work_type && (
          <div className="mt-2 rounded-xl bg-status-done-soft px-3 py-2 md:px-4 md:py-3">
            <p className="text-[10px] font-semibold tracking-[0.08em] text-status-done uppercase">
              Позиция в справочнике
            </p>
            {r.work_type.available ? (
              <>
                <p className="mt-0.5 text-sm font-semibold break-words md:text-base">
                  {r.work_type.name}
                </p>
                {buildWorkTypePathChain(r.work_type) && (
                  <p className="mt-0.5 text-xs break-words text-muted-foreground md:text-sm">
                    {buildWorkTypePathChain(r.work_type)}
                  </p>
                )}
                {isForeman && (
                  <button
                    type="button"
                    onClick={() => {
                      markNotificationsRead(notificationIdsForRequest(r));
                      setAddTarget(r);
                    }}
                    className="mt-2 flex items-center gap-1.5 rounded-lg bg-status-done px-3 py-2 text-sm font-semibold text-white"
                  >
                    <Plus className="size-4" />
                    Внести в запись
                  </button>
                )}
              </>
            ) : (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {isForeman
                  ? "Позиция недоступна, обратитесь к администратору"
                  : `Позиция в архиве: ${r.work_type.name}`}
              </p>
            )}
          </div>
        )}

        {r.status === "rejected" && r.reject_reason?.trim() && (
          <div className="mt-2 rounded-xl bg-status-rejected-soft px-3 py-2 md:px-4 md:py-3">
            <p className="text-[10px] font-semibold tracking-[0.08em] text-status-rejected uppercase">
              Комментарий
            </p>
            <p className="mt-0.5 text-sm break-words whitespace-pre-wrap select-text md:text-base">
              {r.reject_reason}
            </p>
          </div>
        )}

        {r.status === "approved" && r.response_message?.trim() && (
          <div className="mt-2 rounded-xl bg-status-done-soft px-3 py-2 md:px-4 md:py-3">
            <p className="text-[10px] font-semibold tracking-[0.08em] text-status-done uppercase">
              Комментарий
            </p>
            <p className="mt-0.5 text-sm break-words whitespace-pre-wrap select-text md:text-base">
              {r.response_message}
            </p>
          </div>
        )}

        {(() => {
          const canComment = role !== "curator" && r.status !== "deleted";
          const chatExpanded = inDialog ? dialogChatExpanded : !!expandedChats[r.id];
          return (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => toggleChat(r, inDialog)}
                className="flex w-full items-center justify-between gap-2 rounded-lg py-1 text-left text-xs font-semibold tracking-[0.02em] text-muted-foreground"
              >
                <span>Переписка{r.comments.length > 0 ? ` · ${r.comments.length}` : ""}</span>
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 transition-transform",
                    chatExpanded && "rotate-180",
                  )}
                />
              </button>

              {chatExpanded && (
                <>
                  <div className="mt-2 space-y-2">
                    {r.comments.map((c) => {
                      const own =
                        c.author_user_id != null
                          ? c.author_user_id === currentUser.id
                          : c.author === currentUser.full_name;
                      const isEditing = editingCommentId === c.id;
                      return (
                        <div
                          key={c.id}
                          className={cn("flex items-end gap-1", own ? "justify-end" : "justify-start")}
                        >
                          <span
                            className={cn(
                              "max-w-[80%] rounded-2xl px-3 py-2 text-sm transition-opacity duration-150",
                              own ? "bg-primary text-primary-foreground" : "bg-surface",
                              isEditing && "w-full max-w-[80%]",
                              c.pending && "opacity-70",
                            )}
                          >
                            {isEditing ? (
                              <div className="flex flex-col gap-2">
                                <textarea
                                  autoFocus
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  onFocus={(e) => autoResizeTextarea(e.target)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                      e.preventDefault();
                                      void saveCommentEdit(r.id, c.id);
                                    } else if (e.key === "Escape") {
                                      cancelCommentEdit();
                                    }
                                  }}
                                  rows={1}
                                  className="min-w-40 max-h-40 w-full resize-none overflow-y-auto rounded-lg border border-primary-foreground/30 bg-background px-2 py-1 text-sm leading-normal text-foreground"
                                  ref={(el) => autoResizeTextarea(el)}
                                />
                                <div className="flex justify-end gap-3 text-xs font-semibold">
                                  <button
                                    type="button"
                                    onClick={cancelCommentEdit}
                                    disabled={savingCommentEdit}
                                    className={cn(
                                      own ? "text-primary-foreground/80" : "text-muted-foreground",
                                      "disabled:opacity-60",
                                    )}
                                  >
                                    Отмена
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void saveCommentEdit(r.id, c.id)}
                                    disabled={!editText.trim() || savingCommentEdit}
                                    className={cn(
                                      own ? "text-primary-foreground" : "text-primary",
                                      "disabled:opacity-60",
                                    )}
                                  >
                                    {savingCommentEdit ? "Сохранение..." : "Сохранить"}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                {c.text}
                                <span
                                  className={cn(
                                    "mt-1 block text-[10px]",
                                    own ? "text-primary-foreground/70" : "text-muted-foreground",
                                  )}
                                >
                                  {c.author} · {c.pending ? "отправляется…" : c.time}
                                  {c.edited ? " · изменено" : ""}
                                </span>
                              </>
                            )}
                          </span>

                          {own && !isEditing && !c.pending && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  aria-label="Действия с сообщением"
                                  className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors duration-150 ease-out hover:bg-surface"
                                >
                                  <MoreVertical className="size-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => startCommentEdit(c.id, c.text)}>
                                  <Pencil className="mr-2 size-4" />
                                  Редактировать
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    setDeleteCommentTarget({ requestId: r.id, commentId: c.id })
                                  }
                                  className="text-status-rejected focus:text-status-rejected"
                                >
                                  <Trash2 className="mr-2 size-4" />
                                  Удалить
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {canComment && (
                    <div className="mt-3 flex items-end gap-2">
                      <textarea
                        ref={(el) => {
                          commentRefs.current[r.id] = el;
                          autoResizeTextarea(el);
                        }}
                        value={draft[r.id] ?? ""}
                        onChange={(e) => {
                          setDraft((d) => ({ ...d, [r.id]: e.target.value }));
                          autoResizeTextarea(e.target);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void sendComment(r.id);
                          }
                        }}
                        placeholder="Сообщение..."
                        rows={1}
                        className="max-h-40 min-h-10 flex-1 resize-none overflow-y-auto rounded-xl border border-border bg-surface px-3 py-2 text-sm leading-normal disabled:opacity-60"
                      />
                      <button
                        onClick={() => void sendComment(r.id)}
                        disabled={!(draft[r.id] ?? "").trim()}
                        className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                      >
                        Отправить
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}

        {canDecide && r.status === "pending" && (
          <div className="mt-3 flex flex-wrap gap-2 rounded-xl bg-surface p-3">
            <button
              onClick={() => setLinkTarget(r)}
              disabled={deciding === r.id}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-status-done px-3 py-2 text-sm font-semibold whitespace-nowrap text-white disabled:opacity-60"
            >
              <ListTree className="size-4" />
              Выбрать из справочника
            </button>
            {canCreatePosition && (
              <button
                onClick={() =>
                  // В заявке — только свободный текст (единицы в ней нет):
                  // название берём из текста заявки.
                  setCreateTarget({
                    request: r,
                    editor: {
                      kind: "create",
                      catalogType: "новое строительство",
                      ancestors: [],
                      prefill: { name: r.requested_text.trim(), unit: "" },
                    },
                  })
                }
                disabled={deciding === r.id}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-status-done px-3 py-2 text-sm font-semibold whitespace-nowrap text-status-done disabled:opacity-60"
              >
                <Plus className="size-4" />
                Создать позицию
              </button>
            )}
            <button
              onClick={() => openReject(r)}
              disabled={deciding === r.id}
              className="flex-1 rounded-lg bg-status-rejected px-3 py-2 text-sm font-semibold whitespace-nowrap text-white disabled:opacity-60"
            >
              {deciding === r.id ? "Сохранение..." : "Отклонить"}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <AppShell>
      {createTarget && (
        <WorkTypeEditorDialog
          key="catalog-from-request"
          target={createTarget.editor}
          onClose={() => setCreateTarget(null)}
          onSaved={() => setCreateTarget(null)}
          // Позиция создаётся вместе с закрытием заявки — одной транзакцией
          // на сервере (POST /requests/:id/complete). Ошибку показывает форма.
          submitCreate={async ({ parent_id, work_composition, item }) => {
            const saved = await completeRequest(createTarget.request.id, {
              new_work_type: { ...item, parent_id, work_composition },
            });
            setCreateTarget(null);
            toast.success(`Заявка выполнена: ${saved.work_type?.name ?? "позиция создана"}`);
          }}
        />
      )}
      {linkTarget && (
        <WorkTypePicker
          title="Позиция для заявки"
          linkMode
          isAdminLike
          types={workTypes}
          counterValuesRef={counterValuesRef}
          onClose={() => setLinkTarget(null)}
          onPick={(item) => {
            const target = linkTarget;
            setLinkTarget(null);
            if (item.work_type_id) void completeWithExisting(target, item.work_type_id);
          }}
        />
      )}
      {addTarget?.work_type && (
        <RequestAddToRecordDialog
          workType={addTarget.work_type}
          recordId={addTarget.record_id}
          onClose={() => setAddTarget(null)}
        />
      )}
      <PageHeading
        context={roleLabels[role]}
        title={isForeman ? "Моя переписка" : "Заявки на согласование"}
      />

      {(isForeman || isAdmin) && selected.length > 0 && (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-surface px-4 py-2 text-sm">
          Выбрано: {selected.length}
          <button
            onClick={() => void deleteSelected()}
            disabled={deletingSelected}
            className="font-semibold text-status-rejected disabled:opacity-60"
          >
            {deletingSelected ? "Удаление..." : "Удалить"}
          </button>
        </div>
      )}

      <section className="mt-5">
        <div className="flex items-center justify-between">
          <h2 className="label-caps">На рассмотрении</h2>
          {!isForeman && (
            <button
              onClick={() => void exportPendingToExcel()}
              disabled={exportingPending}
              className="text-sm font-semibold text-primary disabled:opacity-60"
            >
              {exportingPending ? "Формирование..." : "Экспорт в Excel"}
            </button>
          )}
        </div>
        <div className="mt-3 grid gap-4 xl:grid-cols-2">
          {pending.map((r) => renderCard(r, "pending"))}
        </div>
        {pending.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">Нет заявок на рассмотрении.</p>
        )}
      </section>

      <section className="mt-7">
        <div className="flex items-center justify-between">
          <h2 className="label-caps">История решений</h2>
        </div>
        <div className="mt-3 grid gap-4 xl:grid-cols-2">
          {history.map((r) => renderCard(r, "history"))}
        </div>
      </section>

      <Dialog open={!!dialogRequest} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent
          className={cn(
            "overflow-y-auto border-none shadow-none",
            isMobile
              ? "inset-0 left-0 top-0 h-full max-h-full w-full max-w-full translate-x-0 translate-y-0 rounded-none bg-background p-4 pt-[calc(1rem+env(safe-area-inset-top))] [&>button:last-child]:top-[calc(1rem+env(safe-area-inset-top))]"
              : "max-h-[85vh] w-[calc(100%-2rem)] bg-transparent p-0 sm:max-w-xl",
          )}
          // Диалог открывается программно по URL (?request=...), а не через
          // DialogTrigger — Radix пытается сам поставить/вернуть фокус, но
          // возвращать его некуда (triggerRef всегда null), а при холодном
          // старте из push-уведомления (SW делает полную навигацию, а не
          // SPA-переход) автофокус ловит момент до первого жеста в
          // документе — из-за этого на iOS появлялся паразитный focus-ring
          // и терялся первый тап по стрелке «Переписки». Отключаем оба
          // автофокуса Radix, раз они всё равно не нужны для этого диалога.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DialogTitle className="sr-only">Заявка</DialogTitle>
          {dialogRequest &&
            renderCard(
              dialogRequest,
              dialogRequest.status === "pending" ? "pending" : "history",
              true,
            )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!rejectTarget}
        onOpenChange={(open) => !open && deciding == null && setRejectTarget(null)}
      >
        <DialogContent
          className="w-[calc(100%-2rem)] sm:max-w-lg"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            rejectCommentRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Отклонить заявку</DialogTitle>
            <DialogDescription className="sr-only">
              Необязательный комментарий мастеру, который придёт вместе с отклонением.
            </DialogDescription>
          </DialogHeader>
          {rejectTarget && (
            <div className="rounded-xl bg-surface px-3 py-2">
              <p className="text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                Запрошено автором
              </p>
              <p className="mt-0.5 text-sm font-semibold break-words whitespace-pre-wrap">
                {rejectTarget.requested_text}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{rejectTarget.author}</p>
            </div>
          )}
          <label className="block">
            <FieldLabel>Комментарий мастеру (необязательно)</FieldLabel>
            <textarea
              ref={rejectCommentRef}
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              maxLength={2000}
              rows={4}
              placeholder="Например: такая позиция уже есть — …"
              className="mt-1 max-h-60 min-h-24 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm leading-normal"
            />
          </label>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setRejectTarget(null)}
              disabled={deciding != null}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => void reject()}
              disabled={deciding != null}
              className="rounded-lg bg-status-rejected px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {deciding != null ? "Сохранение..." : "Отклонить"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteCommentTarget}
        onOpenChange={(open) => !open && !deletingComment && setDeleteCommentTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить сообщение?</AlertDialogTitle>
            <AlertDialogDescription>
              Сообщение будет удалено у всех участников переписки. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingComment}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingComment}
              onClick={() => void confirmDeleteComment()}
              className="bg-status-rejected text-white hover:bg-status-rejected/90"
            >
              {deletingComment ? "Удаление..." : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
