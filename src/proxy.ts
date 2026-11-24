import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { GUEST_COOKIE, GUEST_COOKIE_MAX_AGE, isValidGuestId } from "@/lib/guest-cookie";

// Gives every visitor an anonymous guest ID on their first request, so each
// browser gets its own private copy of the demo tasks without signing in.
// The DB side (user + project + seeded tasks) is created lazily on first
// page load — see getGuestProject in src/lib/guest.ts — since Proxy isn't
// meant for data fetching.
export function proxy(request: NextRequest) {
  if (isValidGuestId(request.cookies.get(GUEST_COOKIE)?.value)) {
    return NextResponse.next();
  }

  const guestId = crypto.randomUUID();

  // Also set it on the *request* so this very first render already sees
  // the ID via cookies() — otherwise it'd only arrive on the next request.
  request.cookies.set(GUEST_COOKIE, guestId);
  const response = NextResponse.next({ request: { headers: request.headers } });

  response.cookies.set({
    name: GUEST_COOKIE,
    value: guestId,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_COOKIE_MAX_AGE,
  });
  return response;
}

export const config = {
  // Everything except Next's static assets and files with an extension
  // (fonts, images, favicon) — those never touch user data.
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
