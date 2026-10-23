"use client";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { browserNamespace } from "../lib/auth/config";
import { scopedStorage } from "../lib/auth/browser-storage";
const Identity = createContext("owner");
export function useWorkspaceIdentity() {
  const userId = useContext(Identity);
  return { userId, namespace: browserNamespace(userId), storage: useMemo(() => scopedStorage(userId), [userId]) };
}
export function WorkspaceIdentity({userId,children}: {userId:string;children:ReactNode}) {
  const [active,setActive] = useState(true);
  useEffect(() => {
    if (userId === "owner") return;
    let mounted = true;
    const stop = () => { if (mounted) setActive(false); };
    const changed = (event: StorageEvent) => { if (event.key === "echo-active-account" && event.newValue !== userId) stop(); };
    try { localStorage.setItem("echo-active-account",userId); } catch { /* Audio storage reports its own errors. */ }
    window.addEventListener("storage",changed);
    const verify = async () => {
      try {
        const response = await fetch("/api/account", { cache:"no-store" });
        if (response.status === 401 || response.ok && (await response.json()).userId !== userId) stop();
      } catch { /* Offline capture remains local; server checks identity before processing. */ }
    };
    const timer = setInterval(() => { void verify(); },10000);
    return () => { mounted = false; clearInterval(timer); window.removeEventListener("storage",changed); };
  },[userId]);
  return active ? <Identity.Provider value={userId}>{children}</Identity.Provider> : <main className="account-panel"><h1>Your account changed</h1><p>Recording and processing have stopped in this tab. Saved recordings remain under the original account.</p><form action="/" method="get"><button type="submit">Open current account</button></form></main>;
}
