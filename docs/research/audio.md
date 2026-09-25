# Capturing opponent speech: browser audio, speech-to-text, Zoom, and consent

*Research record, 2026-09-25. Written by a research agent from the sources listed at the end (all opened on that date unless noted); reviewed and adopted into Clash's rules (see docs/PROJECT_RECORD.md). Quotes are limited to short lines; everything else is paraphrased with its source.*

## Main findings
1. **Chrome is the only browser that can capture another tab's or app's audio.** Tab audio works in desktop Chrome on macOS, Windows, Linux and ChromeOS [4]. Since Chrome 141 (stable 2025-09-30), Chrome on macOS 14.2+ can also capture **system audio**, which includes the Zoom desktop app. BlackHole is no longer needed [1][2][3]. Safari and Firefox get no audio from `getDisplayMedia` [4][5].
2. **No one has published accuracy data for debate spreading.** Speed-up studies show error rates climbing sharply at 1.1–1.7x normal speed, and small Whisper models start inventing repeated phrases [58][59]. Spreading at 300–350 wpm is roughly 1.5–2.5x normal speech [63], beyond anything that was tested. You need your own test set.
3. **Minors' terms rule out some vendors.**
   - **ElevenLabs** bans users under 18 and bans uploading voice data from under-18s [31]. Exclude it.
   - **Gemini API** can't be used in services likely to be used by under-18s [34]. Google Cloud's generative-AI terms say the same, and it's unclear whether Chirp 3 counts [33].
   - **OpenAI and Anthropic** explicitly allow products for minors if you add safeguards. Neither trains on API data by default [22][23][41][42].
   - **Deepgram, AssemblyAI, AWS and ElevenLabs** train on your data by default unless you opt out.
4. **The Claude API does not take audio.** Current models accept text and images; the Files API takes PDFs, images and text [40]. Speech-to-text (STT) has to be a separate step.
5. **Zoom's own captions and transcripts aren't reliable.** Zoom removed caption saving on 2026-05-18. Transcripts now need a paid host account, an admin to turn them on, and host permission for participants to save [49][50]. NSDA Campus is Jitsi-based, has no recording or documented captions, and works in Chrome, so capturing its browser tab is the way in [55][56].

## A. Browser audio capture

| Source | Chrome macOS | Chrome Windows | ChromeOS | Safari | Firefox |
|---|---|---|---|---|---|
| Microphone | yes | yes | yes | yes | yes |
| Tab audio | yes | yes | yes | no | no |
| System audio (entire screen) | yes: Chrome 141+, macOS 14.2+, needs the "Screen & System Audio Recording" permission [1][3] | yes | yes | no | no |
| Window + audio | `windowAudio` hint ("exclude", "system", "window"), Chrome 141; support varies by platform [2] | same | same | no | no |

- **Out-of-date docs:** MDN's compatibility note still says macOS can only capture tab audio [4]. Hands-on tests [1] and Google Meet's own rollout (Chrome 142+, macOS 14.2+ or Windows 11) [3] show that is no longer true.
- **How the capture API behaves:**
  - You must request `video:true` and then throw away the video track.
  - Every session needs a click and Chrome's picker; it can't start automatically.
  - Check that "Share tab audio" is actually on. Reports disagree on whether it's on by default [4][5].
- **macOS permissions:** capturing a tab needs no macOS permission; capturing a window or the whole screen does [6]. macOS 15 may ask the user to re-confirm that permission periodically [7].
- **School Chromebooks:** admins can switch capture off with policies such as `ScreenCaptureAllowed` and `TabCaptureAllowedByOrigins` [10].

**Getting Zoom desktop audio on macOS:**
1. **Chrome 141+ on macOS 14.2+:** share "Entire screen" (or a window) and turn on system audio. This picks up everything playing, including notifications. `restrictOwnAudio` filters out the app's own sounds [2].
2. **BlackHole** (GPL-3.0 virtual audio driver):
   - Setup: install the .pkg (needs an admin password) and restart. Then create a Multi-Output Device, send Zoom's output to it, and pick BlackHole as the microphone in the app [8].
   - This also works in Safari, because BlackHole shows up as a microphone.
   - It is impossible on managed school Macs, so use it only as a power-user option.
