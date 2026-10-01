import test from 'node:test';
import assert from 'node:assert/strict';
import { passageAudio, transcriptParagraphs } from '../src/lib/recording/passages';
import type { StitchedTranscript } from '../src/lib/recording/stitching';
import type { PlayableChunk } from '../src/lib/recording/session';
function fixture(): StitchedTranscript {
 return { sessionId:'session-a',status:'final',text:'A complete sentence. Another paragraph.',gaps:[], sources:[{chunkId:'c0',sequence:0,segmentIndex:0,originalText:'A complete',startMs:59000,endMs:60000},{chunkId:'c1',sequence:1,segmentIndex:0,originalText:'sentence.',startMs:60000,endMs:61000},{chunkId:'c1',sequence:1,segmentIndex:1,originalText:'Another paragraph.',startMs:67000,endMs:68000}], segments:[{text:'A complete',startMs:59000,endMs:60000,sourceIndexes:[0]},{text:'sentence.',startMs:60000,endMs:61000,sourceIndexes:[1]},{text:'Another paragraph.',startMs:67000,endMs:68000,sourceIndexes:[2]}] };
}
const chunks: PlayableChunk[]=[0,1].map(sequence=>({audio:new Blob(['synthetic']),metadata:{sessionId:'session-a',id:`c${sequence}`,sequence,startMs:sequence?58000:0,endMs:sequence?118000:60000,overlapMs:sequence?2000:0,mimeType:'audio/wav',size:9,checksum:'a'.repeat(64)}}));
test('word/phrase segments become sentences and paragraph breaks preserve every word',()=>{
 const paragraphs=transcriptParagraphs(fixture());
 assert.equal(paragraphs.length,2); assert.equal(paragraphs[0][0].text,'A complete sentence.');
 assert.equal(paragraphs.flat().map(p=>p.text).join(' '),fixture().text);
 assert.deepEqual(paragraphs[0][0].segmentIndexes,[0,1]);
});
test('sentence spanning overlapping chunks maps to original chunk-relative bounds without invented timing',()=>{
 const t=fixture(), p=transcriptParagraphs(t)[0][0]; const plan=passageAudio(t,p,chunks)!;
 assert.deepEqual(plan.map(part=>[part.chunk.metadata.id,part.startSeconds,part.endSeconds]),[['c0',59,60],['c1',2,3]]);
 assert.equal(p.coarse,false); assert.equal(passageAudio(t,p,chunks.slice(0,1)),null);
});
test('duplicate overlap source can use either surviving copy; coarse text remains disclosed',()=>{
 const t=fixture(); t.sources[0].segmentIndex=null; t.segments[0].sourceIndexes.push(1); t.sources[1].startMs=59000; t.sources[1].endMs=60000;
 const p=transcriptParagraphs(t)[0][0]; assert.equal(p.coarse,true);
 assert.ok(passageAudio(t,p,chunks.slice(1)));
});
test('out-of-range/missing audio refuses playback rather than seeking into a different recording',()=>{
 const t=fixture(), p=transcriptParagraphs(t)[0][0]; t.segments[0].startMs=-1;
 assert.equal(passageAudio(t,p,chunks),null);
 assert.equal(passageAudio(fixture(),p,chunks.map(c=>({...c,metadata:{...c.metadata,sessionId:'another'}}))),null);
});
