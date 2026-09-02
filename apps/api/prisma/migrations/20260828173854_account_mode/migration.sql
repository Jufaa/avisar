-- CreateEnum
CREATE TYPE "AccountMode" AS ENUM ('SOLO', 'CLINIC');

-- AlterTable
ALTER TABLE "organization" ADD COLUMN     "mode" "AccountMode" NOT NULL DEFAULT 'SOLO';
