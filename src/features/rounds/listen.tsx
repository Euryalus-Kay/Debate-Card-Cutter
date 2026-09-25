"use client";

/**
 * Flowing by listening (Phase C). Capture the other team's speech from a
 * browser tab (Zoom in the browser, NSDA Campus), from the Zoom app through
 * the screen share's system audio (Chrome 141+ on macOS 14.2+, Windows,
 * ChromeOS), or from the microphone in person. Every session starts with a
 * click, Chrome's own picker, and a consent check. Audio goes out in 20-second
 * segments to the transcription route (OpenAI gpt-transcribe on the parent's
 * account); without it, Chrome's on-device speech recognition is used. Text
 * lands in the speech's transcript pad, which the flow reader handles like
 * typed notes. Nothing is recorded or kept beyond the transcription.
 */

import { upload } from "@vercel/blob/client";
import { useEffect, useRef, useState } from "react";
import type * as Y from "yjs";
import { Ear, Mic, MonitorUp, AppWindow, Square, Upload } from "lucide-react";
import { Button, Dialog, Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger, Textarea, toast } from "@/components/ui";
import type { SpeechId } from "@/domain/format";
import { padLines, parseTranscript } from "@/domain/transcript";
import { appendTranscript, transcriptKey } from "@/shared/round-doc";

type Source = "tab" | "screen" | "mic";
type Engine = "server" | "browser";

const SEGMENT_MS = 20_000;
const CONSENT_KEY = "clash.listen.consent";

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  processLocally?: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: (track?: MediaStreamTrack) => void;
  stop: () => void;
}

function speechRecognition(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

async function capture(source: Source): Promise<MediaStream> {
  if (source === "mic") return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: { suppressLocalAudioPlayback: false } as MediaTrackConstraints,
    ...(source === "tab" ? { preferCurrentTab: false, selfBrowserSurface: "exclude", surfaceSwitching: "include" } : { systemAudio: "include", monitorTypeSurfaces: "include" }),
  } as DisplayMediaStreamOptions);
  // Only the sound is used.
  for (const t of stream.getVideoTracks()) t.stop();
  if (!stream.getAudioTracks().length) {
    for (const t of stream.getTracks()) t.stop();
    throw new Error(source === "tab" ? "No sound was shared. Pick the tab again and turn on “Also share tab audio”." : "No sound was shared. Share the entire screen and turn on “Also share system audio” (Chrome 141+).");
  }
  return new MediaStream(stream.getAudioTracks());
}

