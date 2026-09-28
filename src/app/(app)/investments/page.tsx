import type { Metadata } from "next";
import { InvestmentsPage } from "@/features/investments/investments-page";

export const metadata: Metadata = { title: "Investments" };

export default function Page() {
  return <InvestmentsPage />;
}
