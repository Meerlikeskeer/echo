import Link from "next/link";
import type { Principal } from "../../lib/owner-access";
import { signOut } from "../login/actions";
export function AccountBar({principal}: {principal: Principal}) {
  return principal.id !== "owner" ? <div className="account-bar"><Link prefetch={false} href="/account">Account & API keys</Link><form action={signOut.bind(null,principal.id)}><button type="submit">Sign out</button></form></div> : null;
}
