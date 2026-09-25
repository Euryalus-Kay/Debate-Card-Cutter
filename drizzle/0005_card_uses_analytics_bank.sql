CREATE TABLE "analytics_bank" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"round_id" text,
	"draft_id" text NOT NULL,
	"section_id" text NOT NULL,
	"speech" text NOT NULL,
	"position" text DEFAULT '' NOT NULL,
	"answers" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"analytic" text NOT NULL,
	"cites" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(answers, '')), 'A') || setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', coalesce(position, '')), 'B') || setweight(to_tsvector('english', coalesce(analytic, '')), 'C')) STORED
);
--> statement-breakpoint
CREATE TABLE "card_uses" (
	"team_id" text NOT NULL,
	"card_id" text NOT NULL,
	"draft_id" text NOT NULL,
	"round_id" text,
	"speech" text NOT NULL,
	"delivered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_uses_card_id_draft_id_pk" PRIMARY KEY("card_id","draft_id")
);
--> statement-breakpoint
ALTER TABLE "analytics_bank" ADD CONSTRAINT "analytics_bank_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_bank" ADD CONSTRAINT "analytics_bank_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_uses" ADD CONSTRAINT "card_uses_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_uses" ADD CONSTRAINT "card_uses_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_uses" ADD CONSTRAINT "card_uses_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_bank_section_idx" ON "analytics_bank" USING btree ("draft_id","section_id");--> statement-breakpoint
CREATE INDEX "analytics_bank_team_idx" ON "analytics_bank" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "analytics_bank_search_idx" ON "analytics_bank" USING gin ("search");--> statement-breakpoint
CREATE INDEX "card_uses_team_idx" ON "card_uses" USING btree ("team_id","delivered_at");