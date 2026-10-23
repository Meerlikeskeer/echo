import { NextResponse } from "next/server";
import { authClient } from "../../../lib/auth/supabase";
import { authConfig } from "../../../lib/auth/config";
export async function GET(request: Request) {
  const config = authConfig(process.env);
  if (config.mode !== "accounts") return new Response("Account access unavailable", {status:503});
  const incoming = new URL(request.url);
  const token_hash = incoming.searchParams.get("token_hash");
  const type = incoming.searchParams.get("type");
  if (token_hash && token_hash.length <= 4096 && (type === "signup" || type === "recovery")) {
    const {error} = await (await authClient()).auth.verifyOtp({token_hash,type});
    if (!error) return NextResponse.redirect(new URL(type === "recovery" ? "/account/password" : "/",config.origin));
  }
  return NextResponse.redirect(new URL("/login?message=Confirmation+link+expired+or+invalid.",config.origin));
}
