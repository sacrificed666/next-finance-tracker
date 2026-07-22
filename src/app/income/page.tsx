import type { Metadata } from "next";
import { IncomePage } from "@/components/pages/income";

export const metadata: Metadata = { title: "Income" };

export default function Page() {
  return <IncomePage />;
}
