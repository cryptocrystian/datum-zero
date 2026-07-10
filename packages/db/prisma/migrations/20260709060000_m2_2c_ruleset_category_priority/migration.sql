-- M2-2c / CR-30 — client category→priority map on the RuleSet (additive; CR-15 completion).

ALTER TABLE "RuleSet" ADD COLUMN "categoryPriority" JSONB;
