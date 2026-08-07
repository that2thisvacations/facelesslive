"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { LogIn, LogOut, UserPlus } from "lucide-react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export function AuthPanel({ onUser }: { onUser: (user: User | null) => void }) {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const supabase = getSupabaseBrowser();

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      onUser(data.user ?? null);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      onUser(nextUser);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase, onUser]);

  async function signIn() {
    if (!supabase) return setMessage("Supabase environment variables are not configured.");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMessage(error ? error.message : "Signed in.");
  }

  async function signUp() {
    if (!supabase) return setMessage("Supabase environment variables are not configured.");
    const { error } = await supabase.auth.signUp({ email, password });
    setMessage(error ? error.message : "Account created. Check your email if confirmation is enabled.");
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setMessage("Signed out.");
  }

  if (user) {
    return <div className="authBar"><span>{user.email}</span><button className="ghostButton compact" onClick={signOut}><LogOut size={15}/> Sign out</button></div>;
  }

  return <div className="authPanel">
    <div className="authFields"><input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} /><input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
    <div className="authActions"><button className="primaryButton compact" onClick={signIn}><LogIn size={15}/> Sign in</button><button className="ghostButton compact" onClick={signUp}><UserPlus size={15}/> Create account</button></div>
    {message && <small className="helperText">{message}</small>}
  </div>;
}
