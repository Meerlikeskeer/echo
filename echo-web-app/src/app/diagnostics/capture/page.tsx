import { notFound } from "next/navigation";
import { requireOwnerAccess } from "../../../lib/owner-access";
import { CaptureDiagnostics } from "./capture-diagnostics";

export const dynamic = "force-dynamic";

export default async function CaptureDiagnosticsPage() {
  await requireOwnerAccess();
  if (process.env.NODE_ENV !== "development") notFound();
  return <CaptureDiagnostics />;
}
