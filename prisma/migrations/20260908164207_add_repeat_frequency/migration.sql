-- CreateEnum
CREATE TYPE "RepeatFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'WEEKDAYS');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "repeatFrequency" "RepeatFrequency";
