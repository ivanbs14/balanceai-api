ALTER TABLE "FixedCost"
ADD COLUMN "startDate" TIMESTAMP(3) NOT NULL DEFAULT NOW();

CREATE INDEX "FixedCost_startDate_idx" ON "FixedCost"("startDate");
