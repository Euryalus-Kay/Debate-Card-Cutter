ALTER TABLE "cards" ADD COLUMN "meta" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "meta_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "variant_of" text;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_variant_of_cards_id_fk" FOREIGN KEY ("variant_of") REFERENCES "public"."cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cards_variant_idx" ON "cards" USING btree ("variant_of");--> statement-breakpoint
ALTER TABLE "cards" DROP COLUMN "search";--> statement-breakpoint
ALTER TABLE "cards" ADD COLUMN "search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(tag, '')), 'A') || setweight(to_tsvector('simple', coalesce(short_cite, '')), 'A') || setweight(to_tsvector('english', coalesce(meta_text, '')), 'B') || setweight(to_tsvector('english', coalesce(plain_text, '')), 'C')) STORED;--> statement-breakpoint
CREATE INDEX "cards_search_idx" ON "cards" USING gin ("search");
