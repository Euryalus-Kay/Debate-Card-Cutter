/**
 * Build a citation from what the source itself says (page metadata, byline
 * text) and from bibliographic databases. A field we could not establish is
 * left empty and shows up as a gap; nothing is guessed.
 */

import type { Citation, CitationAuthor, CitationDate, FieldProvenance } from "@/domain/citation";
import { normalizeText } from "@/domain/verify";
import type { SourceMetadata } from "./fetcher";

const JUNK_AUTHOR = /(https?:|www\.|@|\bstaff\b|\badmin\b|\beditor(ial)? board\b|\bcontributor\b|\bnewsroom\b|\bteam\b|^by$)/i;

export function cleanAuthorName(raw: string): string | null {
  const name = raw
    .replace(/^\s*by\s+/i, "")
    .replace(/\s*\|.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name || name.length > 60 || JUNK_AUTHOR.test(name)) return null;
  if (!/\p{L}/u.test(name)) return null;
  // A person's name has at least two parts ("lbowen" or "admin" is a CMS username, not an author).
  if (!/\s/.test(name.replace(/^(dr|prof)\.?\s+/i, ""))) return null;
  // ALL-CAPS bylines are typographic styling: "MARIA GARCIA-LOPEZ" → "Maria Garcia-Lopez"
  if (name === name.toUpperCase() && /\p{Lu}{2}/u.test(name)) {
    return cleanAuthorName(name.toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase()));
  }
  // "Smith, Jane" → "Jane Smith"
  const comma = /^([^,]+),\s*([^,]+)$/.exec(name);
  if (comma && !/\b(jr|sr|ii|iii|iv)\.?$/i.test(comma[2])) return `${comma[2]} ${comma[1]}`;
  return name;
}

export function splitAuthors(list: string[]): string[] {
  const out: string[] = [];
  for (const raw of list) {
    for (const part of raw.split(/\s*(?:;|\band\b|&)\s*/i)) {
      const n = cleanAuthorName(part);
      if (n && !out.some((o) => o.toLowerCase() === n.toLowerCase())) out.push(n);
    }
  }
  return out;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const monthOf = (word: string): number | undefined => MONTHS[word.slice(0, 3).toLowerCase()];

export function parseDate(raw: string | undefined | null): CitationDate | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  const sane = (d: CitationDate) => (d.year && d.year >= 1800 && d.year <= 2100 && (!d.month || (d.month >= 1 && d.month <= 12)) && (!d.day || (d.day >= 1 && d.day <= 31)) ? d : undefined);
  let m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s);
  if (m) return sane({ year: +m[1], month: +m[2] || undefined, day: m[3] ? +m[3] : undefined, raw: s });
  m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})/.exec(s);
  if (m) return sane({ year: +m[1], month: +m[2], day: +m[3], raw: s });
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return sane({ year: +m[3], month: +m[1], day: +m[2], raw: s });
  m = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/.exec(s);
  if (m && monthOf(m[1])) return sane({ year: +m[3], month: monthOf(m[1]), day: +m[2], raw: s });
  m = /\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/.exec(s);
  if (m && monthOf(m[2])) return sane({ year: +m[3], month: monthOf(m[2]), day: +m[1], raw: s });
  m = /\b([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/.exec(s);
  if (m && monthOf(m[1])) return sane({ year: +m[2], month: monthOf(m[1]), raw: s });
  m = /\b(1[89]\d{2}|20\d{2})\b/.exec(s);
  if (m) return sane({ year: +m[1], raw: s });
  return undefined;
}

function cleanTitle(title: string | undefined, siteName: string | undefined): string | undefined {
  if (!title) return undefined;
  let t = title.replace(/\s+/g, " ").trim();
  if (siteName) {
    const esc = siteName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`\\s*[|\\-–—:]\\s*${esc}\\s*$`, "i"), "").trim();
  }
  return t || undefined;
}

/** Does `quote` occur in the source text (typography-insensitive)? */
export function occursInSource(quote: string, sourceText: string): boolean {
  const q = normalizeText(quote, { caseFold: true });
  if (q.length < 3) return false;
  return normalizeText(sourceText, { caseFold: true, dehyphenate: true }).includes(q);
}

