"use client";

import { useState } from "react";
import { PageBody, Split } from "@/components/layout/page";
import { AddButton, Callout, ConfirmDialog, PageHeader } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { accountUsage, deleteAccount, useStore } from "@/lib/state/store";
import type { Debt, Receivable, SavingsAccount } from "@/lib/types";
import { PricesFootnote } from "@/features/shared/prices-footnote";
import { AccountSheet } from "./account-sheet";
import { AccountsCard } from "./accounts-card";
import { AccountsHero } from "./accounts-hero";
import { CurrenciesCard } from "./currencies-card";
import { DebtSheet } from "./debt-sheet";
import { DebtsCard } from "./debts-card";
import { GoalsCard } from "./goals-card";
import { ReceivableSheet } from "./receivable-sheet";
import { ReceivablesCard } from "./receivables-card";
import { BankCheckCard } from "./bank-check-card";
import { ReconcileSheet } from "./reconcile-sheet";

type Deleting = { kind: "account" | "debt" | "receivable"; id: string };

export function AccountsPage() {
  const { state, update } = useStore();
  const { t, tp } = useT();

  const [account, setAccount] = useState<SavingsAccount | "new" | null>(null);
  const [debt, setDebt] = useState<Debt | "new" | null>(null);
  const [receivable, setReceivable] = useState<Receivable | "new" | null>(null);
  const [reconcile, setReconcile] = useState<{ id: string; amount?: number } | null>(null);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);

  const addAccount = () => setAccount("new");
  const addDebt = () => setDebt("new");
  const addReceivable = () => setReceivable("new");

  const deletingAccount = deleting?.kind === "account" ? state.savings.find((a) => a.id === deleting.id) : undefined;
  const deletingDebt = deleting?.kind === "debt" ? state.debts.find((d) => d.id === deleting.id) : undefined;
  const deletingReceivable =
    deleting?.kind === "receivable" ? state.receivables.find((r) => r.id === deleting.id) : undefined;

  const accountImpact = (() => {
    if (!deletingAccount) return "";
    const use = accountUsage(state, deletingAccount.id);
    const parts = [
      use.entries > 0 && tp("balance.acc.impact.entries", use.entries),
      use.transfers > 0 && tp("balance.acc.impact.transfers", use.transfers),
      use.recurring > 0 && tp("balance.acc.impact.recurring", use.recurring),
      use.subscriptions > 0 && tp("balance.acc.impact.subscriptions", use.subscriptions),
    ].filter(Boolean);
    return parts.length > 0 ? ` ${parts.join("; ")}.` : "";
  })();

  const confirmDelete = () => {
    if (!deleting) return;
    const { kind, id } = deleting;
    if (kind === "account") {
      update((s) => deleteAccount(s, id), t("balance.acc.deleted"));
      setAccount(null);
    } else if (kind === "debt") {
      update((s) => ({ ...s, debts: s.debts.filter((d) => d.id !== id) }), t("balance.debt.deleted"));
      setDebt(null);
    } else {
      update((s) => ({ ...s, receivables: s.receivables.filter((r) => r.id !== id) }), t("receivables.deleted"));
      setReceivable(null);
    }
    setDeleting(null);
  };

  return (
    <>
      <PageHeader
        title={t("nav.accounts")}
        subtitle={t("accounts.subtitle")}
        action={
          <div className="flex flex-wrap gap-2">
            <AddButton onClick={addDebt} label={t("balance.addDebt")} />
            <AddButton onClick={addReceivable} label={t("receivables.add")} />
            <AddButton variant="primary" onClick={addAccount} label={t("balance.addAccount")} />
          </div>
        }
      />

      <PageBody>
        {priceError && (
          <Callout tone="warning" title={t("balance.prices.errorTitle")}>
            {priceError}
          </Callout>
        )}

        <AccountsHero />
        <Split
          stickySide
          main={<AccountsCard onAdd={addAccount} onEdit={setAccount} />}
          side={
            <>
              <BankCheckCard onMatch={(id, amount) => setReconcile({ id, amount })} />
              <CurrenciesCard />
              <GoalsCard />
              <DebtsCard onAdd={addDebt} onEdit={setDebt} />
              <ReceivablesCard onAdd={addReceivable} onEdit={setReceivable} />
            </>
          }
        />
        <PricesFootnote scope="accounts" />
      </PageBody>

      {account && (
        <AccountSheet
          key={account === "new" ? "new" : account.id}
          target={account}
          onClose={() => setAccount(null)}
          onDelete={(id) => setDeleting({ kind: "account", id })}
          onReconcile={(id) => {
            setAccount(null);
            setReconcile({ id });
          }}
          onPriceError={setPriceError}
        />
      )}
      {reconcile && (
        <ReconcileSheet key={reconcile.id} accountId={reconcile.id} amount={reconcile.amount} onClose={() => setReconcile(null)} />
      )}
      {debt && (
        <DebtSheet
          key={debt === "new" ? "new" : debt.id}
          target={debt}
          onClose={() => setDebt(null)}
          onDelete={(id) => setDeleting({ kind: "debt", id })}
        />
      )}

      <ConfirmDialog
        open={deletingAccount !== undefined}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title={t("balance.acc.deleteTitle")}
        message={t("balance.acc.deleteMessage", { name: deletingAccount?.name ?? "" }) + accountImpact}
      />
      {receivable && (
        <ReceivableSheet
          key={receivable === "new" ? "new" : receivable.id}
          target={receivable}
          onClose={() => setReceivable(null)}
          onDelete={(id) => setDeleting({ kind: "receivable", id })}
        />
      )}
      <ConfirmDialog
        open={deletingReceivable !== undefined}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title={t("receivables.deleteTitle")}
        message={t("receivables.deleteMessage", { name: deletingReceivable?.name ?? "" })}
      />
      <ConfirmDialog
        open={deletingDebt !== undefined}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title={t("balance.debt.deleteTitle")}
        message={t("balance.debt.deleteMessage", { name: deletingDebt?.name ?? "" })}
      />
    </>
  );
}
