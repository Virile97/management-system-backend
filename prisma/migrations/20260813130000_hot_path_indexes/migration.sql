-- Hot-path indexes for member/finance/attendance/dashboard queries
CREATE INDEX IF NOT EXISTS "members_createdAt_idx" ON "members"("createdAt");
CREATE INDEX IF NOT EXISTS "transactions_typeId_createdAt_idx" ON "transactions"("typeId", "createdAt");
CREATE INDEX IF NOT EXISTS "activity_logs_action_createdAt_idx" ON "activity_logs"("action", "createdAt");
