-- CreateEnum
CREATE TYPE "TransationPaymentStatus" AS ENUM ('PENDING', 'PAID');

-- AlterTable
ALTER TABLE "Transation"
ADD COLUMN "paymentStatus" "TransationPaymentStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "paidAt" TIMESTAMP(3);