3. **Join through the Zoom web client in a Chrome tab** and capture that tab. No OS permission is needed.

**On ChromeOS,** Zoom runs as a PWA in its own window [9]. Either share the entire screen with system audio, or join Zoom (or NSDA Campus) in a normal tab.

**Recording format (MediaRecorder):**
- Chrome defaults to `audio/webm;codecs=opus` and has also supported MP4/AAC since M126 [11].
- Safari 18.4+ can record WebM/Opus; its default is MP4/AAC [11].
- Every vendor below accepts webm and m4a.
- Mono Opus at 32 kbps is about 14 MB per hour.

**Vercel:** function request bodies are capped at 4.5 MB, and Hobby functions time out after 300 s. WebSockets are in beta [12]. That makes short chunk uploads the simplest design.

**Web Speech API (`SpeechRecognition`):**
- **Where audio goes:** by default Chrome sends it to a server (Google) [13].
- **Tab audio:** `start(audioTrack)` accepts a tab-audio `MediaStreamTrack` in desktop Chrome 135+ (2025-04-01). It does not work on Android, Safari or Firefox [13][14]. When it shipped, ChromeOS was listed as "to follow" [14].
- **On-device mode:** `processLocally` shipped in Chrome 139 (2025-08-05) with a ~60 MB language pack. Launch platforms were Windows, Mac and Linux, with ChromeOS "later" [15].
  - `phrases` (bias toward chosen words) arrived in Chrome 142 and works on-device [13].
  - Quality levels such as "conversation" are proposed for M150 [15].
  - An open bug (June 2026) says on-device routing silently overrides `processLocally=false` [16].
- **Session limits:** continuous sessions end after silence or around 60 s and must be restarted from `onend` [17].
- **Safari:** uses Apple's older speech engine, takes no track input, and Apple's new on-device SpeechAnalyzer (macOS 26) is not exposed to the web [18].

## B. Speech-to-text APIs

