import { useState } from 'react';
import { isConfigured, supabase } from '../lib/supabase';
import { Button, Micro, Rule, TextInput } from '../components/ui';

/**
 * Email only — no passwords, no OAuth.
 *
 * The email carries both a link and a 6-digit code. The link is for the
 * laptop. The code is for the iPhone: a link tapped in Mail opens Safari,
 * and a home-screen PWA has its own storage, so a session created in Safari
 * leaves the installed app still signed out. Typing the code into the PWA
 * creates the session where it is actually needed.
 */
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sendLink(e?: { preventDefault: () => void }) {
    e?.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setMessage(error.message);
    else setSent(true);
  }

  async function verifyCode(e?: { preventDefault: () => void }) {
    e?.preventDefault();
    const token = code.replace(/\D/g, '');
    if (token.length < 6) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: 'email',
    });
    setBusy(false);
    if (error) setMessage(error.message);
    // Success needs no handling: onAuthStateChange swaps the screen.
  }

  if (!isConfigured) {
    return (
      <Shell>
        <Micro>Not configured</Micro>
        <p className="mt-4 text-text-secondary text-[15px] leading-relaxed">
          Set <span className="font-mono text-text">VITE_SUPABASE_URL</span> and{' '}
          <span className="font-mono text-text">VITE_SUPABASE_ANON_KEY</span> in{' '}
          <span className="font-mono text-text">.env.local</span>, then restart the dev
          server.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      {!sent ? (
        <form onSubmit={sendLink}>
          <label className="block">
            <Micro>Email</Micro>
            <TextInput
              className="mt-2"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>
          <Button type="submit" variant="solid" className="mt-5 w-full" disabled={busy || !email.trim()}>
            {busy ? 'Sending' : 'Send link'}
          </Button>
        </form>
      ) : (
        <form onSubmit={verifyCode}>
          <Micro>Check your email</Micro>
          <p className="mt-3 text-text-secondary text-[15px] leading-relaxed">
            Sent to <span className="text-text">{email}</span>. Tap the link on this
            device, or type the six-digit code below.
          </p>
          <div className="mt-6">
            <label className="block">
              <Micro>Code</Micro>
              <TextInput
                className="mt-2 font-mono tnum text-[20px] tracking-[0.3em]"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
              />
            </label>
          </div>
          <Button type="submit" variant="solid" className="mt-5 w-full" disabled={busy || code.length < 6}>
            {busy ? 'Checking' : 'Sign in'}
          </Button>
          <div className="mt-4 flex justify-between">
            <Button
              variant="quiet"
              className="px-0"
              onClick={() => {
                setSent(false);
                setCode('');
                setMessage(null);
              }}
            >
              Change email
            </Button>
            <Button variant="quiet" className="px-0" disabled={busy} onClick={() => sendLink()}>
              Resend
            </Button>
          </div>
        </form>
      )}

      {message && (
        <p className="mt-6 border border-rule p-3 text-[13px] leading-relaxed text-text-secondary">
          {message}
        </p>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-ink px-6 pt-[max(env(safe-area-inset-top),4rem)] pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto w-full max-w-sm">
        <Micro className="text-text">Haushaltsrechner</Micro>
        <Rule className="mt-3 mb-8" />
        {children}
      </div>
    </div>
  );
}
