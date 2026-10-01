import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { endpoint, runWorker } from './transcription';
const args = process.argv.slice(2);
const binary = args.shift()!;
const origin = process.env.ECHO_TRANSCRIPTION_ORIGIN;
if (!origin || !process.env.ECHO_OWNER_USERNAME || !process.env.ECHO_OWNER_PASSWORD) {
  console.error('Set ECHO_TRANSCRIPTION_ORIGIN and private ECHO_OWNER_USERNAME/ECHO_OWNER_PASSWORD environment variables. Provider keys remain on the web server.'); process.exit(2);
}
endpoint(origin);
let output = join(homedir(), 'Desktop/Echo-received');
const index = args.indexOf('--output'); if (index >= 0) output = args[index+1];
let done = false, code = 1;
let selected: string | undefined;
let buffered = '';
const childEnv = { ...process.env }; delete childEnv.ECHO_OWNER_USERNAME; delete childEnv.ECHO_OWNER_PASSWORD;
const child = spawn(binary, args, { stdio: ['inherit', 'pipe', 'inherit'], env: childEnv });
child.stdout.on('data', data => {
  process.stdout.write(data);
  buffered += data.toString();
  const lines = buffered.split('\n'); buffered = lines.pop()!;
  for (const line of lines) if (/^SESSION: [A-Za-z0-9-]{1,64}$/.test(line)) selected = line.slice(9);
});
child.on('exit', c => { code = c ?? 1; done = true; });
child.on('error', () => { done = true; });
process.on('SIGINT', () => { child.kill('SIGINT'); process.exit(130); });
process.on('SIGTERM', () => { child.kill('SIGTERM'); process.exit(143); });
runWorker(output, origin, () => done, () => selected).then(final => { console.log(final ? 'Transcription FINAL: all expected chunks processed.' : 'Transcription PARTIAL: inspect transcript.txt and processing.json.'); process.exitCode = code || (final ? 0 : 1); }).catch(() => {
  console.error('Transcription stopped safely; audio retained. Check configuration, spool conflicts or processing lock.'); process.exitCode = 1;
});
