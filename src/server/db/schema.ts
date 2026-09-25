/**
 * Database schema (Postgres / Neon).
 *
 * - Auth tables follow Better Auth's core model (user, session, account, verification).
 * - Every team-owned row carries team_id; all access goes through server-side
 *   authorization helpers that check membership (see server/authz.ts).
 * - Collaborative documents (round state, speech drafts, library files) are Yjs
 *   CRDT documents: an append-only update log plus compacted snapshots.
 */

import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Uint8Array; driverData: string | Uint8Array | Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Uint8Array) {
    // Both drivers accept binary parameters (Neon serializes them as hex bytea).
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  },
  fromDriver(value: string | Uint8Array | Buffer) {
    if (typeof value === "string") {
      const hex = value.startsWith("\\x") ? value.slice(2) : value;
      return new Uint8Array(Buffer.from(hex, "hex"));
    }
    return new Uint8Array(value);
  },
});

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

// ---------------------------------------------------------------------------
// Auth (Better Auth core)
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export const teams = pgTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  school: text("school").notNull().default(""),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "member"] }).notNull().default("member"),
    /** initials used when this member cuts cards */
    initials: text("initials").notNull().default(""),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] }), index("team_members_user_idx").on(t.userId)],
);

export const teamInvites = pgTable(
  "team_invites",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    /** sha256 of the invite token; the raw token only ever appears in the link */
    tokenHash: text("token_hash").notNull().unique(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    expiresAt: ts("expires_at").notNull(),
    maxUses: integer("max_uses").notNull().default(5),
    uses: integer("uses").notNull().default(0),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("team_invites_team_idx").on(t.teamId)],
);

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** speaking-rate profile (domain/timing RateProfile) */
  rateProfile: jsonb("rate_profile"),
  preferences: jsonb("preferences").notNull().default(sql`'{}'::jsonb`),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

export const rounds = pgTable(
  "rounds",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    tournament: text("tournament").notNull().default(""),
    roundLabel: text("round_label").notNull().default(""),
    division: text("division").notNull().default(""),
    resolution: text("resolution").notNull().default(""),
    formatId: text("format_id").notNull().default("hs-standard"),
    formatOverrides: jsonb("format_overrides").notNull().default(sql`'{}'::jsonb`),
    ourSide: text("our_side", { enum: ["aff", "neg"] }).notNull(),
    /** role → member user id, e.g. {"1A": "...", "2A": "..."} */
    roster: jsonb("roster").notNull().default(sql`'{}'::jsonb`),
    opponent: jsonb("opponent").notNull().default(sql`'{}'::jsonb`),
    /** [{name, paradigmText, paradigmUrl, notes}] */
    judges: jsonb("judges").notNull().default(sql`'[]'::jsonb`),
    status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
    /** tournament AI rule for this round (COMP-1): allowed, prep_only (off once live), off */
    aiPolicy: text("ai_policy", { enum: ["allowed", "prep_only", "off"] }).notNull().default("prep_only"),
    /** prep before the round, live during it, done after */
    phase: text("phase", { enum: ["prep", "live", "done"] }).notNull().default("prep"),
    /** logged acknowledgement when a user overrides the AI policy: {by, at, reason} */
    aiOverride: jsonb("ai_override"),
    /** per-speech speaker overrides (FMT-2), e.g. {"1AR": "<userId>"} */
    speakerOverrides: jsonb("speaker_overrides").notNull().default(sql`'{}'::jsonb`),
    /** misc settings: omissionPolicy, judgeKick, newArgumentPolicy overrides */
    settings: jsonb("settings").notNull().default(sql`'{}'::jsonb`),
    /** the Yjs document holding flow/round state */
    stateDocId: text("state_doc_id").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("rounds_team_idx").on(t.teamId, t.updatedAt)],
);

// ---------------------------------------------------------------------------
// Collaborative documents (Yjs)
// ---------------------------------------------------------------------------

