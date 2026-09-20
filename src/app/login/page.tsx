import { Suspense } from "react";
import type { Metadata } from "next";
import { googleEnabled } from "@/lib/auth-config";
import { SignInPage } from "@/components/pages/sign-in";

export const metadata: Metadata = { title: "Sign in" };

export default function Page() {
  return (
    <Suspense>
      <SignInPage mode="login" googleEnabled={googleEnabled} />
    </Suspense>
  );
}
