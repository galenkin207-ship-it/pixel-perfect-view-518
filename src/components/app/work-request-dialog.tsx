import { useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useApp } from "@/state/use-app";

// Заявка мастера администратору на новый вид работы (страница «Справочник»).
export function WorkRequestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { createRequest } = useApp();
  const [requestText, setRequestText] = useState("");
  const [sendingRequest, setSendingRequest] = useState(false);

  const sendRequest = async () => {
    const text = requestText.trim();
    if (!text) return;
    setSendingRequest(true);
    try {
      await createRequest(text);
      toast.success("Заявка отправлена администратору");
      setRequestText("");
      onClose();
    } catch {
      toast.error("Не удалось отправить заявку, попробуйте ещё раз");
    } finally {
      setSendingRequest(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
        <DialogTitle>Заявка на новый вид работы</DialogTitle>
        <p className="text-sm text-muted-foreground">
          Не нашли нужную позицию в справочнике? Опишите, что нужно добавить — заявку рассмотрит
          администратор.
        </p>
        <textarea
          rows={4}
          autoFocus
          value={requestText}
          onChange={(e) => setRequestText(e.target.value)}
          placeholder="Опишите недостающие позиции, по одной на строку"
          className="mt-3 w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm"
        />
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-border bg-surface py-3 text-sm font-semibold"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => void sendRequest()}
            disabled={sendingRequest || !requestText.trim()}
            className="flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {sendingRequest ? "Отправка..." : "Отправить заявку"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
