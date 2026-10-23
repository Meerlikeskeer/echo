import { requireOwnerAccess } from "../../../lib/owner-access";
export const dynamic = "force-dynamic";
export async function GET() {
  try { const principal = await requireOwnerAccess(); return Response.json({userId:principal.id},{headers:{"cache-control":"private, no-store"}}); }
  catch { return Response.json({error:"Sign in required"},{status:401,headers:{"cache-control":"private, no-store"}}); }
}
