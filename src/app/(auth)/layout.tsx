import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/server/auth";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  if ((await auth())?.user?.id) redirect("/");
  return children;
}
