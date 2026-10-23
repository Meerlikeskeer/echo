import Link from "next/link";
import { authConfig } from "../../lib/auth/config";
import { signIn, signUp, googleSignIn, requestPasswordReset } from "./actions";
export const dynamic = "force-dynamic";
export default async function Login({searchParams}: {searchParams: Promise<{message?:string}>}) {
  const config = authConfig(process.env);
  if (config.mode !== "accounts") return <main className="account-panel"><h1>Account login is not configured</h1><p>Ask the owner to finish account setup.</p></main>;
  const {message} = await searchParams;
  return <main className="account-panel"><Link prefetch={false} href="/" className="wordmark">echo.</Link><h1>A space for your notes</h1><p>Sign in to your own workspace. Recordings stay in this browser; your API keys pay for processing.</p>
    {message ? <p role="status">{message.slice(0,300)}</p> : null}
    <form action={googleSignIn}><button type="submit">Continue with Google</button></form>
    <form action={signIn}><label>Email<input type="email" name="email" autoComplete="email" required maxLength={254} /></label><label>Password<input type="password" name="password" autoComplete="current-password" required maxLength={1024} /></label><button type="submit">Sign in</button><button type="submit" formAction={requestPasswordReset} formNoValidate>Forgot password?</button></form>
    <details><summary>Create an account with email</summary><form action={signUp}><label>Email<input type="email" name="email" autoComplete="email" required maxLength={254} /></label><label>Password (at least 12 characters)<input type="password" name="password" autoComplete="new-password" required minLength={12} maxLength={1024} /></label><button type="submit">Create account</button></form></details>
  </main>;
}
