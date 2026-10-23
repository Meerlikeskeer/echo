import { NextResponse } from "next/server";
import { authClient } from "../../../lib/auth/supabase";
import { authConfig } from "../../../lib/auth/config";
export async function GET(request: Request) {
  const config = authConfig(process.env);
  if (config.mode !== "accounts") return new Response("Account access unavailable", {status:503});
  const incoming = new URL(request.url);
  const code = incoming.searchParams.get("code");
  if (code && code.length <= 4096) {
    const {error} = await (await authClient()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(incoming.searchParams.get("next") === "password" ? "/account/password" : "/",config.origin));
  }
  return NextResponse.redirect(new URL("/login?message=Sign-in+link+expired+or+invalid.+Try+again.",config.origin));
}
