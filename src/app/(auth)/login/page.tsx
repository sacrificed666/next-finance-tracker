import { Suspense } from "react";
import type { Metadata } from "next";
import { googleEnabled } from "@/lib/server/auth-config";
import { SignInPage } from "@/features/auth/sign-in-page";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return (
    <Suspense>
      <SignInPage mode="login" googleEnabled={googleEnabled} />
    </Suspense>
  );
}
