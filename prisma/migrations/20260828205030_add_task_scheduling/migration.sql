-- CreateEnum
CREATE TYPE "TimeOfDay" AS ENUM ('ANYTIME', 'MORNING', 'AFTERNOON', 'EVENING');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "dueTime" TIME,
ADD COLUMN     "scheduledFor" DATE,
ADD COLUMN     "scheduledTime" TIME,
ADD COLUMN     "timeOfDay" "TimeOfDay" NOT NULL DEFAULT 'ANYTIME',
ALTER COLUMN "dueDate" SET DATA TYPE DATE;
