import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { keyForAppend } from "@/lib/order";
import { findOwnedProject, findOwnedTask } from "@/lib/guest";
import { tasksTag } from "@/lib/tasks-cache";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  if (!(await findOwnedProject(projectId))) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  const tasks = await prisma.task.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
  });

  return NextResponse.json(tasks);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  if (!(await findOwnedProject(projectId))) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }
  const body = await request.json();

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const parentTaskId: string | null =
    typeof body.parentTaskId === "string" ? body.parentTaskId : null;
  if (parentTaskId && (await findOwnedTask(parentTaskId))?.projectId !== projectId) {
    return NextResponse.json({ error: "parent task not found" }, { status: 404 });
  }

  const lastSibling = await prisma.task.findFirst({
    where: { projectId, parentTaskId },
    orderBy: { order: "desc" },
  });

  const task = await prisma.task.create({
    data: {
      projectId,
      parentTaskId,
      title,
      description: typeof body.description === "string" ? body.description : null,
      priority: body.priority ?? "MEDIUM",
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      ...(body.timeOfDay ? { timeOfDay: body.timeOfDay } : {}),
      scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
      scheduledTime: body.scheduledTime ? new Date(body.scheduledTime) : null,
      ...(body.repeatFrequency ? { repeatFrequency: body.repeatFrequency } : {}),
      order: keyForAppend(lastSibling?.order ?? null),
    },
  });

  revalidateTag(tasksTag(projectId), { expire: 0 });
  return NextResponse.json(task, { status: 201 });
}
