import type { Metadata } from "next";
import { TransactionsPage } from "@/components/pages/transactions";

export const metadata: Metadata = { title: "Expenses" };

export default function Page() {
  return <TransactionsPage />;
}
