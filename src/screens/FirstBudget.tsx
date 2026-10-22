import { useState } from 'react';
import { Button, CurrencyChips, Micro, Rule, TextInput } from '../components/ui';
import { CURRENCIES } from '../lib/money';
import { useBudget } from '../state/store';

/**
 * What you see with no budgets at all: start one, or accept a code for
 * someone else's.
 *
 * This is also all a stranger who signs up will ever see. An account on its
 * own opens nothing — access comes from owning a budget or being given a
 * code for one.
 */
export default function FirstBudget() {
  const { addProfile, joinProfile } = useBudget();
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<string>('TRY');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    await addProfile(name.trim() || 'Haushalt', currency);
    setBusy(false);
  }

  async function join() {
    setBusy(true);
    setMessage(null);
    try {
      await joinProfile(code.trim().toUpperCase());
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
            <Micro>No budgets yet</Micro>
            <p className="mt-3 text-[15px] leading-relaxed text-text-secondary">
              Start one of your own, or join a budget somebody has shared with
              you.
            </p>
            <Button variant="solid" className="mt-6 w-full" onClick={() => setMode('create')}>
              Start a budget
            </Button>
            <Button variant="outline" className="mt-3 w-full" onClick={() => setMode('join')}>
              Join with a code
            </Button>
          </>
        )}

        {mode === 'create' && (
          <>
            <Micro>Name it</Micro>
            <p className="mt-3 text-[15px] leading-relaxed text-text-secondary">
              After whoever or whatever the money belongs to. You can add more
              later, and share them one at a time.
            </p>
            <TextInput
              className="mt-4"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ev"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void create();
              }}
            />
            <div className="mt-4">
              <Micro>Currency</Micro>
              <CurrencyChips
                className="mt-2"
                value={currency}
                options={CURRENCIES}
                onChange={setCurrency}
              />
            </div>
            <Button variant="solid" className="mt-5 w-full" disabled={busy} onClick={create}>
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
              Ask whoever owns the budget for its code. They will find it under
              Settings. It lets you into that one budget and nothing else.
            </p>
            <TextInput
              className="mt-4 font-mono tnum text-[18px] uppercase tracking-[0.2em]"
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