| Provider / model | Price per min | Streaming and limits | Word timestamps / speaker labels | Trains on your audio by default? | Minors and age terms |
|---|---|---|---|---|---|
| **OpenAI gpt-transcribe** (launched 2026-07-29) | $0.0045 | Files up to 25 MB; about 1,400–1,500 s per request in practice [25]; accepts keywords and context | No | **No**. The transcription endpoint keeps no abuse logs [22] | Products for under-18s allowed with safeguards: disclosures, content filters, monitoring, age checks where appropriate. No data from under-13s without zero data retention. OpenAI may audit [23] |
| OpenAI gpt-live-transcribe | $0.017 | Realtime over WebRTC or WebSocket; sessions max 60 min [20][24] | No | No; 30-day abuse logs | Same |
| OpenAI gpt-4o-transcribe / mini / -diarize / whisper-1 | $0.006 / $0.003 / $0.006 / $0.006 | 4o models have reported truncation on long files [25] | Word timestamps only on whisper-1; speaker labels via -diarize | No | Same |
| Deepgram Nova-3 | $0.0043 files, $0.0048 streaming; keyterms +$0.0013 | Files up to 2 GB (secondary source); 30 s browser tokens [26] | Yes; speaker labels included for files, +$0.002 streaming | **Yes**. Terms (effective 2026-08-06) allow training; opt out per request with `mip_opt_out=true`. Opting out reportedly loses a discount [27] | Account holder must be 18+; nothing on under-18 end users [27] |
| AssemblyAI Universal-3.5 Pro | $0.21/hr files; $0.45/hr realtime; Universal-Streaming $0.15/hr | Files up to 5 GB / 10 h; browser tokens valid 1–600 s; streaming billed by session length [28] | Yes; speaker labels +$0.02/hr files, +$0.12/hr streaming | **Yes**. Paid accounts can opt out for free in the dashboard; free accounts cannot [29] | No age clause found |
| ElevenLabs Scribe v2 | $0.22/hr; realtime $0.39/hr | Files up to 3 GB / 10 h [30] | Yes; up to 32 speakers | Yes, with opt-out | **Excluded:** users must be 18+, and uploading voice data of under-18s is prohibited [31] |
| Google Chirp 3 | $0.016 (secondary source) | Each stream max 5 min (gRPC); batch up to 1 h through Cloud Storage [32] | Word timestamps optional, with some accuracy loss; speaker labels only in batch | No, unless you opt into data logging [35] | Google's generative-AI terms (§20(d)) forbid use in services likely used by under-18s [33]. Google calls Chirp 3 a "generative" model, so it may be covered. **Ambiguous** |
| Azure Speech | Real-time $1.00/hr; batch $0.18/hr; fast $0.36/hr; promo $0.10/hr from 2026-09-01 (reportedly MAI-Transcribe-2) [36] | Real-time and batch | Yes | **No**. Real-time and fast audio isn't stored [37] | No explicit clause found |
| AWS Transcribe | $0.006 files, $0.01 streaming (AWS price list published 2026-09-11) [38] | Files up to 4 h / 2 GB | Yes | **Yes**, unless you set an AWS Organizations opt-out policy [39] | Child-directed apps allowed with COPPA notice and consent [39] |
| **Claude API** | n/a | **No audio input** [40] | n/a | No training on customer content [41] | Products for minors allowed with safeguards (age verification, moderation, child-safety system prompt, COPPA statement, AI disclosure; Anthropic audits). Claude accounts are 18+ [42] |

On a general accuracy leaderboard (not fast speech), the top models include MAI-Transcribe-2 (2.0% error) and Scribe v2 (2.2%). Nova-3 is the fastest at 564x real time [62].

## C. On-device and in-browser models