export const documents = pgTable(
  "documents",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["round_state", "speech_draft", "library_file", "notes"] }).notNull(),
    roundId: text("round_id").references(() => rounds.id, { onDelete: "cascade" }),
    /** for speech drafts: "1AC" … "2AR" */
    speech: text("speech"),
    title: text("title").notNull().default(""),
    /** label for alternative strategies ("Alt: kick the CP") */
    variant: text("variant").notNull().default(""),
    status: text("status", { enum: ["draft", "delivered", "archived"] }).notNull().default("draft"),
    /** merged Yjs state up to snapshotSeq */
    snapshot: bytea("snapshot"),
    snapshotSeq: bigint("snapshot_seq", { mode: "number" }).notNull().default(0),
    /** last per-document sequence number handed out (bumped under the row lock) */
    headSeq: bigint("head_seq", { mode: "number" }).notNull().default(0),
    /** plain text for search, refreshed on compaction */
    searchText: text("search_text").notNull().default(""),
    meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deliveredAt: ts("delivered_at"),
  },
  (t) => [index("documents_team_kind_idx").on(t.teamId, t.kind, t.updatedAt), index("documents_round_idx").on(t.roundId)],
);

export const docUpdates = pgTable(
  "doc_updates",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    /** per-document sequence; commit order equals seq order (see store.push) */
    seq: bigint("seq", { mode: "number" }).notNull(),
    docId: text("doc_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    update: bytea("update").notNull(),
    hash: text("hash").notNull(),
    clientId: text("client_id").notNull().default(""),
    userId: text("user_id"),
    /** "user" | "ai:<opId>" | "import" | "system" */
    origin: text("origin").notNull().default("user"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("doc_updates_doc_seq_uq").on(t.docId, t.seq), uniqueIndex("doc_updates_doc_hash_uq").on(t.docId, t.hash)],
);

export const docVersions = pgTable(
  "doc_versions",
  {
    id: text("id").primaryKey(),
    docId: text("doc_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    label: text("label").notNull().default(""),
    reason: text("reason", { enum: ["manual", "ai_apply", "auto", "delivered", "restore", "import", "before_restore"] }).notNull(),
    state: bytea("state").notNull(),
    seqAt: bigint("seq_at", { mode: "number" }).notNull(),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("doc_versions_doc_idx").on(t.docId, t.createdAt)],
);

export const presence = pgTable(
  "presence",
  {
    docId: text("doc_id").notNull(),
    clientId: text("client_id").notNull(),
    userId: text("user_id").notNull(),
    state: jsonb("state").notNull().default(sql`'{}'::jsonb`),
    seenAt: ts("seen_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.docId, t.clientId] })],
);

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

export const uploads = pgTable(
  "uploads",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    roundId: text("round_id").references(() => rounds.id, { onDelete: "set null" }),
    purpose: text("purpose", { enum: ["speech_doc", "library_file", "source_pdf", "other"] }).notNull(),
    fileName: text("file_name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    /** private blob pathname, or null when stored inline */
    blobPath: text("blob_path"),
    status: text("status", { enum: ["uploaded", "parsing", "parsed", "failed"] }).notNull().default("uploaded"),
    /** parse summary: counts, warnings, extraction quality */
    parseResult: jsonb("parse_result"),
    /** attribution: which speech it claims to be, who uploaded, whether confirmed */
    attribution: jsonb("attribution").notNull().default(sql`'{}'::jsonb`),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("uploads_team_idx").on(t.teamId, t.createdAt), index("uploads_round_idx").on(t.roundId)],
);

/** Parsed structure of an uploaded document, kept so AI and flow can cite exact blocks. */
export const uploadBlocks = pgTable(
  "upload_blocks",
  {
    uploadId: text("upload_id")
      .notNull()
      .references(() => uploads.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    /** heading | card | analytic */
    kind: text("kind").notNull(),
    level: integer("level"),
    text: text("text").notNull(),
    /** for cards: {tag, cite, body} in the card model */
    data: jsonb("data"),
    path: jsonb("path").notNull().default(sql`'[]'::jsonb`),
  },
  (t) => [primaryKey({ columns: [t.uploadId, t.idx] })],
);

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export const folders = pgTable(
  "folders",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("folders_team_idx").on(t.teamId)],
);

export const sources = pgTable(
  "sources",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    url: text("url"),
    canonicalUrl: text("canonical_url"),
    doi: text("doi"),
    title: text("title").notNull().default(""),
    publication: text("publication").notNull().default(""),
    /** CitationAuthor[] with provenance */
    authors: jsonb("authors").notNull().default(sql`'[]'::jsonb`),
    publishedDate: jsonb("published_date"),
    sourceType: text("source_type").notNull().default("web"),
    /** how the text was obtained: {method, provider, httpStatus, contentType, fetchedAt} */
    retrieval: jsonb("retrieval").notNull().default(sql`'{}'::jsonb`),
    access: text("access", { enum: ["open", "paywalled_excerpt", "user_provided", "unknown"] }).notNull().default("unknown"),
    textHash: text("text_hash"),
    textLength: integer("text_length").notNull().default(0),
    /** full extracted text used for quoting and verification */
    fullText: text("full_text"),
    /** "pdf" text needs dehyphenation during verification */
    textFormat: text("text_format", { enum: ["html", "pdf", "plain", "docx"] }).notNull().default("html"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sources_team_idx").on(t.teamId), uniqueIndex("sources_team_canonical_uq").on(t.teamId, t.canonicalUrl)],
);

export const cards = pgTable(
  "cards",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    folderId: text("folder_id").references(() => folders.id, { onDelete: "set null" }),
    tag: text("tag").notNull(),
    shortCite: text("short_cite").notNull().default(""),
    citation: jsonb("citation").notNull(),
    body: jsonb("body").notNull(),
    origin: text("origin", { enum: ["ai_cut", "user_cut", "imported", "legacy_import"] }).notNull(),
    verificationStatus: text("verification_status", { enum: ["verified", "verified_quote_only", "imported", "unverified", "mismatch"] }).notNull(),
    verification: jsonb("verification").notNull(),
    sourceId: text("source_id").references(() => sources.id, { onDelete: "set null" }),
    bodyHash: text("body_hash").notNull(),
    commentary: text("commentary").notNull().default(""),
    labels: text("labels").array().notNull().default(sql`'{}'::text[]`),
    /** provenance of an import: {uploadId, fileName, paragraph} */
    importedFrom: jsonb("imported_from"),
    plainText: text("plain_text").notNull().default(""),
    /** labels from the library (Phase B): {side, argType, position, role, claim, topics} */
    meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),
    /** the labels as words, searched alongside the tag */
    metaText: text("meta_text").notNull().default(""),
    /** a near-duplicate of this card (same evidence, different tag or highlighting) */
    variantOf: text("variant_of").references((): AnyPgColumn => cards.id, { onDelete: "set null" }),
    search: tsvector("search").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(tag, '')), 'A') || setweight(to_tsvector('simple', coalesce(short_cite, '')), 'A') || setweight(to_tsvector('english', coalesce(meta_text, '')), 'B') || setweight(to_tsvector('english', coalesce(plain_text, '')), 'C')`,
    ),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [
    index("cards_team_updated_idx").on(t.teamId, t.updatedAt),
    index("cards_team_hash_idx").on(t.teamId, t.bodyHash),
    index("cards_search_idx").using("gin", t.search),
    index("cards_tag_trgm_idx").using("gin", sql`${t.tag} gin_trgm_ops`),
    index("cards_variant_idx").on(t.variantOf),
  ],
);

export const cardRevisions = pgTable(
  "card_revisions",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    reason: text("reason").notNull().default(""),
    changedBy: text("changed_by"),
    createdAt: createdAt(),
  },
  (t) => [index("card_revisions_card_idx").on(t.cardId, t.version)],
);

// ---------------------------------------------------------------------------
// AI operations and background jobs
// ---------------------------------------------------------------------------

export const aiOperations = pgTable(
  "ai_operations",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    roundId: text("round_id").references(() => rounds.id, { onDelete: "cascade" }),
    docId: text("doc_id").references(() => documents.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    /** {sectionIds, argIds, speech} */
    target: jsonb("target").notNull().default(sql`'{}'::jsonb`),
    instruction: text("instruction").notNull().default(""),
    /** hashes/versions of every input so stale results can be detected */
    contextRefs: jsonb("context_refs").notNull().default(sql`'{}'::jsonb`),
    mode: text("mode", { enum: ["fast", "deep"] }).notNull().default("fast"),
    model: text("model").notNull().default(""),
    status: text("status", { enum: ["queued", "streaming", "complete", "failed", "cancelled"] }).notNull().default("queued"),
    partialText: text("partial_text").notNull().default(""),
    output: jsonb("output"),
    usage: jsonb("usage"),
    error: text("error"),
    appliedAt: ts("applied_at"),
    appliedBy: text("applied_by"),
    dismissedAt: ts("dismissed_at"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ai_ops_round_idx").on(t.roundId, t.createdAt), index("ai_ops_doc_idx").on(t.docId, t.createdAt)],
);

export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    roundId: text("round_id").references(() => rounds.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    status: text("status", { enum: ["queued", "running", "awaiting_approval", "succeeded", "partial", "failed", "cancelled"] }).notNull().default("queued"),
    input: jsonb("input").notNull(),
    /** stage-by-stage progress: [{stage, status, detail}] */
    progress: jsonb("progress").notNull().default(sql`'[]'::jsonb`),
    /** durable intermediate state for resumption */
    checkpoint: jsonb("checkpoint").notNull().default(sql`'{}'::jsonb`),
    result: jsonb("result"),
    error: text("error"),
    cancelRequested: boolean("cancel_requested").notNull().default(false),
    attempts: integer("attempts").notNull().default(0),
    leaseUntil: ts("lease_until"),
    heartbeatAt: ts("heartbeat_at"),
    idempotencyKey: text("idempotency_key"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("jobs_team_idx").on(t.teamId, t.createdAt), uniqueIndex("jobs_idem_uq").on(t.teamId, t.idempotencyKey), index("jobs_status_idx").on(t.status, t.leaseUntil)],
);

export const jobEvents = pgTable(
  "job_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    level: text("level", { enum: ["info", "warn", "error"] }).notNull().default("info"),
    stage: text("stage").notNull().default(""),
    message: text("message").notNull(),
    data: jsonb("data"),
    createdAt: createdAt(),
  },
  (t) => [index("job_events_job_idx").on(t.jobId, t.id)],
);

/**
 * Which library cards fit a need (B2), cached per team and need: valid while the library is unchanged
 * (`libraryStamp`), so drafts and updates reuse checks made after each flow update.
 */
export const evidenceChecks = pgTable(
  "evidence_checks",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    needHash: text("need_hash").notNull(),
    libraryStamp: text("library_stamp").notNull(),
    /** [{ cardId, fit, use }] for cards that fit (2–3), and the sides of every card checked */
    fits: jsonb("fits").notNull().default([]),
    sides: jsonb("sides").notNull().default({}),
    checkedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.needHash] })],
);

/** Measured latencies and failures for model/provider calls (instrumentation). */
export const telemetry = pgTable(
  "telemetry",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    teamId: text("team_id"),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    ms: integer("ms"),
    ok: boolean("ok").notNull().default(true),
    data: jsonb("data"),
    createdAt: createdAt(),
  },
  (t) => [index("telemetry_kind_idx").on(t.kind, t.createdAt)],
);
