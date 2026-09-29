"use client";

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { Button } from "./button";
import { Icon } from "./icon";

let scrollLocks = 0;
let scrollLockPrevious = "";

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (scrollLocks === 0) {
      scrollLockPrevious = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    scrollLocks++;
    return () => {
      scrollLocks--;
      if (scrollLocks === 0) document.body.style.overflow = scrollLockPrevious;
    };
  }, [active]);
}

const dialogStack: symbol[] = [];

export function useDialogStack(open: boolean): () => boolean {
  const token = useRef<symbol>(undefined);
  token.current ??= Symbol("dialog");
  useEffect(() => {
    if (!open) return;
    const id = token.current!;
    dialogStack.push(id);
    return () => {
      const at = dialogStack.lastIndexOf(id);
      if (at !== -1) dialogStack.splice(at, 1);
    };
  }, [open]);
  return useCallback(() => dialogStack[dialogStack.length - 1] === token.current, []);
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

const FIRST_FIELD =
  'input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),select:not([disabled])';

export function useFocusTrap(open: boolean, panelRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const restoreTo = document.activeElement as HTMLElement | null;
    const fine = window.matchMedia?.("(pointer: fine)").matches ?? false;
    const firstField = fine
      ? panelRef.current?.querySelector<HTMLElement>(FIRST_FIELD)
      : null;
    (firstField ?? panelRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (restoreTo?.isConnected) restoreTo.focus();
    };
  }, [open, panelRef]);
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  onSubmit,
  problem,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onSubmit?: () => void;
  problem?: string | null;
  wide?: boolean;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const { t } = useT();

  const lastSubmit = useRef(0);
  const guardedSubmit = () => {
    const now = Date.now();
    if (now - lastSubmit.current < 400) return;
    lastSubmit.current = now;
    onSubmit?.();
  };

  useScrollLock(open);
  useFocusTrap(open, panelRef);
  const isTopmost = useDialogStack(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isTopmost()) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, isTopmost]);

  if (!open) return null;

  const Body = onSubmit ? "form" : "div";

  return (
    <div
      className="overlay-in fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onMouseDown={(e) => {
        if (!onSubmit && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`sheet-panel glass-solid flex max-h-[calc(100dvh-1.5rem)] w-full flex-col rounded-t-sheet outline-none sm:max-h-[calc(100dvh-3rem)] sm:rounded-sheet ${
          wide ? "sm:max-w-3xl" : "sm:max-w-md"
        }`}
      >
        <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
          <h2 id={titleId} className="min-w-0 truncate text-lg font-bold text-ink-1">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="icon-btn size-9 shrink-0 bg-ghost text-ink-3"
          >
            <Icon name="close" size={15} strokeWidth={2.2} />
          </button>
        </div>
        <Body
          className="flex min-h-0 flex-1 flex-col"
          {...(onSubmit
            ? {
                onSubmit: (e: React.FormEvent) => {
                  e.preventDefault();
                  guardedSubmit();
                },
                noValidate: true,
              }
            : {})}
        >
          <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-4 pb-4 sm:px-5 sm:pb-5">
            {children}
          </div>
          {(footer || problem) && (
            <div className="border-t border-hairline px-4 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-5">
              {problem && (
                <p aria-live="polite" className="caption mb-2.5">
                  {problem}
                </p>
              )}
              {footer && (
                <div className="flex flex-wrap items-center justify-end gap-2">{footer}</div>
              )}
            </div>
          )}
        </Body>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
}) {
  const { t } = useT();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel ?? t("common.delete")}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-2">{message}</p>
    </Sheet>
  );
}
