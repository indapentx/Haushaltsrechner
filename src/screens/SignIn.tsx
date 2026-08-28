import { useState } from 'react';
import { isConfigured, supabase } from '../lib/supabase';
import { Button, Micro, Rule, TextInput } from '../components/ui';

/**
 * Email and password.
 *
 * A deliberate departure from the spec's "magic link only": this app gets
 * opened once or twice a month, and iOS deletes a site's stored session after
 * seven days without a visit. With magic links that meant an email round trip
 * on every single visit. A password is autofilled by iCloud Keychain instead,
 * and it also removes the reason the app could not be installed to the home
 * screen — installed apps are exempt from the seven-day rule, so the session
 * now survives indefinitely.
 *
 * There is no sign-up form on purpose. The one account is created by hand in
 * the Supabase dashboard, so the public URL cannot be used by a stranger to
 * make accounts in the project. See the README.
 */
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e?: { preventDefault: () => void }) {
    e?.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      setMessage(
        error.message === 'Invalid login credentials'
          ? 'That email and password do not match an account.'
          : error.message,
      );
    }
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
      {/* A real form with these autocomplete values is what lets iCloud
          Keychain offer to save and then fill the pair. */}
      <form onSubmit={submit}>
        <label className="block">
          <Micro>Email</Micro>
          <TextInput
            className="mt-2"
            type="email"
            name="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </label>

        <label className="mt-5 block">
          <Micro>Password</Micro>
          <TextInput
            className="mt-2"
            type="password"
            name="password"
            autoComplete="current-password"
            enterKeyHint="go"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        <Button
          type="submit"
          variant="solid"
          className="mt-6 w-full"
          disabled={busy || !email.trim() || !password}
        >
          {busy ? 'Signing in' : 'Sign in'}
        </Button>
      </form>

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
