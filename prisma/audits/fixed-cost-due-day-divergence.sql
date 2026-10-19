-- Read-only inventory for FEAT-018. Returns only an aggregate count.
SELECT COUNT(*)::bigint AS "divergentCount"
FROM "FixedCost"
WHERE "dueDay" <> EXTRACT(DAY FROM "startDate" AT TIME ZONE 'UTC')::integer;
