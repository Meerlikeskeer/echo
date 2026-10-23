/** Never queue a destructive action behind another tab's active recording. */
export async function withLibraryDeletion<T>(locks: Pick<LockManager, "request">, run: () => Promise<T>, sessionId = ""): Promise<T> {
  const names = ["echo-capture", "echo-device-import", "echo-audio-queue-drain", `echo-session-notes/${sessionId}`];
  async function acquire(index: number): Promise<T> {
    if (index === names.length) return run();
    return locks.request(names[index], { ifAvailable: true }, async lock => {
      if (!lock) throw new Error("Another Echo tab is recording, importing or processing. Try deleting when it finishes.");
      return acquire(index + 1);
    });
  }
  return acquire(0);
}
