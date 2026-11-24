import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { keyForMove } from "@/lib/order";
import { findOwnedTask } from "@/lib/guest";
import { tasksTag } from "@/lib/tasks-cache";

// Body: { parentTaskId: string | null, prevOrder: string | null, nextOrder: string | null }
// The client determines the new neighbors (e.g. from a drag-and-drop drop
// position) and sends their `order` keys; this only computes the new key
// and (optionally) reparents the task. No other rows are touched.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const owned = await findOwnedTask(taskId);
  if (!owned) {
    return NextResponse.json({ error: "task not found" }, { status: 404 });
  }
  const body = await request.json();

  const prevOrder: string | null = body.prevOrder ?? null;
  const nextOrder: string | null = body.nextOrder ?? null;
  const parentTaskId: string | null =
    body.parentTaskId !== undefined ? body.parentTaskId : null;
  // Can only move under a task in the same project.
  if (parentTaskId && (await findOwnedTask(parentTaskId))?.projectId !== owned.projectId) {
    return NextResponse.json({ error: "parent task not found" }, { status: 404 });
  }

  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      parentTaskId,
      order: keyForMove(prevOrder, nextOrder),
    },
  });

  revalidateTag(tasksTag(task.projectId), { expire: 0 });
  return NextResponse.json(task);
}
