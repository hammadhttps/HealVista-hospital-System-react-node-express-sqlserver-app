-- AlterTable
ALTER TABLE "bills" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "refundRef" TEXT,
ADD COLUMN     "refundedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "refundedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_eventId_key" ON "webhook_events"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_providerRef_key" ON "payments"("provider", "providerRef");

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "discounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

