-- AlterTable
ALTER TABLE "Transation"
ADD COLUMN "installmentGroupId" TEXT;

-- CreateIndex
CREATE INDEX "Transation_installmentGroupId_idx" ON "Transation"("installmentGroupId");