export function useListener(opts: { roundId: string; doc: Y.Doc; speech: SpeechId; keywords: () => string }) {
  const [state, setState] = useState<{ status: "idle" | "listening"; source: Source | null; engine: Engine | null; startedAt: number; segments: number; lastError: string | null }>({ status: "idle", source: null, engine: null, startedAt: 0, segments: 0, lastError: null });
  const live = useRef<{ stream: MediaStream | null; recorder: MediaRecorder | null; timer: ReturnType<typeof setTimeout> | null; recognition: SpeechRecognitionLike | null; stopped: boolean; speech: SpeechId; engine: Engine; source: Source | null }>({ stream: null, recorder: null, timer: null, recognition: null, stopped: true, speech: opts.speech, engine: "server", source: null });
  // Text goes to the speech that's open now (switch speeches while listening to move on to the next one).
  useEffect(() => {
    live.current.speech = opts.speech;
  }, [opts.speech]);

  const add = (text: string) => {
    if (!text.trim()) return;
    opts.doc.transact(() => appendTranscript(opts.doc, live.current.speech, padLines([{ start: null, speaker: null, text }])));
  };

  async function sendSegment(blob: Blob) {
    const form = new FormData();
    form.set("roundId", opts.roundId);
    form.set("audio", new File([blob], "segment.webm", { type: blob.type || "audio/webm" }));
    form.set("keywords", opts.keywords());
    form.set("previous", opts.doc.getText(transcriptKey(live.current.speech)).toString().slice(-600));
    const res = await fetch("/api/transcribe", { method: "POST", body: form, credentials: "same-origin" });
    if (res.status === 501) {
      // No server speech-to-text: switch to the browser's own recognition for the rest of the session.
      switchToBrowser();
      return;
    }
    if (!res.ok) {
      const msg = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `Speech-to-text failed (${res.status}).`;
      setState((s) => ({ ...s, lastError: msg }));
      return;
    }
    const { text } = (await res.json()) as { text: string };
    add(text);
    setState((s) => ({ ...s, segments: s.segments + 1, lastError: null }));
  }

  function recordSegment() {
    const L = live.current;
    if (L.stopped || !L.stream || L.engine !== "server") return;
    const type = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
    const rec = new MediaRecorder(L.stream, type ? { mimeType: type, audioBitsPerSecond: 32_000 } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: rec.mimeType });
      if (blob.size > 2000) void sendSegment(blob).catch(() => setState((s) => ({ ...s, lastError: "Couldn't reach speech-to-text; keep typing." })));
    };
    rec.start();
    L.recorder = rec;
    // A new recorder each segment makes every segment a complete, playable file.
    L.timer = setTimeout(() => {
      if (rec.state !== "inactive") rec.stop();
      recordSegment();
    }, SEGMENT_MS);
  }

  function switchToBrowser() {
    const L = live.current;
    if (L.engine === "browser" || L.stopped) return;
    L.engine = "browser";
    if (L.timer) clearTimeout(L.timer);
    if (L.recorder && L.recorder.state !== "inactive") L.recorder.stop();
    const SR = speechRecognition();
    if (!SR) {
      setState((s) => ({ ...s, lastError: "This browser can't transcribe on its own. Use Chrome, or type what you hear." }));
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    try {
      rec.processLocally = true;
    } catch {
      /* older Chrome */
    }
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) add(e.results[i][0].transcript);
      setState((s) => ({ ...s, segments: s.segments + 1 }));
    };
    rec.onerror = (e) => setState((s) => ({ ...s, lastError: e.error === "not-allowed" ? "Speech recognition was blocked." : null }));
    // Sessions end after a pause; keep going until stopped.
    rec.onend = () => {
      if (!live.current.stopped && live.current.engine === "browser") startRecognition(rec);
    };
    L.recognition = rec;
    startRecognition(rec);
    setState((s) => ({ ...s, engine: "browser" }));
  }

  function startRecognition(rec: SpeechRecognitionLike) {
    const track = live.current.stream?.getAudioTracks()[0];
    try {
      // Chrome 135+ can listen to a captured tab's track; the microphone needs no track.
      if (track && live.current.source !== "mic") rec.start(track);
      else rec.start();
    } catch {
      // Older Chrome can't take a captured track: recognition then needs the microphone.
      try {
        rec.start();
      } catch {
        /* already started */
      }
    }
  }

  async function start(source: Source) {
    try {
      const stream = await capture(source);
      const L = live.current;
      L.stream = stream;
      L.stopped = false;
      L.engine = "server";
      L.source = source;
      for (const t of stream.getAudioTracks()) t.onended = () => stop();
      setState({ status: "listening", source, engine: "server", startedAt: Date.now(), segments: 0, lastError: null });
      recordSegment();
    } catch (e) {
      const msg = (e as Error).name === "NotAllowedError" ? "Sharing was cancelled or blocked (school computers can block it). Type what you hear instead." : (e as Error).message;
      toast(msg, "warn");
    }
  }

  function stop() {
    const L = live.current;
    L.stopped = true;
    if (L.timer) clearTimeout(L.timer);
    if (L.recorder && L.recorder.state !== "inactive") L.recorder.stop();
    L.recognition?.stop();
    for (const t of L.stream?.getTracks() ?? []) t.stop();
    L.stream = null;
    L.recognition = null;
    setState((s) => ({ ...s, status: "idle" }));
  }

  useEffect(() => () => stop(), []);
  return { state, start, stop, add };
}

