-- CreateTable
CREATE TABLE "AIFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "competence" TEXT NOT NULL,
    "totalIncome" DECIMAL(10,2) NOT NULL,
    "totalExpense" DECIMAL(10,2) NOT NULL,
    "totalInvestment" DECIMAL(10,2) NOT NULL,
    "topCategory" TEXT,
    "topCategoryValue" DECIMAL(10,2),
    "analysis" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIFeedback_userId_idx" ON "AIFeedback"("userId");

-- CreateIndex
CREATE INDEX "AIFeedback_competence_idx" ON "AIFeedback"("competence");

-- CreateIndex
CREATE UNIQUE INDEX "AIFeedback_userId_competence_key" ON "AIFeedback"("userId", "competence");
