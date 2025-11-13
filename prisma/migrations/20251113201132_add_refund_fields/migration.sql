-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "refundAmountCents" INTEGER DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN "refundedAt" DATETIME;
ALTER TABLE "Payment" ADD COLUMN "stripeRefundId" TEXT;
