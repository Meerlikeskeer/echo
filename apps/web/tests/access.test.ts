import assert from "node:assert/strict";
import { test } from "node:test";
import { checkAccess } from "../src/lib/access";
const config = { username: "synthetic-owner", password: "synthetic-test-password-only-123456789" };
const basic = (value: string) => `Basic ${Buffer.from(value).toString("base64")}`;
test("missing or unsafe configuration fails closed even with credentials", () => {
  for (const value of [{}, { ...config, username: "" }, { ...config, username: "a:b" }, { ...config, password: "short" }]) {
    assert.equal(checkAccess(basic(`${config.username}:${config.password}`), value), "unconfigured");
  }
});
test("requires exact owner credentials", () => {
  assert.equal(checkAccess(basic(`${config.username}:${config.password}`), config), "allowed");
  for (const value of [null, "Bearer token", "Basic !!!", "Basic YQ", basic(`other:${config.password}`), basic(`${config.username}:wrong`), basic(`${config.username}:${config.password}:extra`)]) {
    assert.equal(checkAccess(value, config), "denied");
  }
});
