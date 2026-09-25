CREATE TABLE "rate_hits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "ai_monthly_cap_usd" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
CREATE INDEX "rate_hits_key_idx" ON "rate_hits" USING btree ("key","at");