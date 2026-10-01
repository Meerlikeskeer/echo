import type { StitchedTranscript } from './stitching';
import type { PlayableChunk } from './session';
export interface Passage { text: string; segmentIndexes: number[]; startMs: number; endMs: number; coarse: boolean }
export function transcriptParagraphs(transcript: StitchedTranscript): Passage[][] {
 const paragraphs: Passage[][] = []; let paragraph: Passage[] = [], pending: number[] = [];
 const finish = () => {
  if (!pending.length) return;
  const segments = pending.map(i => transcript.segments[i]);
  paragraph.push({ text: segments.map(s => s.text.trim()).join(' '), segmentIndexes: [...pending], startMs: Math.min(...segments.map(s => s.startMs)), endMs: Math.max(...segments.map(s => s.endMs)), coarse: segments.some(s => s.sourceIndexes.some(i => transcript.sources[i]?.segmentIndex === null)) }); pending = [];
 };
 const breakParagraph = () => { finish(); if (paragraph.length) paragraphs.push(paragraph); paragraph = []; };
 transcript.segments.forEach((segment,index) => {
  const previous = transcript.segments[index-1];
  if (previous && segment.startMs-previous.endMs > 1500) finish();
  if (previous && segment.startMs-previous.endMs > 4000) breakParagraph();
  pending.push(index);
  if (/[.!?]["'”’)]*\s*$/.test(segment.text) || pending.map(i => transcript.segments[i].text.length).reduce((a,b)=>a+b,0) >= 360) finish();
  if (paragraph.length >= 4) breakParagraph();
 }); breakParagraph(); return paragraphs;
}
export interface PlaybackPart { chunk: PlayableChunk; startSeconds: number; endSeconds: number }
export function passageAudio(transcript: StitchedTranscript, passage: Passage, chunks: readonly PlayableChunk[]): PlaybackPart[] | null {
 const parts: PlaybackPart[] = [];
 for (const index of passage.segmentIndexes) {
  const segment = transcript.segments[index];
  if (!segment) return null;
  const choices = segment.sourceIndexes.map(i=>transcript.sources[i]);
  const source = choices.find(s => s && chunks.some(c=>c.metadata.id===s.chunkId && c.metadata.sessionId===transcript.sessionId));
  if (!source) return null;
  const chunk = chunks.find(c=>c.metadata.id===source.chunkId && c.metadata.sessionId===transcript.sessionId)!;
  if (segment.startMs < chunk.metadata.startMs || segment.endMs > chunk.metadata.endMs || segment.endMs <= segment.startMs) return null;
  const startSeconds = (segment.startMs-chunk.metadata.startMs)/1000, endSeconds=(segment.endMs-chunk.metadata.startMs)/1000;
  const last=parts.at(-1);
  if(last?.chunk.metadata.id===chunk.metadata.id && startSeconds>=last.startSeconds) last.endSeconds=Math.max(last.endSeconds,endSeconds);
  else parts.push({chunk,startSeconds,endSeconds});
 }
 return parts.length ? parts : null;
}
