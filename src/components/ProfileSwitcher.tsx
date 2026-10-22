import { useState } from 'react';
import { useBudget } from '../state/store';
import { CURRENCIES } from '../lib/money';
import { Button, CurrencyChips, Micro, Modal, TextInput } from './ui';

/** Active profile is a filled pill; the rest are outlined. No hue involved. */
export function ProfileSwitcher() {
  const { profiles, activeProfileId, selectProfile, addProfile, joinProfile } = useBudget();
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<string>('TRY');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  function close() {
    setAdding(false);
    setMode('create');
    setName('');
    setCode('');
    setCurrency('TRY');
    setMessage(null);
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await addProfile(trimmed, currency);
    close();
  }

  async function submitJoin() {
    setMessage(null);
    try {
      await joinProfile(code.trim().toUpperCase());
      close();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <>
      <div className="flex gap-2 overflow-x-auto px-5 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {profiles.map((profile) => {
          const active = profile.id === activeProfileId;
          return (
            <button
              key={profile.id}
              type="button"
              onClick={() => selectProfile(profile.id)}
              aria-current={active ? 'true' : undefined}
              className={`min-h-9 shrink-0 rounded-full px-4 text-[14px] transition-colors ${
                active
                  ? 'bg-white text-black'
                  : 'border border-rule text-text-secondary active:bg-surface-raised'
              }`}
            >
              {profile.name}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setAdding(true)}
          aria-label="New or shared budget"
          className="min-h-9 w-9 shrink-0 rounded-full border border-rule text-text-secondary active:bg-surface-raised"
        >
          +
        </button>
      </div>

      <Modal open={adding} onClose={close} title={mode === 'create' ? 'New budget' : 'Join a budget'}>
        <div className="mb-5 flex gap-2">
          <button
            type="button"
            onClick={() => setMode('create')}
            className={`micro min-h-9 flex-1 ${
              mode === 'create' ? 'bg-white text-black' : 'border border-rule text-text-secondary'
            }`}
          >
            New
          </button>
          <button
            type="button"
            onClick={() => setMode('join')}
            className={`micro min-h-9 flex-1 ${
              mode === 'join' ? 'bg-white text-black' : 'border border-rule text-text-secondary'
            }`}
          >
            Join
          </button>
        </div>

        {mode === 'join' ? (
          <>
            <Micro>Join code</Micro>
            <TextInput
              className="mt-2 font-mono tnum text-[18px] uppercase tracking-[0.2em]"
              value={code}
              autoCapitalize="characters"
              autoCorrect="off"
              maxLength={9}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitJoin();
              }}
            />
            <p className="mt-3 text-[13px] leading-relaxed text-text-muted">
              Opens the one budget the code belongs to, and nothing else.
            </p>
            {message && (
              <p className="mt-4 border border-rule p-3 text-[13px] leading-relaxed text-text-secondary">
                {message}
              </p>
            )}
            <div className="mt-6 flex gap-3">
              <Button variant="quiet" className="flex-1" onClick={close}>
                Cancel
              </Button>
              <Button
                variant="solid"
                className="flex-1"
                disabled={code.trim().length < 8}
                onClick={submitJoin}
              >
                Join
              </Button>
            </div>
          </>
        ) : (
          <>
        <label className="block">
          <Micro>Name</Micro>
          <TextInput
            className="mt-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
            placeholder="Household"
          />
        </label>
        <div className="mt-4">
          <Micro>Currency</Micro>
          <CurrencyChips
            className="mt-2"
            value={currency}
            options={CURRENCIES}
            onChange={setCurrency}
          />
        </div>
        <div className="mt-6 flex gap-3">
          <Button variant="quiet" className="flex-1" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="solid"
            className="flex-1"
            disabled={!name.trim()}
            onClick={submit}
          >
            Create
          </Button>
        </div>
          </>
        )}
      </Modal>
    </>
  );
}