/** The "Listen" control and transcript upload, for one opponent speech. */
export function ListenControls({ roundId, teamId, doc, speech, recordingAllowed, keywords }: { roundId: string; teamId: string; doc: Y.Doc; speech: SpeechId; recordingAllowed: boolean; keywords: () => string }) {
  const listener = useListener({ roundId, doc, speech, keywords });
  const [consentFor, setConsentFor] = useState<Source | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [paste, setPaste] = useState(false);
  const [pasted, setPasted] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const listening = listener.state.status === "listening";
  useEffect(() => {
    if (!listening) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [listening]);

  function begin(source: Source) {
    let ok = false;
    try {
      ok = sessionStorage.getItem(CONSENT_KEY) === roundId;
    } catch {
      /* ignore */
    }
    if (ok) void listener.start(source);
    else {
      setAgreed(false);
      setConsentFor(source);
    }
  }

  async function uploadFile(file: File) {
    if (/\.(vtt|srt|txt)$/i.test(file.name) || file.type.startsWith("text/")) {
      const lines = padLines(parseTranscript(await file.text(), file.name));
      doc.transact(() => appendTranscript(doc, speech, lines));
      toast(`Added ${lines.length} transcript line${lines.length === 1 ? "" : "s"} to their ${speech}. They go on the flow like typed notes.`, "ok");
      return;
    }
    if (!file.type.startsWith("audio/") && !/\.(m4a|mp3|wav|webm|ogg|aac)$/i.test(file.name)) return toast(recordingAllowed ? "Upload a recording (m4a, mp3, wav, webm) or a transcript (vtt, srt, txt)." : "Upload a transcript (vtt, srt, txt).", "warn");
    if (!recordingAllowed) return toast("This round's rules don't allow recordings. Paste or upload a transcript, or type what you hear.", "warn");
    if (file.size > 25 * 1024 * 1024) return toast("Recordings over 25 MB: upload one speech at a time (about 25 minutes), or paste a transcript.", "warn");
    const form = new FormData();
    form.set("roundId", roundId);
    form.set("keywords", keywords());
    form.set("fileName", file.name);
    if (file.size > 4 * 1024 * 1024) {
      // Too big for one request: straight to the team's storage first, deleted once transcribed.
      toast("Uploading the recording…");
      try {
        const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(0, 120);
        const blob = await upload(`teams/${teamId}/incoming/${safe}`, file, { access: "private", handleUploadUrl: "/api/blob/upload", clientPayload: JSON.stringify({ teamId, purpose: "recording" }), multipart: file.size > 8 * 1024 * 1024 });
        form.set("pathname", blob.pathname);
      } catch (e) {
        return toast(`Couldn't upload the recording: ${(e as Error).message}`, "bad");
      }
    } else form.set("audio", file);
    toast("Transcribing the recording…");
    const res = await fetch("/api/transcribe", { method: "POST", body: form, credentials: "same-origin" });
    const out = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
    if (!res.ok || !out.text) return toast(out.error ?? "Couldn't transcribe that recording.", "bad");
    const lines = padLines([{ start: null, speaker: null, text: out.text }]);
    doc.transact(() => appendTranscript(doc, speech, lines));
    toast(`Transcribed: ${lines.length} lines added to their ${speech}. The recording wasn't kept.`, "ok");
  }

  const elapsed = Math.max(0, Math.round((now - listener.state.startedAt) / 1000));
  return (
    <div className="flex items-center gap-1.5">
      {listening ? (
        <div className="flex items-center gap-1.5 rounded-md bg-bad-soft px-2 py-1 text-[12px] text-bad" role="status">
          <span className="size-2 animate-pulse rounded-full bg-bad" />
          Listening · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
          {listener.state.engine === "browser" ? " · on-device" : ""}
          <Button size="xs" variant="ghost" onClick={listener.stop} aria-label="Stop listening">
            <Square className="size-3" /> Stop
          </Button>
        </div>
      ) : (
        <Menu>
          <MenuTrigger asChild>
            <Button size="sm" variant="ghost">
              <Ear className="size-3.5" /> Listen
            </Button>
          </MenuTrigger>
          <MenuContent align="end">
            <MenuLabel>{recordingAllowed ? "Transcribe their speech into the notes" : "This round's rules don't allow recording"}</MenuLabel>
            <MenuItem disabled={!recordingAllowed} onSelect={() => begin("tab")}>
              <AppWindow className="size-3.5" /> A browser tab (Zoom web, NSDA Campus)
            </MenuItem>
            <MenuItem disabled={!recordingAllowed} onSelect={() => begin("screen")}>
              <MonitorUp className="size-3.5" /> The Zoom app (screen + system audio)
            </MenuItem>
            <MenuItem disabled={!recordingAllowed} onSelect={() => begin("mic")}>
              <Mic className="size-3.5" /> The microphone (in person)
            </MenuItem>
            <MenuItem onSelect={() => setPaste(true)}>
              <Upload className="size-3.5" /> {recordingAllowed ? "Upload or paste a recording or transcript…" : "Upload or paste a transcript…"}
            </MenuItem>
          </MenuContent>
        </Menu>
      )}
      {listener.state.lastError ? <span className="max-w-60 truncate text-[11.5px] text-warn" title={listener.state.lastError}>{listener.state.lastError}</span> : null}
      <Dialog
        open={consentFor !== null}
        onOpenChange={(o) => !o && setConsentFor(null)}
        title="Before you record"
        description="Recording other people without their agreement is against most tournament rules, and in some states (Illinois among them) it is a crime."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConsentFor(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!agreed}
              onClick={() => {
                try {
                  sessionStorage.setItem(CONSENT_KEY, roundId);
                } catch {
                  /* ignore */
                }
                const s = consentFor!;
                setConsentFor(null);
                void listener.start(s);
              }}
            >
              Start listening
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-[13px]">
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>Everyone being recorded (the other team, and the judge if they speak) agreed, and this tournament allows it.</span>
          </label>
          <p className="text-muted">Clash sends the audio in short pieces to be transcribed and keeps only the text. No recording is saved, and no one is identified by voice.</p>
        </div>
      </Dialog>
      <Dialog
        open={paste}
        onOpenChange={setPaste}
        title={`Add a transcript of their ${speech}`}
        description={`${recordingAllowed ? "Upload a recording (m4a, mp3, wav, webm, up to 25 MB) or a transcript (vtt, srt, txt)" : "Upload a transcript (vtt, srt, txt)"}, or paste the text. It goes into the notes and onto the flow like typed notes.`}
        footer={
          <>
            <label className="mr-auto">
              <input type="file" accept={recordingAllowed ? ".vtt,.srt,.txt,audio/*" : ".vtt,.srt,.txt"} className="hidden" aria-label="Choose a recording or transcript file" onChange={(e) => e.target.files?.[0] && void uploadFile(e.target.files[0]).finally(() => setPaste(false))} />
              <span className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-md border border-line px-3 text-[13px] hover:bg-hover">
                <Upload className="size-3.5" /> Choose a file
              </span>
            </label>
            <Button variant="ghost" onClick={() => setPaste(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!pasted.trim()}
              onClick={() => {
                const lines = padLines(parseTranscript(pasted));
                doc.transact(() => appendTranscript(doc, speech, lines));
                setPasted("");
                setPaste(false);
                toast(`Added ${lines.length} lines to their ${speech}.`, "ok");
              }}
            >
              Add pasted text
            </Button>
          </>
        }
      >
        <Textarea rows={8} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste a transcript (captions, Otter export, or plain text)…" />
      </Dialog>
    </div>
  );
}
