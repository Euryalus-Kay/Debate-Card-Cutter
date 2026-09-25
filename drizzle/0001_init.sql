CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"round_id" text,
	"doc_id" text,
	"kind" text NOT NULL,
	"target" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"instruction" text DEFAULT '' NOT NULL,
	"context_refs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mode" text DEFAULT 'fast' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"partial_text" text DEFAULT '' NOT NULL,
	"output" jsonb,
	"usage" jsonb,
	"error" text,
	"applied_at" timestamp with time zone,
	"applied_by" text,
	"dismissed_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"card_id" text NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"changed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"folder_id" text,
	"tag" text NOT NULL,
	"short_cite" text DEFAULT '' NOT NULL,
	"citation" jsonb NOT NULL,
	"body" jsonb NOT NULL,
	"origin" text NOT NULL,
	"verification_status" text NOT NULL,
	"verification" jsonb NOT NULL,
	"source_id" text,
	"body_hash" text NOT NULL,
	"commentary" text DEFAULT '' NOT NULL,
	"labels" text[] DEFAULT '{}'::text[] NOT NULL,
	"imported_from" jsonb,
	"plain_text" text DEFAULT '' NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('english', coalesce(tag, '')), 'A') || setweight(to_tsvector('simple', coalesce(short_cite, '')), 'A') || setweight(to_tsvector('english', coalesce(plain_text, '')), 'C')) STORED,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "doc_updates" (
	"seq" bigserial PRIMARY KEY NOT NULL,
	"doc_id" text NOT NULL,
	"update" "bytea" NOT NULL,
	"hash" text NOT NULL,
	"client_id" text DEFAULT '' NOT NULL,
	"user_id" text,
	"origin" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"doc_id" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"reason" text NOT NULL,
	"state" "bytea" NOT NULL,
	"seq_at" bigint NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"kind" text NOT NULL,
	"round_id" text,
	"speech" text,
	"title" text DEFAULT '' NOT NULL,
	"variant" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"snapshot" "bytea",
	"snapshot_seq" bigint DEFAULT 0 NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"stage" text DEFAULT '' NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"round_id" text,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"input" jsonb NOT NULL,
	"progress" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checkpoint" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_until" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"idempotency_key" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presence" (
	"doc_id" text NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text NOT NULL,
	"state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "presence_doc_id_client_id_pk" PRIMARY KEY("doc_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"tournament" text DEFAULT '' NOT NULL,
	"round_label" text DEFAULT '' NOT NULL,
	"division" text DEFAULT '' NOT NULL,
	"resolution" text DEFAULT '' NOT NULL,
	"format_id" text DEFAULT 'hs-standard' NOT NULL,
	"format_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"our_side" text NOT NULL,
	"roster" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"opponent" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"judges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"state_doc_id" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"url" text,
	"canonical_url" text,
	"doi" text,
	"title" text DEFAULT '' NOT NULL,
	"publication" text DEFAULT '' NOT NULL,
	"authors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_date" jsonb,
	"source_type" text DEFAULT 'web' NOT NULL,
	"retrieval" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"access" text DEFAULT 'unknown' NOT NULL,
	"text_hash" text,
	"text_length" integer DEFAULT 0 NOT NULL,
	"full_text" text,
	"text_format" text DEFAULT 'html' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" text,
	"expires_at" timestamp with time zone NOT NULL,
	"max_uses" integer DEFAULT 5 NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"initials" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"school" text DEFAULT '' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telemetry" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"team_id" text,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"ms" integer,
	"ok" boolean DEFAULT true NOT NULL,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload_blocks" (
	"upload_id" text NOT NULL,
	"idx" integer NOT NULL,
	"kind" text NOT NULL,
	"level" integer,
	"text" text NOT NULL,
	"data" jsonb,
	"path" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "upload_blocks_upload_id_idx_pk" PRIMARY KEY("upload_id","idx")
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"round_id" text,
	"purpose" text NOT NULL,
	"file_name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"blob_path" text,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"parse_result" jsonb,
	"attribution" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"rate_profile" jsonb,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_operations" ADD CONSTRAINT "ai_operations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_operations" ADD CONSTRAINT "ai_operations_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_operations" ADD CONSTRAINT "ai_operations_doc_id_documents_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_operations" ADD CONSTRAINT "ai_operations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_revisions" ADD CONSTRAINT "card_revisions_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cards" ADD CONSTRAINT "cards_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_updates" ADD CONSTRAINT "doc_updates_doc_id_documents_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_versions" ADD CONSTRAINT "doc_versions_doc_id_documents_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_blocks" ADD CONSTRAINT "upload_blocks_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_ops_round_idx" ON "ai_operations" USING btree ("round_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_ops_doc_idx" ON "ai_operations" USING btree ("doc_id","created_at");--> statement-breakpoint
CREATE INDEX "card_revisions_card_idx" ON "card_revisions" USING btree ("card_id","version");--> statement-breakpoint
CREATE INDEX "cards_team_updated_idx" ON "cards" USING btree ("team_id","updated_at");--> statement-breakpoint
CREATE INDEX "cards_team_hash_idx" ON "cards" USING btree ("team_id","body_hash");--> statement-breakpoint
CREATE INDEX "cards_search_idx" ON "cards" USING gin ("search");--> statement-breakpoint
CREATE INDEX "cards_tag_trgm_idx" ON "cards" USING gin ("tag" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "doc_updates_doc_seq_idx" ON "doc_updates" USING btree ("doc_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "doc_updates_doc_hash_uq" ON "doc_updates" USING btree ("doc_id","hash");--> statement-breakpoint
CREATE INDEX "doc_versions_doc_idx" ON "doc_versions" USING btree ("doc_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_team_kind_idx" ON "documents" USING btree ("team_id","kind","updated_at");--> statement-breakpoint
CREATE INDEX "documents_round_idx" ON "documents" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "folders_team_idx" ON "folders" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "job_events_job_idx" ON "job_events" USING btree ("job_id","id");--> statement-breakpoint
CREATE INDEX "jobs_team_idx" ON "jobs" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_idem_uq" ON "jobs" USING btree ("team_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status","lease_until");--> statement-breakpoint
CREATE INDEX "rounds_team_idx" ON "rounds" USING btree ("team_id","updated_at");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sources_team_idx" ON "sources" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_team_canonical_uq" ON "sources" USING btree ("team_id","canonical_url");--> statement-breakpoint
CREATE INDEX "team_invites_team_idx" ON "team_invites" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_members_user_idx" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "telemetry_kind_idx" ON "telemetry" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "uploads_team_idx" ON "uploads" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE INDEX "uploads_round_idx" ON "uploads" USING btree ("round_id");