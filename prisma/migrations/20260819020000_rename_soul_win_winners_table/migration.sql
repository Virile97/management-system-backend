-- RenameTable: Postgres carries the primary key, FKs, and indexes along
-- automatically — only their auto-generated names still say
-- "soul_win_winners" underneath, which is cosmetic and harmless.
ALTER TABLE "soul_win_winners" RENAME TO "soul_winners";
