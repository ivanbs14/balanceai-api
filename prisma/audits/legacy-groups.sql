-- Read-only inventory. There is no stable historical purchase key besides
-- installmentGroupId; name/amount/time proximity is not sufficient to backfill.
SELECT "userId", id, name, amount, "Date", installments, "installmentInfo", "paymentStatus", "cardId", "createdAt"
FROM "Transation"
WHERE installments > 1 AND "installmentGroupId" IS NULL
ORDER BY "userId", "createdAt", id;

-- Candidate clusters for manual per-ID review. No UPDATE is performed.
SELECT "userId", name, "cardId", installments, COUNT(*) AS rows,
       array_agg(id ORDER BY "Date", id) AS ids,
       array_agg("installmentInfo" ORDER BY "Date", id) AS sequences,
       SUM(amount) AS stored_total
FROM "Transation"
WHERE installments > 1 AND "installmentGroupId" IS NULL
GROUP BY "userId", name, "cardId", installments
ORDER BY rows DESC, "userId";

SELECT COUNT(*) AS category_rows FROM "Category";
