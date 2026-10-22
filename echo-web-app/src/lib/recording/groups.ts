export const AUTOMATIC_GROUPS = ["Class", "Workplace", "People", "Discussion"] as const;
const key = "echo-groups-v1";
export function groupName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 60) throw new Error("Use a group name between 1 and 60 characters.");
  return value.trim();
}
export function readGroups(storage: Pick<Storage, "getItem">): string[] {
  const saved: unknown = JSON.parse(storage.getItem(key) ?? "[]");
  if (!Array.isArray(saved) || saved.length > 100) throw new Error("Saved groups could not be read.");
  return [...new Set([...AUTOMATIC_GROUPS, ...saved.map(groupName)])];
}
export function addGroup(storage: Pick<Storage, "getItem" | "setItem">, value: string): string[] {
  const groups = readGroups(storage);
  const name = groupName(value);
  if (!groups.some(group => group.toLowerCase() === name.toLowerCase())) groups.push(name);
  if (groups.length > 100) throw new Error("The library supports up to 100 groups.");
  storage.setItem(key, JSON.stringify(groups));
  return groups;
}
// Ambiguous content stays unsorted; no identity or relationship is inferred.
export function automaticGroup(text: string): string | null {
  const rules = [
    ["Class", /\b(lecture|professor|syllabus|homework|midterm|semester)\b/gi],
    ["Workplace", /\b(project deadline|sprint|stakeholder|client meeting|quarterly|deliverable)\b/gi],
    ["People", /\b(family|friend|birthday|reunion|weekend plans)\b/gi],
    ["Discussion", /\b(discuss|discussion|debate|perspective|opinion)\b/gi],
  ] as const;
  const scores = rules.map(([name, rule]) => ({ name, score: new Set(text.toLowerCase().match(rule) ?? []).size })).sort((a, b) => b.score - a.score);
  return scores[0].score >= 2 && scores[0].score > scores[1].score ? scores[0].name : null;
}
