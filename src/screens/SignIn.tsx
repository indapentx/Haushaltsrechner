import { useState } from 'react';
import { isConfigured, supabase } from '../lib/supabase';
import { Button, Micro, Rule, TextInput } from '../components/ui';

/**
 * Email only — no passwords, no OAuth.
 *
 * Link only, no six-digit code: Supabase will not let the email template be
 * edited on the free tier without custom SMTP, and its default template sends
 * a link and nothing else. See the README for how to add the code back if
 * SMTP is ever configured.
 */
export default function SignIn() {
  const [email, setEmail] = useState('');
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
        <div>
          <Micro>Check your email</Micro>
          <p className="mt-3 text-[15px] leading-relaxed text-text-secondary">
            A sign-in link is on its way to{' '}
            <span className="text-text">{email}</span>. Open it on this device
            and you will land back here signed in.
          </p>
          <div className="mt-6 flex justify-between">
            <Button
              variant="quiet"
              className="px-0"
              onClick={() => {
                setSent(false);
                setMessage(null);
              }}
            >
              Change email
            </Button>
            <Button variant="quiet" className="px-0" disabled={busy} onClick={() => sendLink()}>
              Resend
            </Button>
          </div>
        </div>
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
