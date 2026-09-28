import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { EntryIntents } from "@/features/transactions/entry-intents";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppShell>{children}</AppShell>
      <EntryIntents />
    </>
  );
}
