import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
function encryptionKey(value: string | undefined): Buffer {
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) throw new Error("Credential encryption is not configured.");
  return Buffer.from(value, "hex");
}
export function encryptKeys(userId: string, keys: { transcription: string; notes: string }, masterKey: string | undefined): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(masterKey), iv);
  cipher.setAAD(Buffer.from(userId));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(keys), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(".");
}
export function decryptKeys(userId: string, payload: string, masterKey: string | undefined): { transcription: string; notes: string } {
  const [version, iv, tag, data, extra] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !data || extra || payload.length > 16000) throw new Error("Saved keys could not be read.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(masterKey), Buffer.from(iv,"base64"));
  decipher.setAAD(Buffer.from(userId)); decipher.setAuthTag(Buffer.from(tag,"base64"));
  const keys = JSON.parse(Buffer.concat([decipher.update(Buffer.from(data,"base64")), decipher.final()]).toString("utf8"));
  if (!keys || !validProviderKey(keys.transcription) || !validProviderKey(keys.notes)) throw new Error("Saved keys could not be read.");
  return { transcription: keys.transcription, notes: keys.notes };
}
export function validProviderKey(value: unknown): value is string { return typeof value === "string" && value.length >= 16 && value.length <= 4096 && !/\s/.test(value); }
