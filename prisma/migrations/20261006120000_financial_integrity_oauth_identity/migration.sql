-- This migration deliberately fails on orphaned or cross-owner records. Run the
-- read-only inventory and approve a per-ID repair before deploying to a populated DB.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Transation" t LEFT JOIN "User" u ON u.id = t."userId" WHERE u.id IS NULL) THEN
    RAISE EXCEPTION 'Transation has orphaned userId; inventory and repair before migration';
  END IF;
  IF EXISTS (SELECT 1 FROM "Transation" t LEFT JOIN "Card" c ON c.id = t."cardId" AND c."userId" = t."userId" WHERE t."cardId" IS NOT NULL AND c.id IS NULL) THEN
    RAISE EXCEPTION 'Transation has orphaned or cross-owner cardId; inventory and repair before migration';
  END IF;
END $$;

ALTER TABLE "User" ALTER COLUMN "document" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "googleSub" TEXT;
CREATE UNIQUE INDEX "User_googleSub_key" ON "User"("googleSub");

ALTER TABLE "FixedCostMonthly" ADD COLUMN "transactionId" TEXT;
CREATE UNIQUE INDEX "FixedCostMonthly_transactionId_key" ON "FixedCostMonthly"("transactionId");

CREATE UNIQUE INDEX "Card_id_userId_key" ON "Card"("id", "userId");
CREATE INDEX "Transation_userId_Date_id_idx" ON "Transation"("userId", "Date", "id");
CREATE INDEX "Transation_userId_installmentGroupId_paymentStatus_idx" ON "Transation"("userId", "installmentGroupId", "paymentStatus");

ALTER TABLE "Transation" ADD CONSTRAINT "Transation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transation" ADD CONSTRAINT "Transation_cardId_userId_fkey" FOREIGN KEY ("cardId", "userId") REFERENCES "Card"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FixedCostMonthly" DROP CONSTRAINT "FixedCostMonthly_fixedCostId_fkey";
ALTER TABLE "FixedCostMonthly" ADD CONSTRAINT "FixedCostMonthly_fixedCostId_fkey" FOREIGN KEY ("fixedCostId") REFERENCES "FixedCost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FixedCostMonthly" ADD CONSTRAINT "FixedCostMonthly_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
