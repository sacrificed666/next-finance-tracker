"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { currentMonth } from "@/lib/date";
import { useStore } from "@/lib/state/store";
import type { TxType } from "@/lib/types";
import { TransactionSheet } from "./transaction-sheet";

const ADD_TYPES: TxType[] = ["expense", "income", "transfer"];

export function EntryIntents() {
  return (
    <Suspense fallback={null}>
      <Intents />
    </Suspense>
  );
}

function Intents() {
  const { state, hydrated } = useStore();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  if (!hydrated) return null;

  const type = ADD_TYPES.find((type) => type === params.get("add"));
  const txId = params.get("tx");
  const editing = txId ? state.transactions.find((tx) => tx.id === txId) : undefined;
  if (!type && !editing) return null;

  const close = () => {
    const rest = new URLSearchParams(params);
    rest.delete("add");
    rest.delete("tx");
    const query = rest.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <TransactionSheet
      key={editing ? editing.id : `add:${type}`}
      target={editing ?? "new"}
      type={type}
      month={currentMonth()}
      onClose={close}
    />
  );
}
