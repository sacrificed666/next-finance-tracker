import { Suspense } from "react";
import type { Metadata } from "next";
import { googleEnabled } from "@/lib/auth-config";
import { SignInPage } from "@/components/pages/sign-in";

export const metadata: Metadata = { title: "Create account" };

export default function Page() {
  return (
    <Suspense>
      <SignInPage mode="register" googleEnabled={googleEnabled} />
    </Suspense>
  );
}
