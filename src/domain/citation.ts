/**
 * Citations.
 *
 * Every field carries provenance. Missing information stays missing and is
 * rendered explicitly (e.g. "no date") rather than guessed.
 */

export type FieldProvenance =
  /** read from the source page/PDF itself (byline, masthead, author bio) */
  | "source"
  /** from a bibliographic database (Crossref, OpenAlex, ...) */
  | "metadata"
  /** entered or confirmed by a user */
  | "user"
  /** copied from an imported document's cite; not independently checked */
  | "imported"
  /** proposed by a model without verification: must be shown as unverified */
  | "ai_unverified";

export interface CitationAuthor {
  /** full display name as published, e.g. "Jane Q. Smith" */
  name: string;
  /** family name used for the short cite; derived from name if absent */
  family?: string;
  qualifications?: string;
  qualificationsProvenance?: FieldProvenance;
  /** where the qualification came from (URL or description), for later checking */
  qualificationsEvidence?: string;
}

export interface CitationDate {
  year?: number;
  month?: number;
  day?: number;
  /** original date text as found, e.g. "Spring 2024" */
  raw?: string;
}

export interface Citation {
  authors: CitationAuthor[];
  /** institutional author when there is no person (e.g. "Congressional Budget Office") */
  organization?: string;
  /** abbreviation used in the short cite, e.g. "CBO" */
  organizationShort?: string;
  date?: CitationDate;
  title?: string;
  /** journal, newspaper, website, or publisher */
  publication?: string;
  url?: string;
  doi?: string;
  pages?: string;
  /** ISO date the source was accessed */
  accessed?: string;
  cutterInitials?: string;
  /** provenance per field name */
  provenance: Partial<Record<CitationField, FieldProvenance>>;
  /** the cite text exactly as it appeared in an imported document */
  raw?: string;
  /** user override of the short cite (e.g. "Smith & Jones 23") */
  shortOverride?: string;
}

export type CitationField = "authors" | "organization" | "date" | "title" | "publication" | "url" | "doi" | "pages" | "accessed" | "qualifications";

export function emptyCitation(): Citation {
  return { authors: [], provenance: {} };
}

export function familyName(author: CitationAuthor): string {
  if (author.family?.trim()) return author.family.trim();
  const name = author.name.replace(/\s*,\s*(jr|sr|ii|iii|iv)\.?$/i, "").trim();
  // "Smith, Jane" → Smith
  if (name.includes(",")) return name.split(",")[0].trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  // Keep particles with the family name: "van der Berg", "de la Cruz"
  const particles = new Set(["van", "von", "der", "de", "la", "del", "da", "di", "le", "du", "st.", "bin", "al"]);
  let i = parts.length - 1;
  while (i > 1 && particles.has(parts[i - 1].toLowerCase())) i--;
  return parts.slice(i).join(" ");
}

export function twoDigitYear(date?: CitationDate): string | null {
  if (!date?.year) return null;
  return String(date.year % 100).padStart(2, "0");
}

/** "Smith 23", "Smith & Jones 23", "Smith et al. 23", "CBO 23", "Smith ND". */
export function shortCite(c: Citation): string {
  if (c.shortOverride?.trim()) return c.shortOverride.trim();
  const yy = twoDigitYear(c.date) ?? "ND";
  let who = "";
  if (c.authors.length === 1) who = familyName(c.authors[0]);
  else if (c.authors.length === 2) who = `${familyName(c.authors[0])} & ${familyName(c.authors[1])}`;
  else if (c.authors.length > 2) who = `${familyName(c.authors[0])} et al.`;
  else if (c.organizationShort) who = c.organizationShort;
  else if (c.organization) who = c.organization;
  else who = "Unknown author";
  return `${who} ${yy}`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function formatDate(d?: CitationDate, style: "long" | "numeric" = "long"): string | null {
  if (!d?.year) return d?.raw ?? null;
  if (style === "numeric") {
    if (d.month && d.day) return `${d.month}-${d.day}-${d.year}`;
    if (d.month) return `${d.month}-${d.year}`;
    return String(d.year);
  }
  if (d.month && d.day) return `${MONTHS[d.month - 1]} ${d.day}, ${d.year}`;
  if (d.month) return `${MONTHS[d.month - 1]} ${d.year}`;
  return String(d.year);
}

function formatAccessed(iso?: string): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${Number(m[2])}-${Number(m[3])}-${m[1]}`;
}

export interface CiteStyle {
  /** include "accessed M-D-YYYY" */
  includeAccessed: boolean;
  /** how to render unknown values */
  missing: "explicit" | "omit";
  dateStyle: "long" | "numeric";
}

export const DEFAULT_CITE_STYLE: CiteStyle = { includeAccessed: true, missing: "explicit", dateStyle: "long" };

/**
 * Full citation after the short cite, e.g.:
 *   Jane Smith, Professor of Political Science at Yale; "Title," Foreign Affairs, March 3, 2023, https://..., accessed 9-25-2026 //AB
 *
 * Qualifications that are not from the source, metadata, a user, or an imported
 * document are dropped (never shown as fact).
 */
export function fullCite(c: Citation, style: CiteStyle = DEFAULT_CITE_STYLE): string {
  const parts: string[] = [];
  const missing = (label: string) => (style.missing === "explicit" ? label : null);

  const authorBits = c.authors.map((a) => {
    const q = a.qualifications && a.qualificationsProvenance && a.qualificationsProvenance !== "ai_unverified" ? a.qualifications.trim() : "";
    return q ? `${a.name}, ${q}` : a.name;
  });
  if (authorBits.length) parts.push(authorBits.join("; "));
  else if (c.organization) parts.push(c.organization);
  else {
    const m = missing("no author listed");
    if (m) parts.push(m);
  }

  if (c.title) parts.push(`"${c.title.replace(/"/g, "'")},"`);
  if (c.publication) parts.push(c.publication);
  const date = formatDate(c.date, style.dateStyle);
  if (date) parts.push(date);
  else {
    const m = missing("no date");
    if (m) parts.push(m);
  }
  if (c.pages) parts.push(`pp. ${c.pages}`);
  if (c.doi) parts.push(`doi:${c.doi}`);
  if (c.url) parts.push(c.url);
  if (style.includeAccessed) {
    const acc = formatAccessed(c.accessed);
    if (acc) parts.push(`accessed ${acc}`);
  }
  // Commas after the quoted title are already embedded.
  let text = "";
  parts.forEach((p, i) => {
    if (i === 0) text = p;
    else if (text.endsWith(',"')) text += ` ${p}`;
    else text += `, ${p}`;
  });
  if (c.cutterInitials) text += ` //${c.cutterInitials}`;
  return text;
}

/** Fields that are missing or unverified, for display next to the cite. */
export function citationGaps(c: Citation): string[] {
  const gaps: string[] = [];
  if (!c.authors.length && !c.organization) gaps.push("author");
  if (!c.date?.year) gaps.push("date");
  if (!c.title) gaps.push("title");
  if (!c.publication) gaps.push("publication");
  if (!c.url && !c.doi) gaps.push("URL/DOI");
  const unverifiedQuals = c.authors.some((a) => a.qualifications && (!a.qualificationsProvenance || a.qualificationsProvenance === "ai_unverified"));
  if (c.authors.length && !c.authors.some((a) => a.qualifications)) gaps.push("qualifications");
  if (unverifiedQuals) gaps.push("unverified qualifications");
  return gaps;
}
