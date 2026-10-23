import Link from "next/link";
import { requireOwnerAccess } from "../../lib/owner-access";
import { authClient } from "../../lib/auth/supabase";
import { saveKeys, removeKeys } from "./actions";
import { AccountBar } from "./account-bar";
export const dynamic = "force-dynamic";
export default async function Account({searchParams}: {searchParams: Promise<{message?:string}>}) {
  const principal = await requireOwnerAccess();
  if (principal.id === "owner") return <main className="account-panel"><h1>Owner prototype mode</h1><p>Enable account mode to manage personal API keys.</p><Link prefetch={false} href="/">Back to Echo</Link></main>;
  const client = await authClient();
  const {data,error} = await client.from("provider_credentials").select("updated_at").eq("user_id",principal.id).maybeSingle();
  const {message} = await searchParams;
  return <><AccountBar principal={principal}/><main className="account-panel"><h1>Your account</h1><p>{principal.email}</p><Link prefetch={false} href="/">Back to recording</Link>{message ? <p role="status">{message.slice(0,300)}</p> : null}
    <h2>Personal API keys</h2><p>{error ? "Saved-key status is unavailable. Ask the owner to check setup." : data ? "Personal keys are saved. Enter both to replace them." : "Add both keys to enable processing."}</p><p>Use keys for the transcription and notes providers configured by this Echo server. If both use the same provider, you may enter the same key twice. Keys are encrypted on the server and never shown again. Processing is billed to your provider account; its limits still apply. Echo never falls back to the owner’s keys.</p>
    <form action={saveKeys.bind(null,principal.id)}><label>Transcription API key<input name="transcription" type="password" autoComplete="off" required minLength={16} maxLength={4096}/></label><label>Notes API key<input name="notes" type="password" autoComplete="off" required minLength={16} maxLength={4096}/></label><button type="submit">Save personal keys</button></form>
    <form action={removeKeys.bind(null,principal.id)}><button type="submit">Remove saved keys</button></form><p>Removing keys prevents new requests. Work already sent to a provider may still finish and be billed.</p><p>Recordings remain on this browser under your account. Signing in on another laptop does not sync audio or notes. The old owner library is kept separate. Use a separate browser profile on shared computers.</p><Link prefetch={false} href="/account/password">Change password</Link>
  </main></>;
}
