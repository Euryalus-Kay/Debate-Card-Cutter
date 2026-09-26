CREATE TABLE "explanations" (
	"key" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "site_shared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "explanations" ADD CONSTRAINT "explanations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "explanations_team_idx" ON "explanations" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_site_shared_uq" ON "teams" USING btree ("site_shared") WHERE "teams"."site_shared";