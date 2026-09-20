import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  avatarProblem,
  birthdayProblem,
  loadProfile,
  saveProfile,
  websiteProblem,
  type ProfilePatch,
} from "@/lib/profile";

export const dynamic = "force-dynamic";

async function userId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export async function GET() {
  const id = await userId();
  if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const profile = await loadProfile(id);
  if (!profile) return NextResponse.json({ error: "No such account." }, { status: 404 });
  return NextResponse.json(profile);
}

export async function PATCH(request: Request) {
  const id = await userId();
  if (!id) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 });
  }

  const patch: ProfilePatch = {};
  for (const key of ["name", "image", "about", "occupation", "location", "website", "birthday", "locale"] as const) {
    if (key in body) patch[key] = body[key] === null ? null : String(body[key]).slice(0, 500).trim();
  }

  if (typeof patch.name === "string" && patch.name.length > 80) {
    return NextResponse.json({ error: "That name is longer than 80 characters." }, { status: 400 });
  }
  if (typeof patch.image === "string") {
    const bad = avatarProblem(patch.image);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  }
  if (typeof patch.website === "string") {
    const bad = websiteProblem(patch.website);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  }
  if (typeof patch.birthday === "string") {
    const bad = birthdayProblem(patch.birthday);
    if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  }
  for (const key of ["occupation", "location"] as const) {
    const value = patch[key];
    if (typeof value === "string" && value.length > 80) {
      return NextResponse.json({ error: "That value is longer than 80 characters." }, { status: 400 });
    }
  }

  try {
    await saveProfile(id, patch);
    return NextResponse.json(await loadProfile(id));
  } catch (err) {
    console.error("[api/profile]", err);
    return NextResponse.json({ error: "Could not save the profile." }, { status: 500 });
  }
}
