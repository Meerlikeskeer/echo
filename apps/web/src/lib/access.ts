import { createHash, timingSafeEqual } from "node:crypto";

type AccessConfig = { username?: string; password?: string };
export type AccessDecision = "unconfigured" | "denied" | "allowed";

export function checkAccess(authorization: string | null, config: AccessConfig): AccessDecision {
  const { username, password } = config;
  if (!username?.trim() || username.includes(":") || !password || password.length < 32) return "unconfigured";
  if (!authorization) return "denied";
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(authorization);
  if (!match) return "denied";
  const decoded = Buffer.from(match[1], "base64");
  if (decoded.toString("base64") !== match[1]) return "denied";
  const expected = Buffer.from(`${username}:${password}`, "utf8");
  const digest = (value: Buffer) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(decoded), digest(expected)) ? "allowed" : "denied";
}
