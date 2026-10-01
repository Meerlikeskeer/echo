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
const child = spawn(binary, args, { stdio: 'inherit' });
child.on('exit', c => { code = c ?? 1; done = true; });
child.on('error', () => { done = true; });
process.on('SIGINT', () => { child.kill('SIGINT'); done = true; });
process.on('SIGTERM', () => { child.kill('SIGTERM'); done = true; });
runWorker(output, origin, () => done).then(() => { process.exitCode = code; }).catch(() => {
  child.kill('SIGTERM'); console.error('Transcription stopped safely; audio retained. Check configuration, spool conflicts or processing lock.'); process.exitCode = 1;
});
