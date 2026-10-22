import { useCallback, useEffect, useState } from 'react';
import { Button, Confirm, CurrencyChips, Micro, Rule, TextInput } from '../components/ui';
import * as db from '../lib/db';
import type { HouseholdMember } from '../lib/db';
import { CURRENCIES } from '../lib/money';
import { supabase } from '../lib/supabase';
import { useAuth } from '../state/useAuth';
import { useBudget } from '../state/store';

export default function Settings() {
  const {
    household,
    householdId,
    activeProfile,
    updateActiveProfile,
    removeActiveProfile,
    refreshHousehold,
  } = useBudget();
  const { user } = useAuth();

  const [name, setName] = useState(activeProfile?.name ?? '');
  const [houseName, setHouseName] = useState(household?.name ?? '');
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    setName(activeProfile?.name ?? '');
  }, [activeProfile?.id, activeProfile?.name]);

  useEffect(() => {
    setHouseName(household?.name ?? '');
  }, [household?.id, household?.name]);

  const loadHouseholdDetail = useCallback(async () => {
    if (!householdId) return;
    const [list, joinCode] = await Promise.all([
      db.listMembers(householdId),
      db.getJoinCode(householdId),
    ]);
    setMembers(list);
    setCode(joinCode);
  }, [householdId]);

  useEffect(() => {
    loadHouseholdDetail().catch(() => {
      /* surfaced by the household screen if it matters */
    });
  }, [loadHouseholdDetail]);

  const isOwner = members.some((m) => m.user_id === user?.id && m.role === 'owner');

  if (!activeProfile || !household) return null;

  return (
    <div className="pb-4">
      {/* ------------------------------------------------------ household */}
      <div className="px-5 py-5">
        <Micro>Household</Micro>
      </div>
      <Rule />

      <div className="px-5 py-5">
        <label className="block">
          <Micro>Name</Micro>
          <TextInput
            className="mt-2"
            value={houseName}
            disabled={!isOwner}
            onChange={(e) => setHouseName(e.target.value)}
            onBlur={() => {
              const trimmed = houseName.trim();
              if (trimmed && trimmed !== household.name) {
                void db.renameHousehold(household.id, trimmed).then(refreshHousehold);
              } else if (!trimmed) {
                setHouseName(household.name);
              }
            }}
          />
        </label>

        <div className="mt-6">
          <Micro>Members</Micro>
          <div className="mt-2 border border-rule">
            {members.map((member, index) => (
              <div
                key={member.user_id}
                className={`flex items-center gap-3 px-3 py-3 ${
                  index > 0 ? 'border-t border-rule' : ''
                }`}
              >
                <span className="flex-1 truncate text-[14px]">
                  {member.email}
                  {member.user_id === user?.id && (
                    <span className="micro ml-2 text-text-muted">you</span>
                  )}
                </span>
                {member.role === 'owner' && <span className="micro text-text-muted">owner</span>}
                {isOwner && member.user_id !== user?.id && (
                  <button
                    type="button"
                    aria-label={`Remove ${member.email}`}
                    className="h-8 w-7 text-text-muted active:text-text"
                    onClick={() =>
                      void db
                        .removeMember(household.id, member.user_id)
                        .then(loadHouseholdDetail)
                    }
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <Micro>Join code</Micro>
          <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
            Anyone with this code can join the household and see everything in
            it. Change it to cut off access.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 border border-rule px-3 py-3 text-center font-mono tnum text-[18px] tracking-[0.2em]">
              {showCode ? (code ?? '—') : '••••-••••'}
            </div>
            <Button variant="outline" onClick={() => setShowCode((v) => !v)}>
              {showCode ? 'Hide' : 'Show'}
            </Button>
          </div>
          {isOwner && (
            <Button
              variant="outline"
              className="mt-3 w-full"
              onClick={() => setConfirmRotate(true)}
            >
              Change code
            </Button>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------- profile */}
      <Rule />
      <div className="px-5 py-5">
        <Micro>Profile</Micro>

        <label className="mt-4 block">
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
          <p className="mt-2 text-[13px] leading-relaxed text-text-muted">
            What this profile is denominated in. Individual items can still be
            entered in any currency.
          </p>
          <CurrencyChips
            className="mt-3"
            value={activeProfile.currency}
            options={CURRENCIES}
            onChange={(code) => void updateActiveProfile({ currency: code })}
          />
        </div>
      </div>

      {/* ---------------------------------------------------- destructive */}
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
          Deletes this profile and every cycle and item in it, for everyone in
          the household. Other profiles are untouched.
        </p>

        <Button
          variant="outline"
          className="mt-5 w-full"
          onClick={() => setConfirmLeave(true)}
        >
          Leave household
        </Button>
      </div>

      <Rule />
      <div className="px-5 py-6">
        <Button variant="quiet" className="px-0" onClick={() => void supabase.auth.signOut()}>
          Sign out
        </Button>
      </div>

      <Confirm
        open={confirmDelete}
        title="Delete profile"
        body={`Every cycle and item in “${activeProfile.name}” goes with it, for everyone in the household. This cannot be undone.`}
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

      <Confirm
        open={confirmRotate}
        title="Change join code"
        body="The current code stops working immediately. Anyone who has not joined yet will need the new one. People already in the household stay in."
        confirmLabel="Change it"
        onCancel={() => setConfirmRotate(false)}
        onConfirm={() => {
          void db.rotateJoinCode(household.id).then((next) => {
            setCode(next);
            setShowCode(true);
          });
          setConfirmRotate(false);
        }}
      />

      <Confirm
        open={confirmLeave}
        title="Leave household"
        body="You lose access to these budgets. Nothing is deleted — the others keep everything. You would need the join code to come back."
        confirmLabel="Leave"
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => {
          if (user) {
            void db
              .removeMember(household.id, user.id)
              .then(() => {
                try {
                  localStorage.removeItem('budget.activeHousehold');
                  localStorage.removeItem('budget.activeProfile');
                } catch {
                  /* storage may be unavailable */
                }
              })
              .then(refreshHousehold);
          }
          setConfirmLeave(false);
        }}
      />
    </div>
  );
}
