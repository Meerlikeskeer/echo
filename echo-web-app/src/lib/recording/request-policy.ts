/** Provider deadlines leave room for response validation inside the 300-second
 * route allowance. Chunk transcription and notes run sequentially. Browser
 * deadlines outlast the route, allowing its readable error to reach the user. */
export const TRANSCRIPTION_TIMEOUT_MS = 90_000;
export const CHUNK_NOTES_TIMEOUT_MS = 180_000;
export const ARTIFACT_TIMEOUT_MS = 240_000;
export const RECORDING_REQUEST_TIMEOUT_MS = 310_000;
export const ARTIFACT_REQUEST_TIMEOUT_MS = 310_000;
