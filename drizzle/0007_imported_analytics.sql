ALTER TABLE "analytics_bank" ADD COLUMN "source" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_bank" ADD COLUMN "side" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "analytics_bank" ADD COLUMN "upload_id" text;--> statement-breakpoint
ALTER TABLE "analytics_bank" ADD CONSTRAINT "analytics_bank_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;