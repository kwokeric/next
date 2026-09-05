import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { TaskStatus, type Task } from "@prisma/client";

// Walks up the parent chain, auto-completing (or un-completing) each
// ancestor based on whether all of its direct children are non-TODO.
// Archived parents are left alone — and since we don't recurse past an
// archived parent, changes don't bubble through a "tucked away" subtree.
async function cascadeParentStatus(
  parentTaskId: string | null,
  changed: Task[]
): Promise<void> {
  if (!parentTaskId) return;

  const parent = await prisma.task.findUnique({ where: { id: parentTaskId } });
  if (!parent || parent.status === TaskStatus.ARCHIVED) return;

  const siblings = await prisma.task.findMany({ where: { parentTaskId } });
  const allComplete = siblings.every((t) => t.status !== TaskStatus.TODO);
  const nextStatus = allComplete ? TaskStatus.DONE : TaskStatus.TODO;

  if (parent.status !== nextStatus) {
    const updatedParent = await prisma.task.update({
      where: { id: parent.id },
      data: { status: nextStatus },
    });
    changed.push(updatedParent);
  }

  await cascadeParentStatus(parent.parentTaskId, changed);
}

// Walks down the subtree, setting every descendant to the same status.
// Applied both ways (check and uncheck) so a task's status stays consistent
// with cascadeParentStatus's invariant — otherwise unchecking a parent
// would leave its subtasks DONE, and the next unrelated child edit would
// immediately flip the parent back to DONE via the upward cascade.
// Already-archived descendants (and their own subtrees) are left alone.
async function cascadeChildrenStatus(
  parentTaskId: string,
  status: TaskStatus,
  changed: Task[]
): Promise<void> {
  const children = await prisma.task.findMany({ where: { parentTaskId } });

  for (const child of children) {
    if (child.status === TaskStatus.ARCHIVED) continue;

    if (child.status !== status) {
      const updatedChild = await prisma.task.update({
        where: { id: child.id },
        data: { status },
      });
      changed.push(updatedChild);
    }

    await cascadeChildrenStatus(child.id, status, changed);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const body = await request.json();

  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...(typeof body.title === "string" ? { title: body.title } : {}),
      ...(typeof body.description === "string" || body.description === null
        ? { description: body.description }
        : {}),
      ...(body.status ? { status: body.status } : {}),
      ...(body.priority ? { priority: body.priority } : {}),
      ...(body.dueDate !== undefined
        ? { dueDate: body.dueDate ? new Date(body.dueDate) : null }
        : {}),
      ...(body.dueTime !== undefined
        ? { dueTime: body.dueTime ? new Date(body.dueTime) : null }
        : {}),
      ...(body.scheduledFor !== undefined
        ? { scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null }
        : {}),
      ...(body.timeOfDay ? { timeOfDay: body.timeOfDay } : {}),
      ...(body.scheduledTime !== undefined
        ? { scheduledTime: body.scheduledTime ? new Date(body.scheduledTime) : null }
        : {}),
    },
  });

  const changed = [task];
  if (body.status) {
    await cascadeChildrenStatus(task.id, task.status, changed);
    await cascadeParentStatus(task.parentTaskId, changed);
  }

  revalidateTag("tasks", { expire: 0 });
  return NextResponse.json(changed);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  // Subtasks cascade-delete via the self-relation's onDelete: Cascade.
  await prisma.task.delete({ where: { id: taskId } });
  revalidateTag("tasks", { expire: 0 });
  return new NextResponse(null, { status: 204 });
}
