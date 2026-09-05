import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrCreateDefaultProject } from "@/lib/project";
import { seedDemoTasks } from "@/lib/demo-data";

// Wipes and reseeds the shared demo project. This app has no auth (see
// DEMO_USER_ID) — every visitor edits the same project — so on a public
// deployment this is what keeps the demo from staying permanently trashed.
// Called on a schedule by .github/workflows/reset-demo.yml, gated by a
// shared secret rather than a session since there's no user to check.
export async function POST(request: Request) {
  const secret = process.env.RESET_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "RESET_SECRET is not configured" }, { status: 500 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await getOrCreateDefaultProject();
  await prisma.task.deleteMany({ where: { projectId: project.id } });
  await seedDemoTasks(prisma, project.id);

  revalidateTag("tasks", { expire: 0 });
  return NextResponse.json({ ok: true, resetAt: new Date().toISOString() });
}
