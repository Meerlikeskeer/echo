import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { processFolder, endpoint } from '../../tools/chunk-receiver/transcription';
import type { AudioChunk } from '../src/lib/recording/session';
import type { Transcript } from '../src/lib/providers/types';
async function fixture() {
 const folder = await mkdtemp(join(tmpdir(), 'echo-transcript-'));
 const audio = Buffer.from('synthetic');
 const chunks: AudioChunk[] = [0,1].map(sequence => ({ sessionId: 'session-test', id: `session-test-${sequence}`, sequence, startMs: sequence ? 58000 : 0, endMs: sequence ? 118000 : 60000, overlapMs: sequence ? 2000 : 0, mimeType: 'audio/wav', size: audio.length, checksum: createHash('sha256').update(audio).digest('hex') }));
 for (const c of chunks) await writeFile(join(folder, `chunk-${c.sequence}.wav`), audio);
 const receipt = { version: 1, sessionId: 'session-test', complete: false, chunks };
 const save = () => writeFile(join(folder, 'receipt.json'), JSON.stringify(receipt)); await save();
 const transcript: Transcript = { text: 'overlap', segments: [{ text: 'overlap', startMs: 59000, endMs: 59500 }], language: 'en', durationMs: 60000 };
 return { folder, receipt, save, transcript };
}
test('slow processing cannot hold receipt publication; ordering and overlap reuse domain semantics', async () => {
 const f = await fixture(); let release!: () => void;
 const gate = new Promise<void>(r => { release = r; }); let calls = 0;
 const processing = processFolder(f.folder, async () => { calls++; if (calls === 1) await gate; return f.transcript; });
 // Receipt can independently advance while the provider request is unresolved.
 f.receipt.complete = true; await f.save(); release(); await processing;
 await processFolder(f.folder, async () => { throw Error('must reuse'); });
 const out = JSON.parse(await readFile(join(f.folder, 'transcript.json'), 'utf8'));
 assert.equal(out.status, 'final'); assert.equal(out.text, 'overlap'); assert.equal(out.sources.length, 2); assert.equal(calls, 2);
});
test('offline requests persist bounded attempts and partial markers across restart', async () => {
 const f = await fixture(); f.receipt.complete = true; await f.save(); let calls = 0;
 for (let i=0;i<6;i++) await processFolder(f.folder, async () => { calls++; throw Error('offline'); }, i*100000);
 assert.equal(calls,8);
 const text = await readFile(join(f.folder, 'transcript.txt'), 'utf8'); assert.match(text,/PARTIAL/); assert.match(text,/missing-transcript/);
});
test('interrupted request consumes attempt; successful results survive and conflicting metadata refuses', async () => {
 const f = await fixture(); await processFolder(f.folder, async () => f.transcript);
 const path = join(f.folder,'processing.json'); const journal = JSON.parse(await readFile(path,'utf8'));
 journal.jobs[0].state = 'requesting'; journal.jobs[0].attempts = 1; journal.jobs[0].nextAt = 0; delete journal.jobs[0].transcript;
 await writeFile(path,JSON.stringify(journal)); let calls=0;
 await processFolder(f.folder, async () => { calls++; return f.transcript; }); assert.equal(calls,1);
 f.receipt.chunks[0] = { ...f.receipt.chunks[0], checksum: 'a'.repeat(64) }; await f.save();
 await assert.rejects(processFolder(f.folder,async () => f.transcript),/conflict/);
});
test('malformed response and audio corruption cannot produce final; credentials in URL refused', async () => {
 const f=await fixture(); f.receipt.complete=true; await f.save();
 await processFolder(f.folder,async () => ({...f.transcript, segments:[{text:'bad',startMs:-1,endMs:1}]}));
 assert.match(await readFile(join(f.folder,'transcript.txt'),'utf8'),/PARTIAL/);
 await writeFile(join(f.folder,'chunk-0.wav'),'changed');
 await assert.rejects(processFolder(f.folder,async()=>f.transcript),/Audio conflict/);
 assert.throws(()=>endpoint('https://user:pass@example.com')); assert.throws(()=>endpoint('http://example.com')); assert.equal(endpoint('https://example.com').pathname,'/api/recordings');
});
