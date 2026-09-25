ALTER TABLE "rounds" ADD COLUMN "ai_policy" text DEFAULT 'prep_only' NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "phase" text DEFAULT 'prep' NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "ai_override" jsonb;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "speaker_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;