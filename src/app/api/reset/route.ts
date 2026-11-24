import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { GUEST_EMAIL_DOMAIN } from "@/lib/guest-cookie";

// A guest counts as inactive once they've neither signed up nor touched a
// task in this long.
const INACTIVE_DAYS = 30;

// Deletes inactive guests (and, via cascades, their projects and tasks).
// Every visitor gets their own guest account (see src/proxy.ts), so without
// this the guest table would only ever grow. Called on a schedule by
// .github/workflows/reset-demo.yml, gated by a shared secret rather than a
// session since there's no user to check.
export async function POST(request: Request) {
  const secret = process.env.RESET_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "RESET_SECRET is not configured" }, { status: 500 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - INACTIVE_DAYS * 24 * 60 * 60 * 1000);

  const { count } = await prisma.user.deleteMany({
    where: {
      email: { endsWith: `@${GUEST_EMAIL_DOMAIN}` },
      createdAt: { lt: cutoff },
      projects: { none: { tasks: { some: { updatedAt: { gte: cutoff } } } } },
    },
  });

  return NextResponse.json({ ok: true, deletedGuests: count, prunedAt: new Date().toISOString() });
}
