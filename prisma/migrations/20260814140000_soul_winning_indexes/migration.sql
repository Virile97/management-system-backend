-- Hot-path indexes for soul winning list/trends (no multi-tenant churchId in this schema).
CREATE INDEX IF NOT EXISTS "soul_wins_baptizedAt_idx" ON "soul_wins"("baptizedAt");

ALTER TABLE "soul_winning_goals" ADD COLUMN IF NOT EXISTS "year" INTEGER;

-- Use endAt year: for UTC+ offsets, Jan 1 local startAt can fall in the previous UTC year.
UPDATE "soul_winning_goals"
SET "year" = EXTRACT(YEAR FROM "endAt")::int
WHERE "period" = 'year';

CREATE UNIQUE INDEX IF NOT EXISTS "soul_winning_goals_year_key"
  ON "soul_winning_goals"("year")
  WHERE "year" IS NOT NULL;
