-- CreateEnum
CREATE TYPE "FixedCostRecurrence" AS ENUM ('MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "FixedCostMonthlyStatus" AS ENUM ('PENDING', 'PAID');

-- CreateTable
CREATE TABLE "FixedCost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultAmount" DECIMAL(10,2) NOT NULL,
    "recurrence" "FixedCostRecurrence" NOT NULL DEFAULT 'MONTHLY',
    "dueDay" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedCostMonthly" (
    "id" TEXT NOT NULL,
    "fixedCostId" TEXT NOT NULL,
    "competence" TEXT NOT NULL,
    "status" "FixedCostMonthlyStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(10,2) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedCostMonthly_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FixedCost_userId_idx" ON "FixedCost"("userId");

-- CreateIndex
CREATE INDEX "FixedCostMonthly_fixedCostId_idx" ON "FixedCostMonthly"("fixedCostId");

-- CreateIndex
CREATE INDEX "FixedCostMonthly_competence_idx" ON "FixedCostMonthly"("competence");

-- CreateIndex
CREATE UNIQUE INDEX "FixedCostMonthly_fixedCostId_competence_key" ON "FixedCostMonthly"("fixedCostId", "competence");

-- AddForeignKey
ALTER TABLE "FixedCost" ADD CONSTRAINT "FixedCost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedCostMonthly" ADD CONSTRAINT "FixedCostMonthly_fixedCostId_fkey" FOREIGN KEY ("fixedCostId") REFERENCES "FixedCost"("id") ON DELETE CASCADE ON UPDATE CASCADE;