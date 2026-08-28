import { useEffect, useState } from 'react';
import { Button, Confirm, Micro, Rule, TextInput } from '../components/ui';
import { CURRENCIES } from '../lib/money';
import { supabase } from '../lib/supabase';
import { useBudget } from '../state/store';

export default function Settings() {
  const { activeProfile, updateActiveProfile, removeActiveProfile } = useBudget();
  const [name, setName] = useState(activeProfile?.name ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    setName(activeProfile?.name ?? '');
  }, [activeProfile?.id, activeProfile?.name]);

  if (!activeProfile) return null;

  return (
    <div className="pb-4">
      <div className="px-5 py-5">
        <Micro>Profile</Micro>
      </div>
      <Rule />

      <div className="px-5 py-5">
        <label className="block">
          <Micro>Name</Micro>
          <TextInput
            className="mt-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              const trimmed = name.trim();
              if (trimmed && trimmed !== activeProfile.name) {
                void updateActiveProfile({ name: trimmed });
              } else if (!trimmed) {
                setName(activeProfile.name);
              }
            }}
          />
        </label>

        <div className="mt-6">
          <Micro>Currency</Micro>
          <div className="mt-2 flex gap-2">
            {CURRENCIES.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => void updateActiveProfile({ currency: code })}
                className={`min-h-11 flex-1 font-mono text-[13px] ${
                  activeProfile.currency === code
                    ? 'bg-white text-black'
                    : 'border border-rule text-text-secondary'
                }`}
              >
                {code}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Rule />
      <div className="px-5 py-6">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            setTyped('');
            setConfirmDelete(true);
          }}
        >
          Delete profile
        </Button>
        <p className="mt-3 text-[13px] leading-relaxed text-text-muted">
          Deletes this profile and every cycle and item in it. Other profiles are
          untouched.
        </p>
      </div>

      <Rule />
      <div className="px-5 py-6">
        <Button
          variant="quiet"
          className="px-0"
          onClick={() => void supabase.auth.signOut()}
        >
          Sign out
        </Button>
      </div>

      <Confirm
        open={confirmDelete}
        title="Delete profile"
        body={`Every cycle and item in “${activeProfile.name}” goes with it. This cannot be undone.`}
        confirmLabel="Delete"
        requireText={activeProfile.name}
        typed={typed}
        onTyped={setTyped}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          void removeActiveProfile();
          setConfirmDelete(false);
        }}
      />
    </div>
  );
}
