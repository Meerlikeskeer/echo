/** Suggestions only. Dates are preserved as spoken, never silently scheduled. */
export interface QuickNote {
  readonly items: readonly {
    readonly kind: "task" | "reminder" | "note" | "idea";
    readonly text: string;
    readonly dateText: string | null;
  }[];
}

export function validateQuickNote(value: unknown): QuickNote | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some(key => key !== "items") || !Array.isArray(raw.items) || !raw.items.length || raw.items.length > 20) return null;
  const items: QuickNote["items"][number][] = [];
  const seen = new Set<string>();
  for (const value of raw.items) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const item = value as Record<string, unknown>;
    if (Object.keys(item).some(key => !["kind", "text", "dateText"].includes(key)) ||
        !["task", "reminder", "note", "idea"].includes(item.kind as string) ||
        typeof item.text !== "string" || !item.text.trim() || item.text.length > 500 ||
        !(item.dateText === null || (typeof item.dateText === "string" && item.dateText.trim().length > 0 && item.dateText.length <= 200))) return null;
    const text = item.text.trim();
    const key = `${item.kind}:${text.toLowerCase().replace(/\s+/g, " ")}`;
    if (seen.has(key)) return null;
    seen.add(key);
    items.push({ kind: item.kind as QuickNote["items"][number]["kind"], text, dateText: typeof item.dateText === "string" ? item.dateText.trim() : null });
  }
  return { items };
}

export interface QuickNoteCapture {
  readonly stoppedAt: number;
  readonly onlineAtStop: boolean;
}

export function isQuickNoteCapture(value: unknown): value is QuickNoteCapture {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  return Object.keys(raw).every(key => key === "stoppedAt" || key === "onlineAtStop") &&
    Number.isSafeInteger(raw.stoppedAt) && (raw.stoppedAt as number) > 0 && typeof raw.onlineAtStop === "boolean";
}
