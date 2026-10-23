"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireOwnerAccess } from "../../lib/owner-access";
import { authConfig, accountMutationAllowed } from "../../lib/auth/config";
import { authClient } from "../../lib/auth/supabase";
import { encryptKeys, validProviderKey } from "../../lib/auth/credential-crypto";
async function accountAction(expectedUser: string) {
  const principal = await requireOwnerAccess();
  if (!accountMutationAllowed(authConfig(process.env),(await headers()).get("origin"),expectedUser,principal.id)) throw new Error("Your account changed. Reload before changing settings.");
  if (principal.id === "owner") throw new Error("Sign in to an account first.");
  return { principal, client: await authClient() };
}
export async function saveKeys(expectedUser: string, form: FormData) {
  const {principal,client} = await accountAction(expectedUser);
  const transcription = String(form.get("transcription") ?? "").trim();
  const notes = String(form.get("notes") ?? "").trim();
  if (!validProviderKey(transcription) || !validProviderKey(notes)) redirect("/account?message=Enter+both+valid+provider+keys.");
  let saved = false;
  try {
    const encrypted_keys = encryptKeys(principal.id,{transcription,notes},process.env.ECHO_CREDENTIAL_ENCRYPTION_KEY);
    const {error} = await client.from("provider_credentials").upsert({user_id:principal.id,encrypted_keys,updated_at:new Date().toISOString()});
    saved = !error;
  } catch { /* Fixed feedback: never include keys, SQL errors or upstream bodies. */ }
  redirect(saved ? "/account?message=Keys+saved.+Return+to+recording+to+use+them." : "/account?message=Keys+could+not+be+saved.+Ask+the+owner+to+check+account+setup.");
}
export async function removeKeys(expectedUser: string) {
  const {principal,client} = await accountAction(expectedUser);
  const {error} = await client.from("provider_credentials").delete().eq("user_id",principal.id);
  redirect(error ? "/account?message=Keys+could+not+be+removed.+Try+again." : "/account?message=Personal+keys+removed.+New+processing+is+disabled.");
}
export async function updatePassword(expectedUser: string, form: FormData) {
  const {client} = await accountAction(expectedUser);
  const password = String(form.get("password") ?? "");
  if (password.length < 12 || password.length > 1024) redirect("/account/password?message=Use+at+least+12+characters.");
  const {error} = await client.auth.updateUser({password});
  redirect(error ? "/account/password?message=Password+could+not+be+updated.+Try+a+new+recovery+link." : "/account?message=Password+updated.");
}
