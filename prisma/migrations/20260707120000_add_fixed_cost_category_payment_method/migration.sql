ALTER TABLE "FixedCost"
ADD COLUMN "category" "TransationCategory",
ADD COLUMN "paymentMethod" "TransationPaymentMethod";

WITH inferred_values AS (
  SELECT
    fc.id,
    tx.category,
    tx."paymentMethod"
  FROM "FixedCost" fc
  LEFT JOIN LATERAL (
    SELECT
      t.category,
      t."paymentMethod"
    FROM "Transation" t
    WHERE t."userId" = fc."userId"
      AND t.type = 'EXPENSE'
      AND LOWER(TRIM(t.name)) = LOWER(TRIM(fc.name))
    ORDER BY t."Date" DESC, t."createdAt" DESC
    LIMIT 1
  ) tx ON TRUE
)
UPDATE "FixedCost" fc
SET
  "category" = COALESCE(inferred_values.category, 'OTHER'::"TransationCategory"),
  "paymentMethod" = COALESCE(inferred_values."paymentMethod", 'OTHER'::"TransationPaymentMethod")
FROM inferred_values
WHERE inferred_values.id = fc.id;

ALTER TABLE "FixedCost"
ALTER COLUMN "category" SET NOT NULL,
ALTER COLUMN "paymentMethod" SET NOT NULL;
