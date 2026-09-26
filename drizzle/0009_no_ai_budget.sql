ALTER TABLE "teams" ALTER COLUMN "ai_monthly_cap_usd" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "ai_monthly_cap_usd" DROP NOT NULL;