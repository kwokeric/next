// Shared between proxy.ts and the server-side guest helpers. Kept free of
// Prisma imports so the proxy stays lightweight.

export const GUEST_COOKIE = "next_guest";

// One year. Guests inactive for longer than the prune window are deleted
// server-side well before this anyway (see src/app/api/reset/route.ts).
export const GUEST_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The cookie value doubles as the User row's id, so only accept the exact
// shape we issue — never an arbitrary string a client made up (e.g. the
// legacy "demo-user").
export function isValidGuestId(value: string | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// Guests have no real email, but User.email is required and unique. The
// reserved .invalid TLD can never collide with a real address, and makes
// guest rows easy to find for pruning.
export const GUEST_EMAIL_DOMAIN = "guest.invalid";
