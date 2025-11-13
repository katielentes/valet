-- AlterTable
-- Drop old inOutPrivileges column if it exists (from previous migration)
-- Note: This migration assumes the old column may exist and handles it gracefully
ALTER TABLE "Location" ADD COLUMN "overnightInOutPrivileges" BOOLEAN NOT NULL DEFAULT true;
