"use client";

import { useState } from "react";
import { OptionPicker } from "@/components/forms/option-picker";
import { useCategoryGroups } from "@/components/forms/picker-groups";
import { Button, Card, Icon, SegmentedControl, TextInput } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { uid, useStore } from "@/lib/state/store";

/**
 * "Description contains … → category". Imports try these before the card's
 * merchant code, so a shop you visit often always lands where you want it.
 */
export function RulesCard() {
  const { state, update } = useStore();
  const { t, category } = useT();
  const [match, setMatch] = useState("");
  const [type, setType] = useState<"expense" | "income">("expense");
  const [categoryId, setCategoryId] = useState("");
  const expenseGroups = useCategoryGroups(state.categories, ["expense"]);
  const incomeGroups = useCategoryGroups(state.categories, ["income"]);
  const catById = new Map(state.categories.map((c) => [c.id, c]));
  const valid = match.trim().length > 0 && categoryId !== "" && catById.get(categoryId)?.kind === type;

  const add = () => {
    if (!valid) return;
    update((s) => ({ ...s, rules: [...s.rules, { id: uid(), match: match.trim(), categoryId, type }] }));
    setMatch("");
  };

  return (
    <Card title={t("rules.title")} subtitle={t("rules.subtitle")} icon="sliders">
      <div className="grid gap-2 rounded-field bg-ghost p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <TextInput
          value={match}
          onChange={(e) => setMatch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={t("rules.matchPlaceholder")}
          aria-label={t("rules.match")}
          maxLength={80}
        />
        <OptionPicker
          label={t("common.category")}
          value={categoryId}
          onChange={setCategoryId}
          groups={type === "income" ? incomeGroups : expenseGroups}
        />
        <SegmentedControl
          size="sm"
          label={t("tx.kind")}
          options={[
            { value: "expense" as const, label: t("tx.type.expense") },
            { value: "income" as const, label: t("tx.type.income") },
          ]}
          value={type}
          onChange={(next) => {
            setType(next);
            setCategoryId("");
          }}
        />
        <Button size="sm" onClick={add} disabled={!valid}>
          <Icon name="plus" size={14} />
          {t("rules.add")}
        </Button>
      </div>

      {state.rules.length === 0 ? (
        <p className="caption mt-3 px-1">{t("rules.empty")}</p>
      ) : (
        <ul className="rows mt-3">
          {state.rules.map((rule) => {
            const cat = catById.get(rule.categoryId);
            return (
              <li key={rule.id} className="flex items-center gap-3 px-2.5 py-2">
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold text-ink-1">“{rule.match}”</span>
                  <span className="text-ink-3"> → </span>
                  <span className="text-ink-2">
                    {cat?.icon} {category(cat)}
                  </span>
                </span>
                <span className={`shrink-0 text-xs ${rule.type === "income" ? "text-income" : "text-ink-3"}`}>
                  {rule.type === "income" ? t("tx.type.income") : t("tx.type.expense")}
                </span>
                <button
                  type="button"
                  aria-label={t("rules.remove", { match: rule.match })}
                  onClick={() => update((s) => ({ ...s, rules: s.rules.filter((r) => r.id !== rule.id) }))}
                  className="icon-btn icon-btn-danger size-8 shrink-0 text-ink-3"
                >
                  <Icon name="trash" size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
