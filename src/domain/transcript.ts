/**
 * Transcripts (Phase C): uploaded or pasted captions and transcripts (WebVTT,
 * SRT, Otter-style or plain text) become flow-ready lines for the speech's
 * transcript pad, which the flow reader (extract_flow) turns into arguments.
 * Speaker names in a transcript stay plain text; no voice identification.
 */

export interface TranscriptLine {
  /** seconds from the start of the recording, when the file says */
  start: number | null;
  speaker: string | null;
  text: string;
}

export type TranscriptFormat = "vtt" | "srt" | "otter" | "text";

const TIME = /(\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?/;

function seconds(t: string): number {
  const [hms, frac = "0"] = t.replace(",", ".").split(".");
  const parts = hms.split(":").map(Number);
  const [h, m, s] = parts.length === 3 ? parts : [0, parts[0], parts[1]];
  return h * 3600 + m * 60 + s + Number(`0.${frac}`);
}

export function detectFormat(text: string, fileName = ""): TranscriptFormat {
  const t = text.trimStart();
  if (/\.vtt$/i.test(fileName) || t.startsWith("WEBVTT")) return "vtt";
  if (/\.srt$/i.test(fileName) || /^\d+\s*\r?\n\s*\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(t)) return "srt";
  // Otter and similar exports: a "Speaker Name  0:03" header line before each paragraph.
  if (/^[^\n]{1,60}\s{2,}\d{1,2}:\d{2}(:\d{2})?\s*$/m.test(t)) return "otter";
  return "text";
}

function stripTags(s: string): { speaker: string | null; text: string } {
  const voice = /<v(?:\.[^ >]+)?\s+([^>]+)>/.exec(s);
  return { speaker: voice ? voice[1].trim() : null, text: s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() };
}

export function parseTranscript(raw: string, fileName = ""): TranscriptLine[] {
  const text = raw.replace(/\r\n?/g, "\n");
  const format = detectFormat(text, fileName);
  const out: TranscriptLine[] = [];
  if (format === "vtt" || format === "srt") {
    for (const cue of text.split(/\n{2,}/)) {
      const lines = cue.split("\n").filter((l) => l.trim());
      const at = lines.findIndex((l) => l.includes("-->"));
      if (at < 0) continue;
      const start = TIME.exec(lines[at]);
      const body = lines.slice(at + 1).join(" ");
      const { speaker, text: t } = stripTags(body);
      if (t) out.push({ start: start ? seconds(start[0]) : null, speaker, text: t });
    }
  } else if (format === "otter") {
    let speaker: string | null = null;
    let start: number | null = null;
    for (const line of text.split("\n")) {
      const head = /^(.{1,60}?)\s{2,}((?:\d{1,2}:)?\d{1,2}:\d{2})\s*$/.exec(line);
      if (head) {
        speaker = head[1].trim();
        start = seconds(head[2]);
        continue;
      }
      if (line.trim()) out.push({ start, speaker, text: line.trim() });
    }
  } else {
    for (const line of text.split("\n")) if (line.trim()) out.push({ start: null, speaker: null, text: line.trim() });
  }
  // Consecutive caption cues repeat or split sentences; join them, drop exact repeats.
  const merged: TranscriptLine[] = [];
  for (const l of out) {
    const prev = merged[merged.length - 1];
    // Captions often repeat the previous cue (or its last words) as the next one.
    if (prev && (prev.text === l.text || prev.text.endsWith(l.text))) continue;
    if (prev && prev.speaker === l.speaker && !/[.!?]["”']?$/.test(prev.text) && prev.text.split(/\s+/).length < 40) prev.text = `${prev.text} ${l.text}`;
    else merged.push({ ...l });
  }
  return merged;
}

/**
 * Lines for the transcript pad: one line per sentence group of about 12–40
 * words (the flow reader handles up to three arguments per line).
 */
export function padLines(lines: TranscriptLine[], opts: { maxWords?: number } = {}): string[] {
  const maxWords = opts.maxWords ?? 40;
  const out: string[] = [];
  for (const l of lines) {
    const sentences = l.text.match(/[^.!?]+[.!?]+["”']?|[^.!?]+$/g) ?? [l.text];
    let cur = "";
    for (const s of sentences.map((x) => x.trim()).filter(Boolean)) {
      const next = cur ? `${cur} ${s}` : s;
      if (cur && next.split(/\s+/).length > maxWords) {
        out.push(cur);
        cur = s;
      } else cur = next;
    }
    if (cur) out.push(cur);
  }
  return out;
}
