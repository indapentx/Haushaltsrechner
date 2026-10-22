import { useState } from 'react';
import { Button, Micro, Rule, TextInput } from '../components/ui';
import { useBudget } from '../state/store';

/**
 * Where you land with an account but no household: either start one, or
 * join the one someone you live with has already made.
 *
 * This is also what a stranger who signs up sees — and all they will ever
 * see, because row-level security gives an account with no membership
 * access to nothing.
 */
export default function HouseholdGate() {
  const { createHousehold, joinHousehold } = useBudget();
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setMessage(null);
    await createHousehold(name.trim() || 'Haushalt');
    setBusy(false);
  }

  async function join() {
    setBusy(true);
    setMessage(null);
    try {
      await joinHousehold(code.trim().toUpperCase());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  return (
    <div className="min-h-dvh bg-ink px-6 pt-[max(env(safe-area-inset-top),4rem)] pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto w-full max-w-sm">
        <Micro className="text-text">Haushaltsrechner</Micro>
        <Rule className="mt-3 mb-8" />

        {mode === 'choose' && (
          <>
            <Micro>No household yet</Micro>
            <p className="mt-3 text-[15px] leading-relaxed text-text-secondary">
              A household holds the budgets. Everyone who lives in it shares the
              same one, each from their own account.
            </p>
            <Button variant="solid" className="mt-6 w-full" onClick={() => setMode('create')}>
              Start a household
            </Button>
            <Button variant="outline" className="mt-3 w-full" onClick={() => setMode('join')}>
              Join with a code
            </Button>
          </>
        )}

        {mode === 'create' && (
          <>
            <Micro>Name the household</Micro>
            <TextInput
              className="mt-3"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Haushalt"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void create();
              }}
            />
            <Button variant="solid" className="mt-4 w-full" disabled={busy} onClick={create}>
              {busy ? 'Creating' : 'Create'}
            </Button>
            <Button variant="quiet" className="mt-3 w-full" onClick={() => setMode('choose')}>
              Back
            </Button>
          </>
        )}

        {mode === 'join' && (
          <>
            <Micro>Join code</Micro>
            <p className="mt-3 text-[15px] leading-relaxed text-text-secondary">
              Ask whoever set up the household for the code. They will find it
              under Settings.
            </p>
            <TextInput
              className="mt-4 font-mono tnum text-[18px] tracking-[0.2em] uppercase"
              value={code}
              autoCapitalize="characters"
              autoCorrect="off"
              maxLength={9}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void join();
              }}
            />
            <Button
              variant="solid"
              className="mt-4 w-full"
              disabled={busy || code.trim().length < 8}
              onClick={join}
            >
              {busy ? 'Joining' : 'Join'}
            </Button>
            <Button variant="quiet" className="mt-3 w-full" onClick={() => setMode('choose')}>
              Back
            </Button>
          </>
        )}

        {message && (
          <p className="mt-6 border border-rule p-3 text-[13px] leading-relaxed text-text-secondary">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
