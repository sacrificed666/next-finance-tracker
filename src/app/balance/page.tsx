import type { Metadata } from "next";
import { BalancePage } from "@/components/pages/balance";

export const metadata: Metadata = { title: "Balance" };

export default function Page() {
  return <BalancePage />;
}
