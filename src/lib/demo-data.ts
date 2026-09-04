import type { PrismaClient } from "@prisma/client";
import { TaskStatus, TimeOfDay } from "@prisma/client";
import { keyForAppend } from "./order";

// The task tree used both to seed a brand-new project (prisma/seed.ts) and
// to restore the public demo project to its starting state (see
// src/app/api/reset/route.ts) — kept in one place so the two can't drift.
export async function seedDemoTasks(prisma: PrismaClient, projectId: string): Promise<void> {
  // Tracks the last sibling's order key per parent, so each parent gets its
  // own independent fractional-index sequence.
  const lastOrderByParent = new Map<string | null, string | null>();

  async function addTask(
    title: string,
    parentTaskId: string | null = null,
    status: TaskStatus = TaskStatus.TODO,
    timeOfDay: TimeOfDay = TimeOfDay.ANYTIME
  ) {
    const prevOrder = lastOrderByParent.get(parentTaskId) ?? null;
    const order = keyForAppend(prevOrder);
    lastOrderByParent.set(parentTaskId, order);
    return prisma.task.create({
      data: { projectId, parentTaskId, title, order, status, timeOfDay },
    });
  }

  const kitchen = await addTask("Clean the kitchen");
  const washDishes = await addTask("Wash dishes", kitchen.id);
  await addTask("Walk to the sink", washDishes.id);
  await addTask("Turn on the faucet", washDishes.id);
  await addTask("Pick up one plate", washDishes.id);

  await addTask("Vacuum living room", null, TaskStatus.DONE);
  await addTask("Take out trash");
  await addTask("Pick up medication");

  // Deliberately spans very short to very long titles — good coverage for
  // UI spots that need to handle title-length variance (row wrapping,
  // truncation, card layout).
  const japanTrip = await addTask("Plan for Japan trip");
  await addTask("Book flights", japanTrip.id);
  await addTask("Reserve hotels", japanTrip.id);
  await addTask("Exchange currency", japanTrip.id);
  await addTask("Make itinerary", japanTrip.id);
  await addTask("Get a Japan Rail pass for bullet trains", japanTrip.id);
  await addTask("Pack an umbrella and comfortable walking shoes", japanTrip.id);
  await addTask("Research neighborhoods to stay in Tokyo and Kyoto", japanTrip.id);
  await addTask("Book a ramen and sake tasting tour in Tokyo", japanTrip.id);

  // A few time-of-day examples to show off the schedule grouping.
  await addTask("Morning routine", null, TaskStatus.TODO, TimeOfDay.MORNING);
  await addTask("Bike to work", null, TaskStatus.TODO, TimeOfDay.MORNING);
  await addTask("Lunch with Sam", null, TaskStatus.TODO, TimeOfDay.AFTERNOON);
  await addTask("Evening walk", null, TaskStatus.TODO, TimeOfDay.EVENING);
  await addTask("Read before bed", null, TaskStatus.TODO, TimeOfDay.EVENING);
}
