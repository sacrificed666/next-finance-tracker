"use client";

import { useRef, useState, type ReactNode } from "react";
import { Button, Card, ConfirmDialog, Icon, IconDisc, SUBJECT_SLOT, type IconName } from "@/components/ui";
import { DEFAULT_STATE } from "@/lib/constants";
import { todayISO } from "@/lib/date";
import { downloadFile } from "@/lib/download";
import { useT } from "@/lib/i18n";
import { exportBackup, parseBackup } from "@/lib/state/backup";
import { useStore } from "@/lib/state/store";
import type { AppState } from "@/lib/types";

function DataRow({
  icon,
  title,
  caption,
  action,
  danger = false,
}: {
  icon: IconName;
  title: string;
  caption: string;
  action: ReactNode;
  danger?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-field px-3 py-2.5 ${
        danger ? "border border-expense/20 bg-expense/8" : "bg-ghost"
      }`}
    >
      {danger ? (
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-chip bg-expense/12 text-expense">
          <Icon name={icon} size={16} />
        </span>
      ) : (
        <IconDisc colorSlot={SUBJECT_SLOT[icon]} className="size-9 rounded-chip">
          <Icon name={icon} size={16} />
        </IconDisc>
      )}
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${danger ? "text-expense" : "text-ink-1"}`}>{title}</p>
        <p className="text-xs text-ink-3">{caption}</p>
      </div>
      {action}
    </div>
  );
}

/** Export, import (with confirmation) and a full reset — each undoable. */
export function DataCard() {
  const { state, replace } = useStore();
  const { t } = useT();
  const [importError, setImportError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<AppState | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportData = () => downloadFile(`finance-backup-${todayISO()}.json`, exportBackup(state), "application/json");

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError(null);
    setImportSummary(null);
    try {
      setPendingImport(parseBackup(await file.text()));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : t("settings.data.readFailed"));
    }
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    const { transactions, categories, savings, investments } = pendingImport;
    replace(pendingImport, t("settings.data.replacedUndo"));
    setPendingImport(null);
    setImportSummary(
      t("settings.data.imported", {
        records: transactions.length,
        categories: categories.length,
        holdings: savings.length + investments.length,
      }),
    );
  };

  const confirmReset = () => {
    replace(
      { ...DEFAULT_STATE, settings: { ...DEFAULT_STATE.settings, locale: state.settings.locale } },
      t("settings.data.resetUndo"),
    );
    setResetOpen(false);
  };

  return (
    <Card title={t("settings.data.title")} subtitle={t("settings.data.subtitle")} icon="database">
      <div className="space-y-2">
        <DataRow
          icon="arrowDown"
          title={t("settings.data.export")}
          caption={t("settings.data.export.caption")}
          action={
            <Button variant="ghost" onClick={exportData}>
              {t("settings.data.download")}
            </Button>
          }
        />
        <DataRow
          icon="database"
          title={t("settings.data.import")}
          caption={t("settings.data.import.caption")}
          action={
            <Button variant="ghost" onClick={() => fileInputRef.current?.click()}>
              {t("settings.data.chooseFile")}
            </Button>
          }
        />
        <DataRow
          danger
          icon="trash"
          title={t("settings.data.reset")}
          caption={t("settings.data.reset.caption")}
          action={
            <Button variant="danger" onClick={() => setResetOpen(true)}>
              {t("settings.data.resetButton")}
            </Button>
          }
        />
      </div>
      {importError && <p className="mt-3 text-sm text-expense">{importError}</p>}
      {importSummary && <p className="mt-3 text-sm text-income">{importSummary}</p>}
      <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={onFileChosen} />

      <ConfirmDialog
        open={pendingImport !== null}
        onClose={() => setPendingImport(null)}
        onConfirm={confirmImport}
        title={t("settings.data.replaceTitle")}
        message={t("settings.data.replaceMessage")}
        confirmLabel={t("settings.data.replace")}
      />
      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={confirmReset}
        title={t("settings.data.resetTitle")}
        message={t("settings.data.resetMessage", {
          records: state.transactions.length,
          accounts: state.savings.length,
          investments: state.investments.length,
          debts: state.debts.length,
        })}
        confirmLabel={t("settings.data.resetButton")}
      />
    </Card>
  );
}
