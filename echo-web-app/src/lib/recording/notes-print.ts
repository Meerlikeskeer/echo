import type { ArtifactRecord } from "./artifacts";
const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
export function notesPrintDocument(record: ArtifactRecord, disclosure: string): string {
  const guide = record.artifacts;
  const heading = (text: string) => `<h2>${escape(text)}</h2>`;
  const items = (title: string, rows: readonly string[]) => rows.length ? heading(title) + `<ul>${rows.map(row => `<li>${escape(row)}</li>`).join("")}</ul>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(guide.title)} — Echo notes</title><style>
    body{font:12pt/1.6 system-ui,sans-serif;color:#172015;max-width:46rem;margin:2rem auto;padding:0 1rem}h1{line-height:1.2}h2{font-size:15pt;break-after:avoid}li{margin:.5em 0}p{white-space:pre-wrap}button{padding:.6rem 1rem}@media print{button{display:none}body{margin:0;max-width:none}@page{margin:20mm}}
    </style></head><body><button type="button" onclick="window.print()">Save as PDF — choose Save as PDF in the print dialog</button><h1>${escape(guide.title)}</h1><p>${escape(disclosure)}</p>${guide.course ? `<p>${escape(guide.course)}</p>` : ""}${heading("Overview")}<p>${escape(guide.summary)}</p>${items("Key points", guide.keyPoints)}${guide.outline.map(section => items(section.heading, section.notes)).join("")}${items("Terms", guide.terms.map(term => `${term.term} — ${term.definition}`))}${items("Open questions", guide.openQuestions)}${items("Action items", guide.actionItems)}${items("Suggested research (not researched)", guide.researchTopics)}<footer>Echo · Session ${escape(record.sessionId)}</footer></body></html>`;
}
export function saveNotesPdf(record: ArtifactRecord, disclosure: string): void {
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("Allow pop-ups for Echo to save your notes as PDF.");
  popup.opener = null;
  popup.document.open();
  popup.document.write(notesPrintDocument(record, disclosure));
  popup.document.close();
  popup.focus();
  popup.print();
}