export interface BylineProposal {
  title?: string;
  publication?: string;
  authors: { name: string; nameEvidence: string; qualifications: string; qualificationsEvidence: string }[];
  organization: string;
  organizationEvidence: string;
  date: string;
  dateEvidence: string;
}

export interface CiteBuildInput {
  url: string;
  metadata: SourceMetadata;
  /** bibliographic metadata from OpenAlex/Crossref */
  bibliographic?: { authors?: string[]; date?: string; year?: number; venue?: string; doi?: string };
  /** model-read byline, accepted only where its evidence occurs in the source text */
  byline?: BylineProposal;
  sourceText: string;
  pages?: string;
  accessed: string;
  /** user-entered fields (pasted text) */
  user?: Partial<Pick<Citation, "title" | "publication" | "url" | "organization">> & { authors?: string[]; date?: string; qualifications?: string[] };
}

export interface CiteBuildResult {
  citation: Citation;
  /** fields a model proposed that could not be confirmed in the source (dropped) */
  rejected: string[];
}

export function buildCitation(input: CiteBuildInput): CiteBuildResult {
  const prov: Citation["provenance"] = {};
  const rejected: string[] = [];
  const md = input.metadata;
  let host = "";
  try {
    host = new URL(input.url).hostname.replace(/^www\./, "");
  } catch {
    /* no URL */
  }

  // Authors: user → page metadata → bibliographic database → byline found in the text.
  let authors: CitationAuthor[] = [];
  let authorProv: FieldProvenance | undefined;
  if (input.user?.authors?.length) {
    authors = splitAuthors(input.user.authors).map((name) => ({ name }));
    authorProv = "user";
  } else if (md.authors.length) {
    // A journal page may list only its corresponding author; the DOI record lists every author, in order.
    const bib = splitAuthors(input.bibliographic?.authors ?? []);
    const page = splitAuthors(md.authors);
    if (bib.length > page.length && page.every((a) => bib.some((b) => familyMatch(a, b)))) {
      authors = bib.map((name) => ({ name }));
      authorProv = "metadata";
    } else {
      authors = page.map((name) => ({ name }));
      authorProv = "source";
    }
  } else if (input.bibliographic?.authors?.length) {
    authors = splitAuthors(input.bibliographic.authors).map((name) => ({ name }));
    authorProv = "metadata";
  }
  const byline = input.byline;
  if (byline) {
    const verified = byline.authors.filter((a) => a.name.trim() && a.nameEvidence.trim() && occursInSource(a.nameEvidence, input.sourceText) && normalizeText(a.nameEvidence, { caseFold: true }).includes(normalizeText(a.name.split(" ").slice(-1)[0], { caseFold: true })));
    for (const a of byline.authors) {
      const known = authors.some((x) => familyMatch(x.name, a.name));
      if (a.name.trim() && !verified.includes(a) && !known) rejected.push(`author "${a.name}" (not found in the source text)`);
    }
    if (!authors.length && verified.length) {
      // A byline word that isn't a person's name ("Journalist.", "Staff") is dropped; an organization is kept for below.
      authors = verified.map((a) => ({ name: cleanAuthorName(a.name) ?? (isOrganizationName(a.name) ? a.name.trim() : "") })).filter((a) => a.name);
      authorProv = "source";
    }
    // Qualifications: only when the source text states them.
    for (const a of byline.authors) {
      if (!a.qualifications.trim()) continue;
      const target = authors.find((x) => familyMatch(x.name, a.name));
      if (target && a.qualificationsEvidence.trim() && occursInSource(a.qualificationsEvidence, input.sourceText)) {
        target.qualifications = a.qualifications.trim();
        target.qualificationsProvenance = "source";
        target.qualificationsEvidence = a.qualificationsEvidence.trim().slice(0, 400);
      } else {
        rejected.push(`qualifications for ${a.name} (not stated in the source text)`);
      }
    }
  }
  if (input.user?.qualifications?.length) {
    input.user.qualifications.forEach((q, i) => {
      if (authors[i] && q.trim()) {
        authors[i].qualifications = q.trim();
        authors[i].qualificationsProvenance = "user";
      }
    });
  }
  // Institutions listed as authors become the organization.
  let orgFromAuthors: string | undefined;
  if (authors.length && authors.every((a) => isOrganizationName(a.name))) {
    orgFromAuthors = authors[0].name;
    authors = [];
  } else authors = authors.filter((a) => !isOrganizationName(a.name));
  if (authors.length && authorProv) prov.authors = authorProv;
  if (authors.some((a) => a.qualifications)) prov.qualifications = authors.find((a) => a.qualificationsProvenance)?.qualificationsProvenance;

  // Organization (institutional author) when no person is named.
  let organization: string | undefined;
  if (!authors.length) {
    if (orgFromAuthors) {
      organization = orgFromAuthors;
      prov.organization = authorProv;
    } else if (input.user?.organization) {
      organization = input.user.organization;
      prov.organization = "user";
    } else if (byline?.organization.trim() && byline.organizationEvidence.trim() && occursInSource(byline.organizationEvidence, input.sourceText)) {
      organization = byline.organization.trim();
      prov.organization = "source";
    } else if (/\.(gov|mil|int)$/.test(host) && (md.siteName || md.publisher)) {
      organization = md.publisher || md.siteName;
      prov.organization = "source";
    }
  }

  // Date: user → page metadata → bibliographic → date line in the text.
  let date: CitationDate | undefined;
  if (input.user?.date) {
    date = parseDate(input.user.date);
    if (date) prov.date = "user";
  }
  if (!date && md.published) {
    date = parseDate(md.published);
    if (date) prov.date = "source";
  }
  if (!date && (input.bibliographic?.date || input.bibliographic?.year)) {
    date = parseDate(input.bibliographic.date ?? String(input.bibliographic.year));
    if (date) prov.date = "metadata";
  }
  if (!date && byline?.date.trim() && byline.dateEvidence.trim()) {
    if (occursInSource(byline.dateEvidence, input.sourceText)) {
      date = parseDate(byline.date) ?? parseDate(byline.dateEvidence);
      if (date) prov.date = "source";
    } else rejected.push(`date "${byline.date}" (not found in the source text)`);
  }

  let title = input.user?.title || cleanTitle(md.title, md.siteName);
  if (title) prov.title = input.user?.title ? "user" : "source";
  else if (byline?.title?.trim()) {
    if (occursInSource(byline.title, input.sourceText)) {
      title = byline.title.trim();
      prov.title = "source";
    } else rejected.push(`title "${byline.title}" (not found in the source text)`);
  }
  const needPub = !input.user?.publication && !md.publisher && !md.siteName && !input.bibliographic?.venue;
  const bylinePub = needPub && byline?.publication?.trim() && occursInSource(byline.publication, input.sourceText) ? byline.publication.trim() : undefined;
  const publication = input.user?.publication || md.publisher || md.siteName || input.bibliographic?.venue || bylinePub || host || undefined;
  if (publication) prov.publication = input.user?.publication ? "user" : md.publisher || md.siteName || bylinePub ? "source" : input.bibliographic?.venue ? "metadata" : "source";
  const url = input.user?.url || md.canonicalUrl || input.url || undefined;
  if (url) prov.url = input.user?.url ? "user" : "source";
  const doi = md.doi || input.bibliographic?.doi;
  if (doi) prov.doi = md.doi ? "source" : "metadata";
  if (input.pages) prov.pages = "source";

  return {
    citation: {
      authors,
      organization,
      date,
      title,
      publication,
      url: url && /^https?:/.test(url) ? url : undefined,
      doi,
      pages: input.pages,
      accessed: url ? input.accessed : undefined,
      provenance: prov,
    },
    rejected,
  };
}

const ORG_WORDS = /\b(Council|Institute|Institution|Center|Centre|Office|Department|Agency|Association|Foundation|University|College|Commission|Committee|Bureau|Organi[sz]ation|Board|Service|Administration|Corporation|Inc\.?|LLC|Ltd\.?|Group|Society|Coalition|Laborator(y|ies)|Network|Alliance|Project|Fund|Trust|Forum|Ministry|Authority|Secretariat|Program(me)?|Federation|Union|Academy|Academies|Initiative|Partnership|Consortium|Taskforce|Task Force|Editorial Board)\b/;

/** "Climate Leadership Council" is an institutional author, not a person named Council. */
export function isOrganizationName(name: string): boolean {
  return ORG_WORDS.test(name);
}

function familyMatch(a: string, b: string): boolean {
  const last = (s: string) => s.trim().split(/\s+/).pop()?.toLowerCase() ?? "";
  return last(a) === last(b);
}
