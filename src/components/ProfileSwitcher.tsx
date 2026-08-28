import { useState } from 'react';
import { useBudget } from '../state/store';
import { CURRENCIES } from '../lib/money';
import { Button, Micro, Modal, TextInput } from './ui';

/** Active profile is a filled pill; the rest are outlined. No hue involved. */
export function ProfileSwitcher() {
  const { profiles, activeProfileId, selectProfile, addProfile } = useBudget();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState<string>('TRY');

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await addProfile(trimmed, currency);
    setName('');
    setCurrency('TRY');
    setAdding(false);
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
          aria-label="New profile"
          className="min-h-9 w-9 shrink-0 rounded-full border border-rule text-text-secondary active:bg-surface-raised"
        >
          +
        </button>
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="New profile">
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
          <div className="mt-2 flex gap-2">
            {CURRENCIES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setCurrency(code)}
                className={`min-h-11 flex-1 font-mono text-[13px] ${
                  currency === code
                    ? 'bg-white text-black'
                    : 'border border-rule text-text-secondary'
                }`}
              >
                {code}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <Button variant="quiet" className="flex-1" onClick={() => setAdding(false)}>
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
      </Modal>
    </>
  );
}
