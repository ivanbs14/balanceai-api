/*
  Warnings:

  - Changed the type of `invoicePayment` on the `Card` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "Card" DROP COLUMN "invoicePayment",
ADD COLUMN     "invoicePayment" TIMESTAMP(3) NOT NULL;
