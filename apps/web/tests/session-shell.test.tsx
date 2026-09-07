import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionShell } from "../src/app/session-shell";
test("empty session screen explains capture is unavailable and disables the action", () => {
  const html = renderToStaticMarkup(<SessionShell />);
  assert.match(html, /<h1[^>]*>Your sessions<\/h1>/);
  assert.match(html, /aria-labelledby="empty-title"/);
  assert.match(html, /No sessions yet/);
  assert.match(html, /<button disabled=""[^>]*>Recording coming soon<\/button>/);
  assert.match(html, /No audio is captured or sent to external providers/);
});
