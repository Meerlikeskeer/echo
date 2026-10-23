export const LIVE_NOTES_INTERVAL_MS = 60_000;
export function liveNotesDue(input: {
  enabled: boolean; online: boolean; visible: boolean; working: boolean; failed: boolean;
  revision: string | null; savedRevision: string | null; lastRevision: string | null;
  hasText: boolean; now: number; lastAttemptAt: number | null;
}): boolean {
  return input.enabled && input.online && input.visible && !input.working && !input.failed && input.hasText &&
    input.revision !== null && input.revision !== input.savedRevision && input.revision !== input.lastRevision &&
    (input.lastAttemptAt === null || input.now - input.lastAttemptAt >= LIVE_NOTES_INTERVAL_MS);
}
