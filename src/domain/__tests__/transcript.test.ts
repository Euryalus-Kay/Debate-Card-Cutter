import { describe, expect, it } from "vitest";
import { detectFormat, padLines, parseTranscript } from "../transcript";

// SYNTHETIC FIXTURES: invented transcripts of a 1NC.
const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
<v Speaker 2>First off, the states counterplan.

00:00:04.000 --> 00:00:07.500
<v Speaker 2>The fifty states should adopt matching protections

00:00:07.500 --> 00:00:09.000
<v Speaker 2>through an interstate compact.

00:00:09.000 --> 00:00:11.000
<v Speaker 2>through an interstate compact.
`;

const srt = `1
00:00:01,000 --> 00:00:03,000
Next, the politics disad.

2
00:00:03,000 --> 00:00:06,000
Uniqueness: the bill passes now.
`;

const otter = `Speaker 1  0:03
Topicality. Establish means create a new program, and the plan doesn't.

Speaker 1  0:15
Limits: their interpretation explodes the topic.
`;

describe("transcripts", () => {
  it("recognizes caption and transcript formats", () => {
    expect(detectFormat(vtt)).toBe("vtt");
    expect(detectFormat(srt)).toBe("srt");
    expect(detectFormat(otter)).toBe("otter");
    expect(detectFormat("just some words")).toBe("text");
  });

  it("joins split caption cues into sentences and drops repeated cues", () => {
    const lines = parseTranscript(vtt);
    expect(lines.map((l) => l.text)).toEqual(["First off, the states counterplan.", "The fifty states should adopt matching protections through an interstate compact."]);
    expect(lines[0]).toMatchObject({ start: 1, speaker: "Speaker 2" });
  });

  it("reads SRT and Otter-style exports with their times", () => {
    expect(parseTranscript(srt).map((l) => [l.start, l.text])).toEqual([
      [1, "Next, the politics disad."],
      [3, "Uniqueness: the bill passes now."],
    ]);
    expect(parseTranscript(otter).map((l) => [l.start, l.speaker])).toEqual([
      [3, "Speaker 1"],
      [15, "Speaker 1"],
    ]);
  });

  it("splits long passages into pad lines of whole sentences", () => {
    const long = Array.from({ length: 6 }, (_, i) => `Sentence number ${i + 1} has exactly eight words.`).join(" ");
    const lines = padLines([{ start: null, speaker: null, text: long }], { maxWords: 20 });
    expect(lines.every((l) => l.split(/\s+/).length <= 20)).toBe(true);
    expect(lines.join(" ")).toBe(long);
  });
});
