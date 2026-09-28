import type { Metadata } from "next";
import { ForecastPage } from "@/features/forecast/forecast-page";

export const metadata: Metadata = { title: "Forecast" };

export default function Page() {
  return <ForecastPage />;
}
