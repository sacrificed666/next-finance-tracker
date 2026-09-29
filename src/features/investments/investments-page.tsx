"use client";

import { useState } from "react";
import { PageBody, Split } from "@/components/layout/page";
import { AddButton, Card, ConfirmDialog, EmptyState, Icon, PageHeader } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { useStore } from "@/lib/state/store";
import type { Investment } from "@/lib/types";
import { PricesFootnote } from "@/features/shared/prices-footnote";
import { AllocationCard } from "./allocation-card";
import { InvestmentSheet } from "./investment-sheet";
import { InvestmentsCard } from "./investments-card";
import { InvestmentsHero } from "./investments-hero";
import { ScheduleCard } from "./schedule-card";

export function InvestmentsPage() {
  const { state, update } = useStore();
  const { t } = useT();
  const [target, setTarget] = useState<Investment | "new" | null>(null);
  const [renew, setRenew] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [closeId, setCloseId] = useState<string | null>(null);
  const closing = state.investments.find((i) => i.id === closeId);
  const deleting = state.investments.find((i) => i.id === deleteId);
  const add = () => setTarget("new");
  const open = (inv: Investment | "new", again = false) => {
    setRenew(again);
    setTarget(inv);
  };

  const confirmDelete = () => {
    if (!deleteId) return;
    update((s) => ({ ...s, investments: s.investments.filter((inv) => inv.id !== deleteId) }), t("balance.inv.deleted"));
    setDeleteId(null);
    setTarget(null);
  };

  const confirmClose = () => {
    if (!closeId) return;
    update((s) => ({ ...s, investments: s.investments.filter((inv) => inv.id !== closeId) }), t("investments.withdrawn"));
    setCloseId(null);
  };

  return (
    <>
      <PageHeader
        title={t("nav.investments")}
        subtitle={t("investments.subtitle")}
        action={<AddButton variant="primary" onClick={add} label={t("balance.addInvestment")} />}
      />

      <PageBody>
        {state.investments.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Icon name="trend" />}
              title={t("investments.empty")}
              hint={t("investments.empty.hint")}
              action={<AddButton variant="primary" onClick={add} label={t("balance.addInvestment")} />}
            />
          </Card>
        ) : (
          <>
            <InvestmentsHero />
            <Split
              stickySide
              main={<InvestmentsCard onAdd={add} onEdit={(inv) => open(inv)} />}
              side={
                <>
                  <AllocationCard />
                  <ScheduleCard onOpen={(inv) => open(inv)} onRenew={(inv) => open(inv, true)} onClose={(inv) => setCloseId(inv.id)} />
                </>
              }
            />
          </>
        )}
        <PricesFootnote scope="investments" />
      </PageBody>

      {target && (
        <InvestmentSheet
          key={target === "new" ? "new" : `${target.id}${renew ? ":renew" : ""}`}
          target={target}
          renew={renew}
          onClose={() => setTarget(null)}
          onDelete={setDeleteId}
        />
      )}
      <ConfirmDialog
        open={deleting !== undefined}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title={t("balance.inv.deleteTitle")}
        message={t("balance.inv.deleteMessage", { name: deleting?.name ?? "" })}
      />
      <ConfirmDialog
        open={closing !== undefined}
        onClose={() => setCloseId(null)}
        onConfirm={confirmClose}
        title={t("investments.withdraw.title")}
        message={t("investments.withdraw.message", { name: closing?.name ?? "" })}
        confirmLabel={t("investments.withdraw")}
      />
    </>
  );
}
