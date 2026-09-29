"use client";

import { useState } from "react";
import { OptionPicker } from "@/components/forms/option-picker";
import { useAccountGroups } from "@/components/forms/picker-groups";
import { Button, Field, FieldSet, SegmentedControl, Select, Sheet } from "@/components/ui";
import { CURRENCIES } from "@/lib/constants";
import { candidatesFromCsv, type CsvMapping } from "@/lib/finance/csv";
import type { ImportCandidate } from "@/lib/finance/import";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/state/store";
import type { Currency } from "@/lib/types";
import type { CsvDraft } from "./import-card";

export function CsvSheet({
  draft,
  onChange,
  onClose,
  onPreview,
}: {
  draft: CsvDraft;
  onChange: (draft: CsvDraft) => void;
  onClose: () => void;
  onPreview: (found: ImportCandidate[]) => void;
}) {
  const { state } = useStore();
  const { t, tp } = useT();
  const [currency, setCurrency] = useState<Currency>(state.settings.baseCurrency);
  const [accountId, setAccountId] = useState(state.savings[0]?.id ?? "");
  const accountGroups = useAccountGroups(state.savings, [{ value: "", label: t("common.notAssigned") }]);
  const { mapping } = draft;

  const columns = [
    { value: "-1", label: "—" },
    ...draft.header.map((h, i) => ({ value: String(i), label: h || `#${i + 1}` })),
  ];
  const column = (role: keyof CsvMapping, label: string, optional = false) => (
    <Field label={label} hint={optional ? t("common.optional") : undefined}>
      <Select
        size="sm"
        value={String(mapping[role])}
        onChange={(e) => onChange({ ...draft, mapping: { ...mapping, [role]: Number(e.target.value) } })}
      >
        {columns.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </Select>
    </Field>
  );

  const found =
    mapping.date >= 0 && mapping.amount >= 0
      ? candidatesFromCsv(state, draft.rows, mapping, currency).map((c) => ({ ...c, accountId: accountId || undefined }))
      : [];
  const problem = mapping.date < 0 || mapping.amount < 0 ? t("import.csv.needColumns") : found.length === 0 ? t("import.csv.nothing") : null;

  return (
    <Sheet
      open
      onClose={onClose}
      title={t("import.csv.title")}
      problem={problem}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => onPreview(found)} disabled={problem !== null}>
            {tp("import.csv.preview", found.length)}
          </Button>
        </>
      }
    >
      <p className="caption">
        {draft.name} · {tp("import.csv.rows", draft.rows.length)}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {column("date", t("common.date"))}
        {column("amount", t("common.amount"))}
        {column("description", t("import.csv.description"))}
        {column("debit", t("import.csv.debit"), true)}
        {column("mcc", "MCC", true)}
      </div>
      <FieldSet label={t("common.currency")}>
        <SegmentedControl
          label={t("common.currency")}
          options={CURRENCIES.map((c) => ({ value: c, label: c }))}
          value={currency}
          onChange={setCurrency}
        />
      </FieldSet>
      <Field label={t("import.csv.account")}>
        <OptionPicker label={t("import.csv.account")} value={accountId} onChange={setAccountId} groups={accountGroups} />
      </Field>
    </Sheet>
  );
}
