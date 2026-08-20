-- Member name search (attendance/member search boxes) uses ILIKE '%term%'
-- (leading wildcard), which a plain B-tree index cannot accelerate at all.
-- pg_trgm + GIN indexes support substring matching regardless of wildcard
-- position and scale to thousands of rows without a sequential scan per
-- keystroke. One index per column (not a combined expression index) so
-- each of firstName/middleName/lastName stays independently searchable,
-- matching the existing OR-based query in
-- attendance.repository.js#buildMemberWhere / #buildMemberFilterSql.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "members_firstName_trgm_idx" ON "members" USING GIN ("firstName" gin_trgm_ops);
CREATE INDEX "members_middleName_trgm_idx" ON "members" USING GIN ("middleName" gin_trgm_ops);
CREATE INDEX "members_lastName_trgm_idx" ON "members" USING GIN ("lastName" gin_trgm_ops);
