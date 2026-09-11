import type { Transcript } from "../providers/types";
import { isAudioChunk, type AudioChunk } from "./session";
import { isCompletion, sameMetadata, type Completion } from "./session-completion";

export interface TranscriptEntry { readonly metadata: AudioChunk; readonly transcript?: Transcript }
export interface TranscriptSource {
  chunkId: string; sequence: number; segmentIndex: number | null;
  originalText: string; startMs: number; endMs: number;
}
export interface StitchedTranscript {
  sessionId: string; text: string; status: "partial" | "final";
  sources: TranscriptSource[];
  segments: { text: string; startMs: number; endMs: number; sourceIndexes: number[] }[];
  gaps: { reason: "capture-unconfirmed" | "missing-chunk" | "missing-transcript" | "invalid-input"; sequence: number | null; startMs?: number; endMs?: number }[];
}
// Fold case, whitespace and terminal sentence punctuation only. Symbols and
// internal punctuation distinguish C++/C#, 2+2/22 and re-sign/resign.
const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim().replace(/[.!?,;:]+$/u, "");

/** Session times are already normalized. Deduplication uses exact segment
 * intervals only; no timing tolerance or inferred word alignment is applied. */
export function stitchSession(input: { sessionId: string; chunks: readonly TranscriptEntry[]; completion: Completion | null }): StitchedTranscript {
  const output: StitchedTranscript = { sessionId: input.sessionId, text: "", status: "partial", sources: [], segments: [], gaps: [] };
  const gap = (reason: StitchedTranscript["gaps"][number]["reason"], sequence: number | null = null) => {
    if (!output.gaps.some(g => g.reason === reason && g.sequence === sequence)) output.gaps.push({ reason, sequence });
  };
  const manifest = isCompletion(input.completion) && input.completion.sessionId === input.sessionId ? input.completion : null;
  if (!input.completion) gap("capture-unconfirmed");
  else if (!manifest) gap("invalid-input");
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(input.sessionId)) gap("invalid-input");
  const rows = (Array.isArray(input.chunks) ? input.chunks : []).filter(row => {
    if (!row || !isAudioChunk(row.metadata) || row.metadata.sessionId !== input.sessionId) { gap("invalid-input"); return false; }
    return true;
  }).slice().sort((a, b) => a.metadata.sequence - b.metadata.sequence || a.metadata.id.localeCompare(b.metadata.id));
  if (!Array.isArray(input.chunks)) gap("invalid-input");
  const seenSequences = new Set<number>(), seenIds = new Set<string>();
  for (let index = 0; index < rows.length; index++) {
    const { metadata: current } = rows[index];
    const previous = rows[index - 1]?.metadata;
    if (seenSequences.has(current.sequence) || seenIds.has(current.id)) gap("invalid-input", current.sequence);
    seenSequences.add(current.sequence); seenIds.add(current.id);
    if (previous && current.sequence === previous.sequence + 1 &&
        (current.startMs < previous.startMs || current.startMs > previous.endMs || current.endMs < previous.endMs || current.overlapMs !== previous.endMs - current.startMs)) gap("invalid-input", current.sequence);
    if (manifest && !manifest.chunks.some(expected => sameMetadata(expected, current))) gap("invalid-input", current.sequence);
  }
  if (manifest) {
    for (const expected of manifest.chunks) if (!seenSequences.has(expected.sequence)) gap("missing-chunk", expected.sequence);
  } else {
    // One marker per missing run, bounded by observed rows rather than an
    // untrusted maximum sequence (which may be a huge safe integer).
    let expected = 0;
    for (const sequence of [...seenSequences].sort((a, b) => a - b)) {
      if (sequence > expected) gap("missing-chunk", expected);
      expected = sequence + 1;
    }
  }
  for (const { metadata, transcript } of rows) {
    if (transcript == null) { gap("missing-transcript", metadata.sequence); continue; }
    if (typeof transcript !== "object" || typeof transcript.text !== "string" || !Array.isArray(transcript.segments)) {
      gap("invalid-input", metadata.sequence); continue;
    }
    if (!(transcript.language === null || typeof transcript.language === "string") ||
        !(transcript.durationMs === null || (Number.isFinite(transcript.durationMs) && transcript.durationMs >= 0))) gap("invalid-input", metadata.sequence);
    const add = (originalText: string, startMs: number, endMs: number, segmentIndex: number | null) => {
      output.sources.push({ chunkId: metadata.id, sequence: metadata.sequence, segmentIndex, originalText, startMs, endMs });
    };
    const validTexts: string[] = [];
    // Array.isArray widens a readonly array to any[]; bind the checked value
    // back to its declared type so each segment is still validated as data.
    const segments: Transcript["segments"] = transcript.segments;
    segments.forEach((segment, segmentIndex) => {
      if (!segment || typeof segment.text !== "string" || !Number.isFinite(segment.startMs) || !Number.isFinite(segment.endMs) ||
          segment.startMs < metadata.startMs || segment.endMs > metadata.endMs || segment.endMs < segment.startMs) {
        gap("invalid-input", metadata.sequence); return;
      }
      validTexts.push(segment.text);
      add(segment.text, segment.startMs, segment.endMs, segmentIndex);
    });
    if (transcript.text.trim() && normalize(validTexts.join(" ")) !== normalize(transcript.text)) {
      // A coarse envelope explicitly retains unmatched full text. Keeping
      // possible repetition is preferable to dropping provider-only speech.
      add(transcript.text, metadata.startMs, metadata.endMs, null);
    }
  }
  const ordered = output.sources.map((source, index) => ({ source, index })).sort((a, b) =>
    a.source.startMs - b.source.startMs || a.source.sequence - b.source.sequence || (a.source.segmentIndex ?? -1) - (b.source.segmentIndex ?? -1));
  for (const { source, index } of ordered) {
    const duplicate = source.segmentIndex === null || output.gaps.some(g => g.reason === "invalid-input") ? undefined : output.segments.find(segment =>
      segment.startMs === source.startMs && segment.endMs === source.endMs && normalize(segment.text) !== "" && normalize(segment.text) === normalize(source.originalText) &&
      segment.sourceIndexes.some(otherIndex => {
        const other = output.sources[otherIndex];
        if (other.segmentIndex === null || Math.abs(other.sequence - source.sequence) !== 1) return false;
        const first = rows.find(row => row.metadata.sequence === Math.min(other.sequence, source.sequence))?.metadata;
        const second = rows.find(row => row.metadata.sequence === Math.max(other.sequence, source.sequence))?.metadata;
        return first && second && second.overlapMs === first.endMs - second.startMs &&
          second.startMs < first.endMs && source.startMs >= second.startMs && source.endMs <= first.endMs;
      }));
    if (duplicate && !duplicate.sourceIndexes.some(i => output.sources[i].sequence === source.sequence)) duplicate.sourceIndexes.push(index);
    else output.segments.push({ text: source.originalText, startMs: source.startMs, endMs: source.endMs, sourceIndexes: [index] });
  }
  // Only chunk metadata can locate a gap. Segment array indexes are not chunk numbers.
  for (const gap of output.gaps) {
    const metadata = gap.reason === "missing-chunk"
      ? manifest?.chunks.find(chunk => chunk.sequence === gap.sequence)
      : gap.reason === "missing-transcript"
        ? rows.find(row => row.metadata.sequence === gap.sequence)?.metadata : undefined;
    if (metadata) { gap.startMs = metadata.startMs; gap.endMs = metadata.endMs; }
  }
  output.text = output.segments.map(segment => segment.text).filter(Boolean).join(" ");
  output.status = manifest && !output.gaps.length ? "final" : "partial";
  return output;
}
