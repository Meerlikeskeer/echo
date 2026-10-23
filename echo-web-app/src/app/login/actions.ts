"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { authClient } from "../../lib/auth/supabase";
import { authConfig, sameOrigin } from "../../lib/auth/config";
async function clientForAction() {
  const config = authConfig(process.env);
  if (!sameOrigin((await headers()).get("origin"), config) || config.mode !== "accounts") throw new Error("Account access required.");
  return { client: await authClient(), config };
}
const feedback = (text: string): never => redirect(`/login?message=${encodeURIComponent(text)}`);
export async function signIn(form: FormData) {
  const {client} = await clientForAction();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (email.length > 254 || !email.includes("@") || password.length > 1024) feedback("Enter a valid email and password.");
  const {error} = await client.auth.signInWithPassword({email,password});
  if (error) feedback("Sign-in failed. Check your email/password and confirm your email first.");
  redirect("/");
}
export async function signUp(form: FormData) {
  const {client, config} = await clientForAction();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (email.length > 254 || !email.includes("@") || password.length < 12 || password.length > 1024) feedback("Use a valid email and a password of at least 12 characters.");
  const {error} = await client.auth.signUp({email, password, options: {emailRedirectTo: `${config.origin}/auth/callback`}});
  if (error) feedback("Account could not be created. Try again later or use sign-in.");
  feedback("Check your email to confirm your account, then sign in.");
}
export async function googleSignIn() {
  const {client,config} = await clientForAction();
  const {data,error} = await client.auth.signInWithOAuth({provider:"google", options:{redirectTo:`${config.origin}/auth/callback`, skipBrowserRedirect:true}});
  if (error || !data.url) feedback("Google sign-in is unavailable. Try again or use email.");
  redirect(data.url!);
}
export async function signOut(expectedUser: string) {
  const {client} = await clientForAction();
  const {data:{user}} = await client.auth.getUser();
  if (!user || user.id !== expectedUser) feedback("Your account changed. Reload before signing out.");
  const {error} = await client.auth.signOut({scope:"local"});
  if (error) redirect("/account?message=Sign-out+failed.+Try+again.");
  redirect("/login");
}
export async function requestPasswordReset(form: FormData) {
  const {client,config} = await clientForAction();
  const email = String(form.get("email") ?? "").trim();
  if (email.length > 254 || !email.includes("@")) feedback("Enter your email address first.");
  await client.auth.resetPasswordForEmail(email, {redirectTo: `${config.origin}/auth/callback?next=password`});
  feedback("If that account exists, a password reset email is on its way.");
}
