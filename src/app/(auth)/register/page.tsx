import { Suspense } from "react";
import type { Metadata } from "next";
import { googleEnabled } from "@/lib/server/auth-config";
import { SignInPage } from "@/features/auth/sign-in-page";

export const metadata: Metadata = { title: "Create account" };

export default function Page() {
  return (
    <Suspense>
      <SignInPage mode="register" googleEnabled={googleEnabled} />
    </Suspense>
  );
}
