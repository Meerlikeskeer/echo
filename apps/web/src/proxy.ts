import { NextRequest, NextResponse } from "next/server";
import { checkAccess } from "./lib/access";

export function proxy(request: NextRequest) {
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
// Deliberately no exclusions: page, RSC, API, static assets and unknown paths are private.
