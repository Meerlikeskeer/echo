import { createHash } from 'node:crypto';
import { open, readFile, rename, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { isAudioChunk, validateChunkOrder, type AudioChunk } from '../../echo-web-app/src/lib/recording/session';
import { sameMetadata } from '../../echo-web-app/src/lib/recording/session-completion';
import { stitchSession } from '../../echo-web-app/src/lib/recording/stitching';
import type { Transcript } from '../../echo-web-app/src/lib/providers/types';

export class NonRetryable extends Error {}
export interface Receipt { version: number; sessionId: string; complete: boolean; chunks: AudioChunk[] }
interface Job { metadata: AudioChunk; attempts: number; nextAt: number; state: 'pending' | 'requesting' | 'failed' | 'done'; transcript?: Transcript }
interface Journal { version: 1; jobs: Job[]; receipt: Receipt }
export async function publish(path: string, value: string) {
  const temp = `${path}.part`;
  const fd = await open(temp, 'w', 0o600);
  try { await fd.writeFile(value); await fd.sync(); } finally { await fd.close(); }
  await rename(temp, path);
  const dir = await open(join(path, '..'), 'r');
  try { await dir.sync(); } finally { await dir.close(); }
}
async function optional(path: string) {
  try { return await readFile(path, 'utf8'); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; }
}
export function validateReceipt(r: Receipt) {
  if (r.version !== 1 || !/^[A-Za-z0-9-]{1,64}$/.test(r.sessionId) || typeof r.complete !== 'boolean' || !Array.isArray(r.chunks) || r.chunks.length > 130 || (r.complete && !r.chunks.length) || !r.chunks.every(c => isAudioChunk(c) && c.sessionId === r.sessionId && c.id === `${r.sessionId}-${c.sequence}`)) throw Error('Invalid receipt');
  validateChunkOrder(r.chunks);
}
export async function processFolder(folder: string, send: (c: AudioChunk, audio: Buffer) => Promise<Transcript>, now = Date.now()) {
  const r: Receipt = JSON.parse(await readFile(join(folder, 'receipt.json'), 'utf8'));
  validateReceipt(r);
  const path = join(folder, 'processing.json');
  const saved = await optional(path);
  const journal: Journal = saved ? JSON.parse(saved) : { version: 1, jobs: [], receipt: r };
  if (journal.version !== 1 || !Array.isArray(journal.jobs)) throw Error('Invalid processing journal');
  validateReceipt(journal.receipt);
  const prior = journal.receipt;
  if (prior.sessionId !== r.sessionId || prior.chunks.length > r.chunks.length || prior.chunks.some((c, i) => !sameMetadata(c, r.chunks[i])) || (prior.complete && !r.complete)) throw Error('Receipt conflict');
  for (const job of journal.jobs) {
    if (!r.chunks.some(c => sameMetadata(c, job.metadata)) || !Number.isInteger(job.attempts) || job.attempts < 0 || job.attempts > 4 || !Number.isFinite(job.nextAt) || !['pending','requesting','failed','done'].includes(job.state)) throw Error('Journal conflict');
  }
  if (new Set(journal.jobs.map(j => j.metadata.id)).size !== journal.jobs.length) throw Error('Duplicate jobs');
  journal.receipt = r;
  for (const c of r.chunks) if (!journal.jobs.some(j => j.metadata.id === c.id)) journal.jobs.push({ metadata: c, attempts: 0, nextAt: 0, state: 'pending' });
  const save = () => publish(path, JSON.stringify(journal));
  const render = async () => {
    const stitched = stitchSession({ sessionId: r.sessionId, chunks: journal.jobs.map(j => ({ metadata: j.metadata, transcript: j.state === 'done' ? j.transcript : undefined })), completion: r.complete ? { sessionId: r.sessionId, chunks: r.chunks } : null });
    if (stitched.gaps.some(g => g.reason === 'invalid-input')) throw Error('Invalid persisted transcript');
    await publish(join(folder, 'transcript.json'), JSON.stringify(stitched));
    await publish(join(folder, 'transcript.txt'), `${stitched.status.toUpperCase()}\n${stitched.gaps.map(g => `[${g.reason}: ${g.sequence ?? 'session'}]`).join('\n')}\n${stitched.text}\n`);
    return stitched.status;
  };
  // Publish partial evidence before any slow request. Never infer device completion.
  await save(); await render();
  for (const job of journal.jobs) {
    const audio = await readFile(join(folder, `chunk-${job.metadata.sequence}.wav`));
    if (audio.length !== job.metadata.size || createHash('sha256').update(audio).digest('hex') !== job.metadata.checksum) throw Error('Audio conflict');
    if (job.state === 'done') {
      await publish(join(folder, `chunk-${job.metadata.sequence}.txt`), job.transcript!.text + '\n');
      continue;
    }
    if (job.attempts >= 4) { job.state = 'failed'; continue; }
    if (now < job.nextAt) continue;
    job.state = 'requesting'; job.attempts++; job.nextAt = now + Math.min(60000, 2000 * 2 ** job.attempts); await save();
    let transcript: Transcript;
    try { transcript = await send(job.metadata, audio); } catch (error) {
      if (error instanceof NonRetryable) job.attempts = 4;
      job.state = job.attempts >= 4 ? 'failed' : 'pending'; await save(); continue;
    }
    const validation = stitchSession({ sessionId: r.sessionId, chunks: [{ metadata: job.metadata, transcript }], completion: null });
    if (!transcript?.text?.trim() || validation.gaps.some(g => g.reason === 'invalid-input')) {
      job.state = 'failed'; job.attempts = 4; await save(); continue;
    }
    job.transcript = transcript; job.state = 'done'; await save();
    await publish(join(folder, `chunk-${job.metadata.sequence}.txt`), transcript.text + '\n');
    await render();
  }
  await save();
  return { status: await render(), exhausted: journal.jobs.every(j => j.state === 'done' || j.attempts >= 4) };
}

export function endpoint(origin: string) {
  const url = new URL(origin);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname)))) throw Error('Use an HTTPS origin or loopback HTTP');
  return new URL('/api/recordings', url);
}
export async function runWorker(output: string, origin: string, done: () => boolean, selected: () => string | undefined) {
  const url = endpoint(origin);
  const user = process.env.ECHO_OWNER_USERNAME, password = process.env.ECHO_OWNER_PASSWORD;
  if (!user || !password) throw Error('Set ECHO_OWNER_USERNAME and ECHO_OWNER_PASSWORD privately in the environment');
  await mkdir(output, { recursive: true, mode: 0o700 });
  const lockPath = join(output, '.transcription-lock');
  const previousLock = await optional(lockPath);
  if (previousLock !== null) {
    const pid = Number(previousLock);
    if (!Number.isInteger(pid) || pid <= 0) throw Error('Invalid processing lock');
    try { process.kill(pid, 0); throw Error('Processing already active'); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; }
    const { unlink } = await import('node:fs/promises'); await unlink(lockPath);
  }
  const lock = await open(lockPath, 'wx', 0o600);
  await lock.writeFile(String(process.pid)); await lock.sync(); await lock.close();
  const send = async (c: AudioChunk, audio: Buffer): Promise<Transcript> => {
    const form = new FormData();
    form.set('mode', 'transcription-only'); form.set('chunk', JSON.stringify(c)); form.set('durationMs', String(c.endMs-c.startMs));
    form.set('audio', new Blob([new Uint8Array(audio)], { type: c.mimeType }), 'chunk.wav');
    const response = await fetch(url, { method: 'POST', body: form, redirect: 'error', signal: AbortSignal.timeout(310000), headers: { authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}` } });
    if (!response.ok) {
      if ([400,401,403,413,422].includes(response.status)) throw new NonRetryable('Request refused');
      throw Error('Processing request failed');
    }
    const body = await response.json();
    if (!body.chunk || !sameMetadata(c, body.chunk)) throw new NonRetryable('Response identity conflict');
    return body.transcript;
  };
  try {
    for (;;) {
      let settled = true;
      for (const name of await readdir(output)) {
        if (name !== selected() || !/^[A-Za-z0-9-]{1,64}$/.test(name) || !await optional(join(output, name, 'receipt.json'))) continue;
        const result = await processFolder(join(output, name), send);
        if (!result.exhausted) settled = false;
      }
      if (done() && settled) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  } finally { const { unlink } = await import('node:fs/promises'); await unlink(join(output, '.transcription-lock')); }
}
