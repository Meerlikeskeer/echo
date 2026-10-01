"use client";
import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { passageAudio, transcriptParagraphs, type Passage, type PlaybackPart } from '../lib/recording/passages';
import type { StitchedTranscript } from '../lib/recording/stitching';
import type { PlayableChunk } from '../lib/recording/session';
export function TranscriptReader({ transcript, audio = [] }: { transcript: StitchedTranscript; audio?: readonly PlayableChunk[] }) {
 const player = useRef<HTMLAudioElement>(null), objectUrl = useRef<string | null>(null), plan = useRef<PlaybackPart[]>([]), position = useRef(0);
 const [error,setError] = useState(''), [active,setActive] = useState(false);
 useEffect(()=>{ const element=player.current; return ()=>{element?.pause(); if(objectUrl.current) URL.revokeObjectURL(objectUrl.current);}; },[transcript.sessionId]);
 async function playPart(index: number) {
  position.current=index;
  const element=player.current, part=plan.current[index];
  if(!element || !part) { setActive(false); element?.pause(); return; }
  position.current=index; element.pause();
  if(objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  const url=URL.createObjectURL(part.chunk.audio); objectUrl.current=url;
  element.src=url;
  element.onloadedmetadata=()=>{element.currentTime=part.startSeconds; void element.play().catch(()=>{setError('Playback could not start. Use the original audio download.');setActive(false);});};
  element.load(); setActive(true);
 }
 function play(passage: Passage) {
  const parts=passageAudio(transcript,passage,audio); if(!parts) {setError('The original audio for this passage is unavailable.');return;}
  setError('');plan.current=parts;void playPart(0);
 }
 function advance() { const part=plan.current[position.current]; if(part && player.current && player.current.currentTime>=part.endSeconds) void playPart(position.current+1); }
 return <div className="transcript-reader">
  {audio.length ? <p className="reader-hint">Hover over a sentence to listen. You can also select it with your keyboard or tap it.</p> : null}
  <audio ref={player} controls hidden={!active} onTimeUpdate={advance} onEnded={()=>{void playPart(position.current+1);}} onError={()=>{setError('This audio could not be played. Download the original clip to listen.');setActive(false);}} aria-label="Selected transcript passage" />
  {error ? <p role="alert" className="text-sm text-amber-800">{error}</p> : null}
  <div className="transcript-prose">{transcriptParagraphs(transcript).map((paragraph,index)=><p key={index}>{paragraph.map((passage,i)=>audio.length ? <button type="button" key={i} className="transcript-passage" onClick={()=>play(passage)} disabled={!passageAudio(transcript,passage,audio)} aria-label={`Play passage: ${passage.text}`} title={passage.coarse ? 'Play original chunk passage; precise sentence timing unavailable' : 'Play this passage'}>{passage.text}<span className="passage-action" aria-hidden="true"><Play size={12}/> Listen</span>{' '}</button> : <span key={i}>{passage.text}{' '}</span>)}</p>)}</div>
 </div>;
}
