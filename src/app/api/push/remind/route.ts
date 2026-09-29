import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendDigests } from "@/lib/server/push";
import { remindToken } from "@/lib/reminder-clock";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.AUTH_SECRET?.trim();
  const given = Buffer.from(request.headers.get("x-remind-token") ?? "");
  const wanted = Buffer.from(secret ? remindToken(secret) : "");
  if (!secret || given.length !== wanted.length || !timingSafeEqual(given, wanted)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json(await sendDigests());
}
