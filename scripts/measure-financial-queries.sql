-- Fictional data only. Run against an isolated database named balance_test.
-- All inserted rows are rolled back. This measures selected query shapes, not production latency.
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'balance_test' THEN
    RAISE EXCEPTION 'Only balance_test is allowed';
  END IF;
END $$;

INSERT INTO "User" (id, name, email, role)
VALUES ('tech021-performance-user', 'Performance fixture', 'performance@example.test', 'user');

INSERT INTO "Transation" (id, name, type, amount, category, "paymentMethod", "paymentStatus", "Date", "updatedAt", "userId", withdrawal)
SELECT 'tech021-performance-' || sequence, 'Fixture', 'EXPENSE', 12.34, 'OTHER', 'PIX',
  CASE WHEN sequence % 2 = 0 THEN 'PAID'::"TransationPaymentStatus" ELSE 'PENDING'::"TransationPaymentStatus" END,
  TIMESTAMP '2026-01-01' + ((sequence % 365) || ' days')::interval,
  now(), 'tech021-performance-user', 'DEPOSIT'
FROM generate_series(1, 10000) AS sequence;

ANALYZE "Transation";

-- New public monthly ledger shape: stable order and bounded result.
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, amount, "Date" FROM "Transation"
WHERE "userId" = 'tech021-performance-user'
  AND "Date" >= TIMESTAMP '2026-10-01'
  AND "Date" < TIMESTAMP '2026-11-01'
ORDER BY "Date" DESC, id DESC LIMIT 100;

-- New monthly aggregate shape: only grouped values cross the application boundary.
EXPLAIN (ANALYZE, BUFFERS)
SELECT type, "paymentStatus", SUM(amount) FROM "Transation"
WHERE "userId" = 'tech021-performance-user'
  AND "Date" >= TIMESTAMP '2026-10-01'
  AND "Date" < TIMESTAMP '2026-11-01'
GROUP BY type, "paymentStatus";

-- Historical full read shape for comparison of returned row count.
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, amount, "Date" FROM "Transation"
WHERE "userId" = 'tech021-performance-user';

ROLLBACK;
