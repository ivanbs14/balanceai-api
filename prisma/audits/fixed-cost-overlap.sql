-- Read-only inventory of possible overlap between expense transactions and
-- fixed-cost monthly entries or projections. A row is a candidate, not proof
-- that the same payment was recorded twice.
-- Required psql variables: from_month and to_month, both YYYY-MM.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';
SELECT set_config('audit.from_month', :'from_month', true) AS from_month;
SELECT set_config('audit.to_month', :'to_month', true) AS to_month;
DO $$
BEGIN
  IF current_setting('audit.from_month') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    OR current_setting('audit.to_month') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    OR current_setting('audit.from_month') > current_setting('audit.to_month')
  THEN
    RAISE EXCEPTION 'Invalid audit window: use from_month <= to_month in YYYY-MM format';
  END IF;
END $$;

WITH expense_transactions AS (
  SELECT
    t.id,
    t."userId",
    t.name,
    t.amount,
    t.category,
    t."paymentStatus",
    t."isFixed",
    to_char(t."Date", 'YYYY-MM') AS competence,
    (extract(year FROM t."Date")::int * 12 + extract(month FROM t."Date")::int) AS month_index
  FROM "Transation" AS t
  WHERE t.type = 'EXPENSE'
    AND t."Date" >= (:'from_month' || '-01')::date
    AND t."Date" < ((:'to_month' || '-01')::date + interval '1 month')
), possible_overlaps AS (
  SELECT
    t."userId" AS user_id,
    t.competence,
    t.id AS transaction_id,
    f.id AS fixed_cost_id,
    m.id AS monthly_id,
    CASE WHEN m.id IS NULL THEN 'PROJECTION' ELSE 'PERSISTED' END AS fixed_source,
    t.name AS transaction_name,
    f.name AS fixed_cost_name,
    t.amount AS transaction_amount,
    match.fixed_amount,
    t.category,
    t."paymentStatus" AS transaction_status,
    coalesce(m.status::text, 'PENDING') AS fixed_status,
    t."isFixed" AS transaction_marked_fixed,
    match.same_normalized_name,
    CASE
      WHEN match.same_normalized_name AND t.amount = match.fixed_amount THEN 'NAME_AND_AMOUNT'
      WHEN match.same_normalized_name THEN 'NAME_ONLY'
      ELSE 'AMOUNT_ONLY'
    END AS match_basis
  FROM expense_transactions AS t
  JOIN "FixedCost" AS f
    ON f."userId" = t."userId"
   AND f.category = t.category
  LEFT JOIN "FixedCostMonthly" AS m
    ON m."fixedCostId" = f.id
   AND m.competence = t.competence
  CROSS JOIN LATERAL (
    SELECT
      coalesce(m.amount, f."defaultAmount") AS fixed_amount,
      regexp_replace(lower(btrim(t.name)), '[[:space:]]+', ' ', 'g') =
        regexp_replace(lower(btrim(f.name)), '[[:space:]]+', ' ', 'g') AS same_normalized_name
  ) AS match
  WHERE (t.amount = match.fixed_amount OR match.same_normalized_name)
    AND (
      m.status = 'PAID'
      OR (
        f."isActive"
        AND t.month_index >=
          (extract(year FROM f."startDate")::int * 12 + extract(month FROM f."startDate")::int)
        AND mod(
          t.month_index -
            (extract(year FROM f."startDate")::int * 12 + extract(month FROM f."startDate")::int),
          CASE f.recurrence
            WHEN 'MONTHLY' THEN 1
            WHEN 'BIMONTHLY' THEN 2
            WHEN 'QUARTERLY' THEN 3
            WHEN 'YEARLY' THEN 12
          END
        ) = 0
      )
    )
)
SELECT
  count(*) OVER () AS total_candidate_pairs,
  CASE
    WHEN transaction_marked_fixed OR same_normalized_name THEN 'PRIORITY_REVIEW'
    ELSE 'REVIEW'
  END AS review_priority,
  user_id,
  competence,
  transaction_id,
  fixed_cost_id,
  monthly_id,
  fixed_source,
  transaction_name,
  fixed_cost_name,
  transaction_amount,
  fixed_amount,
  category,
  transaction_status,
  fixed_status,
  transaction_marked_fixed,
  same_normalized_name,
  match_basis
FROM possible_overlaps
ORDER BY competence, user_id, review_priority, transaction_id, fixed_cost_id
LIMIT 500;

COMMIT;
