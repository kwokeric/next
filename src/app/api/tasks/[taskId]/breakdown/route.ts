import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { generateSubtasks } from "@/lib/anthropic";
import { keyForAppend } from "@/lib/order";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    return NextResponse.json({ error: "task not found" }, { status: 404 });
  }

  const subtaskTitles = await generateSubtasks(task.title, task.description);

  const lastSibling = await prisma.task.findFirst({
    where: { projectId: task.projectId, parentTaskId: task.id },
    orderBy: { order: "desc" },
  });

  let order = lastSibling?.order ?? null;
  const subtasks = [];
  for (const title of subtaskTitles) {
    order = keyForAppend(order);
    subtasks.push({
      projectId: task.projectId,
      parentTaskId: task.id,
      title,
      order,
    });
  }

  await prisma.task.createMany({ data: subtasks });

  const created = await prisma.task.findMany({
    where: { parentTaskId: task.id },
    orderBy: { order: "asc" },
  });

  revalidateTag("tasks", { expire: 0 });
  return NextResponse.json(created, { status: 201 });
}
