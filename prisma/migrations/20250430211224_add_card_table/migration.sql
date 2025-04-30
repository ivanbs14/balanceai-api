-- AlterTable
ALTER TABLE "Transation" ADD COLUMN     "cardId" TEXT;

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "limitBalance" DECIMAL(10,2) NOT NULL,
    "invoicePayment" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Transation_cardId_idx" ON "Transation"("cardId");
