CREATE TABLE "evidence_checks" (
	"team_id" text NOT NULL,
	"need_hash" text NOT NULL,
	"library_stamp" text NOT NULL,
	"fits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_checks_team_id_need_hash_pk" PRIMARY KEY("team_id","need_hash")
);
--> statement-breakpoint
ALTER TABLE "evidence_checks" ADD CONSTRAINT "evidence_checks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;