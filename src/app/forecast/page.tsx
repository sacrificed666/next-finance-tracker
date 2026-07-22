import type { Metadata } from "next";
import { ForecastPage } from "@/components/pages/forecast";

export const metadata: Metadata = { title: "Forecast" };

export default function Page() {
  return <ForecastPage />;
}
