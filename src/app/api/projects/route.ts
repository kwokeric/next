import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getGuestId, getGuestProject } from "@/lib/guest";

export async function GET() {
  const projects = await prisma.project.findMany({
    where: { userId: await getGuestId(), archived: false },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(projects);
}

export async function POST(request: Request) {
  const body = await request.json();
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  // Makes sure the guest's User row exists before attaching a project.
  await getGuestProject();

  const project = await prisma.project.create({
    data: {
      title,
      color: typeof body.color === "string" ? body.color : null,
      userId: await getGuestId(),
    },
  });

  return NextResponse.json(project, { status: 201 });
}
