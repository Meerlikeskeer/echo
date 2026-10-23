import test from "node:test";
import assert from "node:assert/strict";
import { authConfig, accountMutationAllowed, browserNamespace, sameOrigin, identityMatches } from "../src/lib/auth/config";
import { encryptKeys, decryptKeys, validProviderKey } from "../src/lib/auth/credential-crypto";
import { InProcessJobLedger } from "../src/lib/recording/job-ledger";
const master = "ab".repeat(32);
const keys = {transcription:"synthetic-transcription-key",notes:"synthetic-notes-key"};
test("account configuration fails closed; absent mode preserves owner access", () => {
  assert.deepEqual(authConfig({}),{mode:"owner"});
  assert.deepEqual(authConfig({ECHO_AUTH_MODE:"typo"}),{mode:"invalid"});
  assert.deepEqual(authConfig({ECHO_AUTH_MODE:"accounts"}),{mode:"invalid"});
  const config = {ECHO_AUTH_MODE:"accounts",SUPABASE_URL:"https://auth.example",SUPABASE_PUBLISHABLE_KEY:"public-test",ECHO_APP_URL:"https://echo.example"};
  assert.equal(authConfig(config).mode,"accounts");
  for (const patch of [{ECHO_APP_URL:"https://attacker@echo.example"},{ECHO_APP_URL:"http://echo.example"},{ECHO_APP_URL:"https://echo.example/path"},{SUPABASE_URL:"http://auth.example"}]) assert.equal(authConfig({...config,...patch}).mode,"invalid");
  assert.equal(sameOrigin("https://evil.example",authConfig(config)),false);
  assert.equal(sameOrigin("https://echo.example",authConfig(config)),true);
});
test("saved keys use authenticated randomized encryption tied to the user", () => {
  const a = encryptKeys("user-a",keys,master), b = encryptKeys("user-a",keys,master);
  assert.notEqual(a,b); assert.ok(!a.includes(keys.notes));
  assert.deepEqual(decryptKeys("user-a",a,master),keys);
  assert.throws(() => decryptKeys("user-b",a,master));
  assert.throws(() => decryptKeys("user-a",a,"cd".repeat(32)));
  const parts = a.split("."); parts[3] = Buffer.from("changed").toString("base64");
  assert.throws(() => decryptKeys("user-a",parts.join("."),master));
  assert.throws(() => encryptKeys("a",keys,undefined));
  assert.equal(validProviderKey("with a space"),false);
});
test("account storage never shares owner or another user's namespace", () => {
  const a = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", b = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  assert.equal(browserNamespace("owner"),"");
  assert.notEqual(browserNamespace(a),browserNamespace(b));
  assert.notEqual(browserNamespace(a),browserNamespace("owner"));
  assert.throws(() => browserNamespace("../owner"));
  assert.equal(identityMatches(a,b),false); assert.equal(identityMatches(null,a),false); assert.equal(identityMatches(a,a),true);
});
test("identical audio and session IDs cannot share paid processing across accounts", async () => {
  const ledger = new InProcessJobLedger<string>();
  const key = {sessionId:"same-session",id:"same-chunk",checksum:"a".repeat(64)};
  assert.equal((await ledger.run({...key,ownerId:"a"},async()=>"a's transcript")).result,"a's transcript");
  assert.equal((await ledger.run({...key,ownerId:"b"},async()=>"b's transcript")).result,"b's transcript");
  assert.equal((await ledger.run({...key,ownerId:"a"},async()=>"should replay")).outcome,"replay");
});

test("an old settings/password form cannot mutate the newly signed-in account", () => {
  const config = authConfig({ECHO_AUTH_MODE:"accounts", SUPABASE_URL:"https://auth.example", SUPABASE_PUBLISHABLE_KEY:"public-test", ECHO_APP_URL:"https://echo.example"});
  assert.equal(accountMutationAllowed(config,"https://echo.example","account-a","account-b"),false);
  assert.equal(accountMutationAllowed(config,"https://evil.example","account-b","account-b"),false);
  assert.equal(accountMutationAllowed(config,null,"account-b","account-b"),false);
  assert.equal(accountMutationAllowed(config,"https://echo.example","account-b","account-b"),true);
});
