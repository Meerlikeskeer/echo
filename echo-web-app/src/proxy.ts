import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { authConfig } from "./lib/auth/config";
import { checkAccess } from "./lib/access";

export async function proxy(request: NextRequest) {
  const config = authConfig(process.env);
  if (config.mode === "invalid") return new NextResponse("Account access is not configured.", { status: 503, headers: { "cache-control": "private, no-store" } });
  if (config.mode === "accounts") {
    const path = request.nextUrl.pathname;
    if (path.startsWith("/_next/static/")) return NextResponse.next();
    let response = NextResponse.next({ request });
    const client = createServerClient(config.url, config.publicKey, {
      cookieOptions: { name: "echo-account-session", httpOnly: true, secure: config.origin.startsWith("https:"), sameSite: "lax", path: "/" },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: values => {
          for (const {name, value} of values) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const {name, value, options} of values) response.cookies.set(name, value, options);
        },
      },
    });
    let allowed = false;
    try { const { data: { user }, error } = await client.auth.getUser(); allowed = !!user && !error; } catch { /* Fail closed. */ }
    const publicPath = path === "/login" || path === "/auth/callback" || path === "/auth/confirm";
    if (!allowed && !publicPath) {
      const rejected = path.startsWith("/api/")
        ? NextResponse.json({ error: { message: "Sign in required.", retryable: false } }, { status: 401 })
        : NextResponse.redirect(new URL("/login", config.origin));
      for (const cookie of response.cookies.getAll()) rejected.cookies.set(cookie);
      response = rejected;
    }
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  }
  const decision = checkAccess(request.headers.get("authorization"), {
    username: process.env.ECHO_OWNER_USERNAME,
    password: process.env.ECHO_OWNER_PASSWORD,
  });
  const response = decision === "allowed" ? NextResponse.next() : new NextResponse(
    decision === "unconfigured" ? "Private access is not configured." : "Private access required.",
    { status: decision === "unconfigured" ? 503 : 401 },
  );
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Content-Type-Options", "nosniff");
  if (decision === "denied") response.headers.set("WWW-Authenticate", 'Basic realm="Echo", charset="UTF-8"');
  return response;
}
// Owner mode keeps every path private. Account mode exposes only sign-in and compiled assets.
