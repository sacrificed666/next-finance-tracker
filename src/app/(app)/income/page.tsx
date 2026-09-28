import type { Metadata } from "next";
import { IncomePage } from "@/features/income/income-page";

export const metadata: Metadata = { title: "Income" };

export default function Page() {
  return <IncomePage />;
}
