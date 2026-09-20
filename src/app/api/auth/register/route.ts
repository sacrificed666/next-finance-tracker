import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { sealRecord } from "@/lib/secrets";
import { hashPassword, passwordProblem } from "@/lib/password";
import { OWNER_EMAIL } from "@/lib/auth-config";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request, "register"), 5, 15 * 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts — try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: { email?: string; password?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim() || null;

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "That does not look like an email address." }, { status: 400 });
  }
  if (OWNER_EMAIL && email !== OWNER_EMAIL) {
    return NextResponse.json(
      { error: "Registration is closed on this instance." },
      { status: 403 },
    );
  }
  const weak = passwordProblem(password);
  if (weak) return NextResponse.json({ error: weak }, { status: 400 });

  const password_hash = await hashPassword(password);
  try {
    const res = await getPool().query<{ id: string }>(
      `INSERT INTO users (email, profile_secret, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [
        email,
        sealRecord({
          name,
          image: null,
          about: null,
          occupation: null,
          location: null,
          website: null,
          birthday: null,
        }),
        password_hash,
      ],
    );
    if (res.rowCount === 0) {
      return NextResponse.json(
        { error: "There is already an account with that email. Try signing in." },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("[api/auth/register]", err);
    return NextResponse.json({ error: "Could not create the account." }, { status: 500 });
  }
}
