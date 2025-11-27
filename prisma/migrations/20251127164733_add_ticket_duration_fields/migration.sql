/*
  Warnings:

  - You are about to drop the column `hourlyRateCents` on the `Location` table. All the data in the column will be lost.
  - You are about to drop the column `hourlyTierHours` on the `Location` table. All the data in the column will be lost.
  - You are about to drop the column `inOutPrivileges` on the `Location` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN "durationDays" INTEGER;
ALTER TABLE "Ticket" ADD COLUMN "durationHours" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "overnightRateCents" INTEGER NOT NULL,
    "overnightInOutPrivileges" BOOLEAN NOT NULL DEFAULT true,
    "taxRateBasisPoints" INTEGER NOT NULL DEFAULT 2325,
    "hotelSharePoints" INTEGER NOT NULL DEFAULT 500,
    "pricingTiers" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Location_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Location" ("createdAt", "hotelSharePoints", "id", "identifier", "name", "overnightRateCents", "pricingTiers", "taxRateBasisPoints", "tenantId", "updatedAt") SELECT "createdAt", "hotelSharePoints", "id", "identifier", "name", "overnightRateCents", "pricingTiers", "taxRateBasisPoints", "tenantId", "updatedAt" FROM "Location";
DROP TABLE "Location";
ALTER TABLE "new_Location" RENAME TO "Location";
CREATE UNIQUE INDEX "Location_tenantId_identifier_key" ON "Location"("tenantId", "identifier");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