| Model | Download | Speed evidence |
|---|---|---|
| Chrome on-device Web Speech | ~60 MB | No accuracy data |
| Moonshine tiny / base (transformers.js) | ~76 / ~154 MB [43] | v2 (Feb 2026) error 6.65% vs Whisper large-v3 7.44%. English models are MIT-licensed. WASM JavaScript port released 2026-08-15 [45] |
| Whisper base / small (transformers.js) | ~206 / ~586 MB | Official real-time demo uses base and caps each window at 64 tokens [43] |
| Whisper large-v3-turbo (WebGPU) | ~1.6 GB (1,274 MB encoder + 334 MB decoder, as Hugging Face's own demo loads it) [43] | One developer reports M2 MacBook Air: 30 min of audio in about 90 s (unverified) [46] |
| whisper.cpp WASM | tiny 75 MB, base 142 MB, small 466 MB (or 31/57/182 MB quantized) | CPU only; tiny and base run 2–3x real time; anything above small is "unsatisfactory"; the demo caps audio at 120 s [44] |

- **Other laptop numbers:** Whisper tiny.en on WASM on an Intel laptop takes about 0.21x the audio length, plus 3.6 s of startup [46].
- **Chromebooks:**
  - I found no in-browser benchmark.
  - A Samsung Chromebook 4 took about 30 s per sentence with Whisper base, and that was native Python, not the browser [47].
  - Realistically, a Chromebook Plus (12th-gen i3 or better, 8 GB RAM) is the minimum.
  - WebGPU on ChromeOS needs a device that supports Vulkan [47].
- **Apple SpeechAnalyzer** has no JavaScript or browser access. Reaching it would need a native helper app, which rules out Chromebooks [18].

## D. Zoom and NSDA Campus
- **Live captions:** available on free accounts since 2021, controlled by the host, with a 3-minute scroll-back [48].
- **Saving captions:** removed on 2026-05-18. The replacement "meeting transcripts" need a Pro, Business or Enterprise account plus an admin to switch them on. The host decides who can save them as .txt [49][50].
- **Cloud recording transcripts:** paid accounts only, and they go to the host. **Local recording** works on free accounts in the desktop app only (not the Chromebook PWA); participants need host permission, and it produces an M4A file you could upload [9][51].
- **Zoom Realtime Media Streams (RTMS):** Zoom's API for sending live meeting audio and transcripts to an app. Generally available since 2025 [52].
  - Gives per-participant audio and speaker-labelled transcripts.
  - Needs Developer Pack credits: about $0.01 per minute according to Zoom staff, and 0.02 credits per minute with transcripts according to a Zoom partner [53].
  - In meetings hosted by someone else, you must be on the invite list and the host must approve. The host's organization can block it, and everyone sees a notice that apps are receiving meeting content [54].
  - **Not realistic for tournament rounds.**
- **NSDA Campus:** built on open-source Jitsi, not Zoom. Runs in Chrome or Edge. No recording or livestream. Captions aren't documented [55][56].

## E. Accuracy on fast speech
- **Katkov et al., 2024** (English, artificially sped-up audio): Whisper large-v3's error rate went from about 11% at normal speed to about 33% at 1.1x, 48% at 1.5x and 60% at 1.7x. Whisper base went above 100% at 1.5x because it made up repeated phrases. A Conformer model held up best [58].
- **PAREDA (May 2026)** at 1.5x speed:
  - Whisper API: 18.2% → 26.0% error on Australian-accented speech, and 9.6% → 14.8% on Indian-accented speech.
  - CrisperWhisper: 5.1% → 25.6%.
  - The authors call speaking rate a "dominant constraint" [59].
- **Speech Robust Bench:** Whisper large was the most robust model overall, including speed changes up to 2x [60].
- **Siegler & Stern, 1995:** error rates rise when speech is faster than normal [61].
- **No debate or spreading evaluation exists.** Build a set of 20–30 consented clips (evidence reading and analytics) and measure word error and argument recall for each vendor.

## Policy and legal flags (not legal advice)
- **Tournament rules:** recording rules vary. NSDA Middle School Nationals bans recording without written consent [57]. NSDA rules also say AI can't be cited as a source and devices can't be used to get help from non-competitors [65]. Check each tournament's invitation.
- **Illinois:** recording a private conversation secretly without everyone's consent is a felony [64]. The state's biometric privacy law (BIPA) lists "voiceprint," so avoid speaker identification or voice embeddings and label text by speech order instead.
- **Account ownership:** Claude accounts must be 18+ [42], and Deepgram and ElevenLabs account holders must be 18+ [27][31]. A parent should own the API accounts.

## Recommendation matrix
Cost per round assumes about 26 min of opponent speeches, or about 64 min for everything including cross-examination [63].

| Option | Cost per round (opponents only / whole round) | Privacy | Minors terms | Accuracy at spreading speed | macOS setup effort | Chromebook setup effort |
|---|---|---|---|---|---|---|
| **OpenAI gpt-transcribe, 15–30 s chunks through your Vercel route** | $0.12 / $0.29 | No training, no retention on transcription | Allowed with safeguards | Untested; strong general model plus keywords and context | Low | Low (only your own domain has to be reachable through school filters) |
| OpenAI gpt-live-transcribe | $0.44 / $1.09 | No training; 30-day logs | Same | Untested | Low–Medium | Medium (school filter must allow OpenAI; 60-min session cap) |
| AssemblyAI Universal-3.5 Pro (files / realtime) | $0.09 / $0.22 files; $0.20 / $0.48 realtime | Opt-out is one account setting (paid plans) | No clause | Untested | Low–Medium | Medium |
| Deepgram Nova-3 streaming with keyterms | $0.16 / $0.39 | Opt out on every request | 18+ account | Untested; fastest | Low–Medium | Medium |
| Azure (real-time / promo file rate) | $0.43 / $1.07; $0.04 / $0.11 | Strong | No clause | Top general score (MAI) | Medium | Medium |
| AWS Transcribe streaming | $0.26 / $0.64 | Opt-out is organization-wide | COPPA allowed | Untested | High | Medium |
| Google Chirp 3 | $0.42 / $1.02 | Strong | Ambiguous | Untested | High | High |
| ElevenLabs | — | — | **Prohibited** | — | — | — |
| Chrome Web Speech (cloud or on-device) | Free | Cloud sends audio to Google with no contract; on-device stays local | n/a | Likely poor | Low | Low, but unclear on ChromeOS |
| In-browser Moonshine / Whisper | Free | Local | n/a | Poor to fair | Medium | High |
| Zoom captions/transcripts, or typed notes | Free | — | — | Captions/transcripts depend on the host; typed notes don't depend on accuracy | — | — |

**Recommended default:**
- **How the round is captured:**
  - Online round: capture the Chrome tab running the Zoom web client or NSDA Campus. This gets only the other people's audio and needs no OS permission.
  - Zoom desktop app on a Mac: share the screen with system audio.
  - In-person round: use the microphone.
- **Pipeline:** record 15–30 s segments (restart MediaRecorder for each one so every segment is a playable file), send each to a Next.js route, then to OpenAI `gpt-transcribe`. Pass keywords from the opponents' speech doc plus debate jargon, and the previous transcript as context. Send the text to Claude to flow it.
- **Data handling:** delete the audio once it's transcribed.

**Fallbacks:**
1. **Paid AssemblyAI with training opted out:** file mode for uploads, realtime with temporary tokens for live captions. Deepgram is an alternative if `mip_opt_out=true` is enforced on the server.
2. **Chrome on-device Web Speech** (`processLocally`, passing the tab track) for rough offline text. Keep the audio so it can be re-transcribed later.
3. **Upload after the round:** M4A from Zoom local recording or Voice Memos, or .txt/.vtt/.srt transcripts, including Otter's free TXT export [66].
4. **Typed notes and speech-doc import** always available.

**Avoid:** ElevenLabs, Gemini API, Chirp 3 until Google clarifies, RTMS, and BlackHole as a default.

## Sources (accessed 2026-09-25 unless dated)
1. [addpipe – Chrome macOS system audio](https://blog.addpipe.com/getdisplaymedia-allows-capturing-the-screen-with-system-sounds-on-chrome-on-macos/) (2026-02-19, upd. 2026-05-21)
2. [Chrome 141 release notes](https://developer.chrome.com/release-notes/141) (2025-09-30)
3. [Google Workspace Updates – Meet device audio](https://workspaceupdates.googleblog.com/2025/12/share-devices-audio-when-presenting.html) (2025-12-17)
4. [MDN BCD MediaDevices.json](https://github.com/mdn/browser-compat-data/blob/main/api/MediaDevices.json); [addpipe demo matrix](https://addpipe.com/getdisplaymedia-demo/)
5. [dev.to – system audio in browser](https://dev.to/flo152121063061/i-tried-to-capture-system-audio-in-the-browser-heres-what-i-learned-1f99) (2026-01-12)
6. [Maze KB – macOS tab vs screen](https://help.maze.co/hc/en-us/articles/4416540893715-Why-can-t-I-record-my-screen-when-using-Clips-in-Chrome)
7. [TechRadar – Sequoia prompts](https://www.techradar.com/computing/mac-os/on-macos-sequoia-youll-only-have-to-deal-with-screen-recording-permission-pop-ups-once-a-month-rather-than-once-a-week) (2024-08)
8. [BlackHole](https://github.com/ExistentialAudio/BlackHole)
9. [Zoom PWA on Chromebook](https://www.zoom.com/en/blog/how-to-use-zoom-on-a-chromebook/) (2022)
10. [Chrome policy ScreenCaptureAllowed](https://chromeenterprise.google/policies/screen-capture-allowed/)
11. [Chromestatus MP4 MediaRecorder](https://chromestatus.com/feature/5163469011943424); [WebKit Safari 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/) (2025-03-31)
12. [Vercel limits](https://vercel.com/docs/functions/limitations) (2026-08-24); [Vercel WebSockets](https://vercel.com/docs/functions/websockets) (2026-08-10)
13. [MDN Web Speech](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API); [MDN BCD SpeechRecognition](https://github.com/mdn/browser-compat-data/blob/main/api/SpeechRecognition.json); [MDN phrases](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/phrases)
14. [Chrome 135 notes](https://developer.chrome.com/release-notes/135) (2025-04-01); [Intent to Ship MediaStreamTrack](https://groups.google.com/a/chromium.org/g/blink-dev/c/4ibjEVQ-i0s/m/2OsaIhf3BAAJ) (2024-12-17)
15. [Chrome 139 notes](https://developer.chrome.com/release-notes/139) (2025-08-05); [Intent to Ship on-device](https://groups.google.com/a/chromium.org/g/blink-dev/c/VNOok2dbmHM) (2025-01-06); [Chromestatus quality](https://chromestatus.com/feature/5136859632107520)
16. [Chromium issue 521896368](https://issues.chromium.org/issues/521896368) (2026-06)
17. [Chromium group – 60 s limit](https://groups.google.com/a/chromium.org/g/chromium-html5/c/s2XhT-Y5qAc)
18. [addpipe Web Speech deep dive](https://blog.addpipe.com/a-deep-dive-into-the-web-speech-api/) (upd. 2026-08-19); [addpipe SpeechAnalyzer](https://blog.addpipe.com/apple-speechanalyzer-api/) (2026-08-17)
19. [OpenAI pricing](https://developers.openai.com/api/docs/pricing); [gpt-transcribe](https://developers.openai.com/api/docs/models/gpt-transcribe); [gpt-live-transcribe](https://developers.openai.com/api/docs/models/gpt-live-transcribe)
20. [OpenAI STT guide](https://developers.openai.com/api/docs/guides/speech-to-text); [Realtime transcription](https://developers.openai.com/api/docs/guides/realtime-transcription)
21. [OpenAI launch post](https://community.openai.com/t/gpt-live-transcribe-and-gpt-transcribe-two-new-transcription-models-in-the-api/1388318) (2026-07-29)
22. [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)
23. [OpenAI Under-18 API guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance)
24. [OpenAI Realtime dev notes](https://developers.openai.com/blog/realtime-api)
25. [Forum: 4o truncation](https://community.openai.com/t/gpt-4o-transcribe-truncates-the-transcript/1148347); [Forum: 1500 s](https://community.openai.com/t/gpt4-0-transcribe-max-1500-seconds/1306684)
26. [Deepgram pricing](https://deepgram.com/pricing); [Deepgram token auth](https://developers.deepgram.com/guides/fundamentals/token-based-authentication)
27. [Deepgram Terms](https://deepgram.com/terms) (eff. 2026-08-06); [Deepgram MIP](https://developers.deepgram.com/docs/the-deepgram-model-improvement-partnership-program); [Humla](https://humla.team/blog/deepgram-data-retention-policy) (2026-08-04)
28. [AssemblyAI pricing](https://www.assemblyai.com/pricing); [AssemblyAI temp tokens](https://www.assemblyai.com/docs/streaming/authenticate-with-a-temporary-token); [AssemblyAI file limits](https://www.assemblyai.com/docs/faq/are-there-any-limits-on-file-size-or-file-duration-for-files-submitted-to-the-api)
29. [AssemblyAI ToS](https://www.assemblyai.com/legal/terms-of-service) (eff. 2026-07-01); [AssemblyAI opt-out](https://www.assemblyai.com/docs/faq/how-to-opt-out-of-data-sharing-for-our-model-improvement-program); [AssemblyAI retention](https://www.assemblyai.com/docs/data-retention-and-model-training)
30. [ElevenLabs pricing](https://elevenlabs.io/pricing/api); [ElevenLabs STT docs](https://elevenlabs.io/docs/capabilities/speech-to-text)
31. [ElevenLabs ToS](https://elevenlabs.io/terms-of-use) (2026-03-31); [ElevenLabs Privacy](https://elevenlabs.io/privacy-policy) (2026-05-20)
32. [Chirp 3 docs](https://docs.cloud.google.com/speech-to-text/docs/models/chirp-3) (2026-09-18); [STT quotas](https://docs.cloud.google.com/speech-to-text/v2/quotas); [pricing, secondary](https://convertaudiototext.com/blog/google-cloud-speech-to-text-pricing-2026) (2026-07-01)
33. [Google Cloud Service Specific Terms §20](https://cloud.google.com/terms/service-terms) (2026-09-24); [Services Summary](https://cloud.google.com/terms/services)
34. [Gemini API terms](https://ai.google.dev/gemini-api/terms) (2026-04-28)
35. [Google STT data logging](https://docs.cloud.google.com/speech-to-text/docs/v1/data-logging)
36. [Azure Retail Prices API](https://prices.azure.com/api/retail/prices); [Azure pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/); [MAI-Transcribe-2 price, secondary](https://valueaddvc.com/pulse/microsoft-mai-transcribe-2-speech-model-pricing-2026)
37. [Azure STT data privacy](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/speech-service/speech-to-text/data-privacy-security) (2026-08-26)
38. [AWS Price List API](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/transcribe/current/us-east-1/index.json) (2026-09-11); [AWS pricing](https://aws.amazon.com/transcribe/pricing/)
39. [AWS opt-out](https://docs.aws.amazon.com/transcribe/latest/dg/opt-out.html); [AWS FAQ](https://aws.amazon.com/transcribe/faqs/)
40. [Claude models overview](https://platform.claude.com/docs/en/about-claude/models/overview); [Claude features overview](https://platform.claude.com/docs/en/build-with-claude/overview)
41. [Anthropic Commercial Terms](https://www.anthropic.com/legal/commercial-terms) (2025-06-17)
42. [Anthropic minors guidelines](https://support.claude.com/en/articles/9307344-responsible-use-of-anthropic-s-models-guidelines-for-organizations-serving-minors) (2026-03-16); [Claude 18+](https://support.claude.com/en/articles/13117299-minimum-age-requirement-access-restriction) (2026-03-16)
43. [HF ONNX turbo files](https://huggingface.co/onnx-community/whisper-large-v3-turbo/tree/main/onnx); [HF WebGPU Space](https://huggingface.co/spaces/webml-community/whisper-large-v3-turbo-webgpu); [realtime-whisper-webgpu example](https://github.com/huggingface/transformers.js-examples/tree/main/realtime-whisper-webgpu)
44. [whisper.cpp WASM demo](https://ggml.ai/whisper.cpp/); [whisper.wasm README](https://github.com/ggml-org/whisper.cpp/tree/master/examples/whisper.wasm)
45. [Moonshine Voice](https://petewarden.com/2026/02/13/announcing-moonshine-voice/) (2026-02-13); [Moonshine JS port](https://petewarden.com/2026/08/15/why-i-ported-moonshine-to-javascript/) (2026-08-15); [moonshine-v2 repo](https://github.com/moonshine-ai/moonshine-v2)
46. [dev.to Whisper web app](https://dev.to/zephyr_zheng_0bfed478de52/i-shipped-a-free-whisper-transcription-web-app-then-a-chatgpt-gpt-to-feed-it-50mp); [browser-whisper-benchmark](https://github.com/nickwebt800/browser-whisper-benchmark); [OfflineTTS](https://offlinetts.com/blog/browser-speech-recognition-whisper-comparison/) (2026-08-01)
47. [ChromeOS_Whisper](https://github.com/tgraupmann/ChromeOS_Whisper); [Chrome WebGPU overview](https://developer.chrome.com/docs/web-platform/webgpu/overview); [Chromebook Plus specs](https://www.howtogeek.com/what-is-chromebook-plus/)
48. [Zoom captions for free accounts](https://www.zoom.com/en/blog/zoom-auto-generated-captions/) (2021-10-25); [Zoom automated captions](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0058810)
49. [Zoom saving captions](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0063899); [Zoom May 2026 FAQ](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0085668)
50. [Zoom enable transcripts](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0085675); [Zoom using transcripts](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0085682)
51. [Zoom cloud recording transcripts](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0064927); [Zoom local recording](https://support.zoom.us/hc/en-us/articles/201362473-Enabling-and-starting-local-recordings)
52. [Zoom RTMS docs](https://developers.zoom.us/docs/rtms/); [Zoom Summit recap](https://developers.zoom.us/blog/developer-summit-2026-recap/) (2026-06-24)
53. [RTMS pricing (forum)](https://devforum.zoom.us/t/rtms-developer-pack-pricing-for-business-account/144203) (2026-06-15); [RTMS credits (forum)](https://devforum.zoom.us/t/rtms-credit-consumption-per-minute-and-whether-the-initiating-participant-needs-a-paid-plan/145391) (2026-08-10)
54. [RTMS external meetings (forum)](https://devforum.zoom.us/t/error-2308-when-starting-rtms-via-rest-api-as-a-participant-in-an-external-meeting/144673) (2026-07-09); [Recall.ai RTMS constraints](https://www.recall.ai/blog/understanding-zoom-rtms-behavior-and-its-constraints) (2026-07-30)
55. [NSDA Campus](https://www.speechanddebate.org/nsda-campus/); [NSDA Campus Tech](https://www.speechanddebate.org/campus-tech/)
56. [UIL NSDA Campus info (Jitsi)](https://www.uiltexas.org/files/academics/speech/NSDA_Campus_Info.pdf) (2021)
57. [NSDA recording FAQ](https://www.speechanddebate.org/ufaq/are-spectators-permitted-to-watch-rounds/)
58. [Katkov et al., AIxIA 2024](https://aixia2024-proceedings-e1c44a.pages.scientificnet.org/toc/pdfs/154500208.pdf)
59. [PAREDA](https://arxiv.org/abs/2605.17860) (2026-05-18)
60. [Speech Robust Bench](https://arxiv.org/abs/2403.07937)
61. [Siegler & Stern, 1995](https://www.researchgate.net/publication/230876480_On_the_effects_of_speech_rate_in_large_vocabulary_speech_recognition_systems)
62. [Artificial Analysis STT leaderboard](https://artificialanalysis.ai/speech-to-text)
63. [Speaking rate data](https://weesperneonflow.ai/en/blog/2026-05-30-average-speaking-rate-words-per-minute-data-2026/) (2026-05-30); [Policy debate structure](https://en.wikipedia.org/wiki/Structure_of_policy_debate)
64. [Illinois recording law](https://www.recordinglaw.com/party-two-party-consent-states/illinois-recording-laws/audio/); [BIPA statute](https://www.ilga.gov/Legislation/ILCS/Articles?ActID=3004&ChapterID=57); [Sigma Law – voiceprint suits](https://sigmalawgroup.com/blog/2026-08-22-bipa-voiceprint-ai/) (2026-08-22)
65. [Ethos Debate – NSDA AI rules](https://www.ethosdebate.com/guest-post-artificial-but-not-exactly-intelligent-ai-in-debate-nsda-regulations-by-rik-roy/)
66. [Otter ToS](https://otter.ai/terms-of-service) (2025-09-19); [Apple Voice Memos transcription](https://support.apple.com/guide/voice-memos/view-a-transcription-of-a-recording-vm4a03609f0d/mac)
