import { notFound } from "next/navigation";
import { requireOwnerAccess } from "../../../lib/owner-access";
import { QueueDiagnostics } from "./queue-diagnostics";

export const dynamic = "force-dynamic";
export default async function QueueDiagnosticsPage() {
  await requireOwnerAccess();
  if (process.env.NODE_ENV !== "development") notFound();
  return <QueueDiagnostics />;
}
