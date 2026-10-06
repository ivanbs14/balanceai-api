-- Read-only inventory. Save the result, a backup and an approved per-ID repair
-- plan before applying 20261006120000 to any existing database.
SELECT t.id, t."userId" FROM "Transation" t LEFT JOIN "User" u ON u.id = t."userId" WHERE u.id IS NULL;
SELECT t.id, t."userId", t."cardId", c."userId" AS "cardOwnerId"
FROM "Transation" t LEFT JOIN "Card" c ON c.id = t."cardId"
WHERE t."cardId" IS NOT NULL AND (c.id IS NULL OR c."userId" <> t."userId");
SELECT m.id, m."fixedCostId" FROM "FixedCostMonthly" m LEFT JOIN "FixedCost" f ON f.id = m."fixedCostId" WHERE f.id IS NULL;
SELECT id, email, document FROM "User" WHERE document LIKE 'google-%';
