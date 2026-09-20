import "server-only";
import { getPool } from "./db";
import { openRecord, sealRecord } from "./secrets";

export interface Profile {
  id: string;
  email: string | null;
  emailVerified: string | null;
  name: string | null;
  image: string | null;
  about: string | null;
  occupation: string | null;
  location: string | null;
  website: string | null;
  birthday: string | null;
  locale: string | null;
  createdAt: string;
  hasPassword: boolean;
  providers: string[];
}

interface ProfileSecret {
  name: string | null;
  image: string | null;
  about: string | null;
  occupation: string | null;
  location: string | null;
  website: string | null;
  birthday: string | null;
}

const PERSONAL = ["name", "image", "about", "occupation", "location", "website", "birthday"] as const;

export async function loadProfile(userId: string): Promise<Profile | null> {
  const res = await getPool().query(
    `SELECT u.id, u.email, u.name, u.image, u.about, u.occupation, u.location, u.website, u.locale,
            u.profile_secret,
            to_char(u.birthday, 'YYYY-MM-DD') AS birthday,
            to_char(u."emailVerified", 'YYYY-MM-DD"T"HH24:MI:SSZ') AS email_verified,
            to_char(u.created_at, 'YYYY-MM-DD') AS created_at,
            u.password_hash IS NOT NULL AS has_password,
            COALESCE(
              (SELECT array_agg(DISTINCT a.provider) FROM accounts a WHERE a."userId" = u.id),
              '{}'
            ) AS providers
       FROM users u WHERE u.id = $1`,
    [userId],
  );
  const r = res.rows[0];
  if (!r) return null;
  const sealed = openRecord<ProfileSecret>(r.profile_secret);
  return {
    id: r.id,
    email: r.email,
    emailVerified: r.email_verified,
    name: sealed ? sealed.name : r.name,
    image: sealed ? sealed.image : r.image,
    about: sealed ? sealed.about : r.about,
    occupation: sealed ? sealed.occupation : r.occupation,
    location: sealed ? sealed.location : r.location,
    website: sealed ? sealed.website : r.website,
    birthday: sealed ? sealed.birthday : r.birthday,
    locale: r.locale,
    createdAt: r.created_at,
    hasPassword: r.has_password,
    providers: r.providers ?? [],
  };
}

export function avatarProblem(url: string): string | null {
  if (url === "") return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "That is not a valid URL.";
  }
  if (parsed.protocol !== "https:") return "The avatar URL has to be https.";
  if (url.length > 500) return "That URL is too long.";
  return null;
}

export function websiteProblem(url: string): string | null {
  if (url === "") return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "That is not a valid URL.";
  }
  if (parsed.protocol !== "https:") return "The link has to be https.";
  if (url.length > 200) return "That link is too long.";
  return null;
}

export function birthdayProblem(value: string): string | null {
  if (value === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Use the YYYY-MM-DD format.";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "That date does not exist.";
  const now = Date.now();
  if (date.getTime() > now) return "That date is in the future.";
  if (now - date.getTime() > 130 * 365.25 * 24 * 3600 * 1000) return "That date is too far back.";
  return null;
}

export type ProfilePatch = Partial<
  Record<"name" | "image" | "about" | "occupation" | "location" | "website" | "birthday" | "locale", string | null>
>;

const EDITABLE = ["name", "image", "about", "occupation", "location", "website", "birthday", "locale"] as const;

export async function saveProfile(userId: string, patch: ProfilePatch): Promise<void> {
  const columns = EDITABLE.filter((k) => k in patch);
  if (columns.length === 0) return;

  const current = await loadProfile(userId);
  if (!current) return;

  const clean = (value: string | null | undefined): string | null =>
    typeof value === "string" && value.trim() !== "" ? value.trim() : null;

  const personal: ProfileSecret = {
    name: clean("name" in patch ? patch.name : current.name),
    image: clean("image" in patch ? patch.image : current.image),
    about: clean("about" in patch ? patch.about : current.about),
    occupation: clean("occupation" in patch ? patch.occupation : current.occupation),
    location: clean("location" in patch ? patch.location : current.location),
    website: clean("website" in patch ? patch.website : current.website),
    birthday: clean("birthday" in patch ? patch.birthday : current.birthday),
  };

  const locale = "locale" in patch ? clean(patch.locale) : current.locale;

  await getPool().query(
    `UPDATE users
        SET profile_secret = $2,
            locale = $3,
            ${PERSONAL.map((c) => `${c} = NULL`).join(", ")}
      WHERE id = $1`,
    [userId, sealRecord(personal), locale],
  );
}
