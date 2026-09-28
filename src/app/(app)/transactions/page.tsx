import type { Metadata } from "next";
import { TransactionsPage } from "@/features/transactions/transactions-page";

export const metadata: Metadata = { title: "Expenses" };

export default function Page() {
  return <TransactionsPage />;
}
