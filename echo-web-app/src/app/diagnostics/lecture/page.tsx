import { notFound } from "next/navigation";
import { requireOwnerAccess } from "../../../lib/owner-access";
import { LectureDiagnostics } from "./lecture-diagnostics";
export const dynamic = "force-dynamic";
export default async function LectureDiagnosticsPage() {
  await requireOwnerAccess();
  if (process.env.NODE_ENV !== "development") notFound();
  return <LectureDiagnostics />;
}
