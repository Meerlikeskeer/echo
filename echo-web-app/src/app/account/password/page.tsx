import Link from "next/link";
import { requireOwnerAccess } from "../../../lib/owner-access";
import { updatePassword } from "../actions";
export const dynamic = "force-dynamic";
export default async function Password({searchParams}: {searchParams: Promise<{message?:string}>}) {
  const principal = await requireOwnerAccess();
  const {message} = await searchParams;
  return <main className="account-panel"><h1>Set a new password</h1>{message ? <p role="status">{message.slice(0,300)}</p> : null}<form action={updatePassword.bind(null,principal.id)}><label>New password<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={1024}/></label><button type="submit">Update password</button></form><Link prefetch={false} href="/account">Back to account</Link></main>;
}
