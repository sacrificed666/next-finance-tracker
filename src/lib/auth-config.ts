export const OWNER_EMAIL = (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();

export const googleEnabled = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);
