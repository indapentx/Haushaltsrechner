import { useCallback, useEffect, useState } from 'react';
import { Button, Confirm, CurrencyChips, Micro, Rule, TextInput } from '../components/ui';
import * as db from '../lib/db';
import type { ProfileMember } from '../lib/db';
import { CURRENCIES } from '../lib/money';
import { supabase } from '../lib/supabase';
import { useAuth } from '../state/useAuth';
import { useBudget } from '../state/store';

export default function Settings() {
  const {
    householdId,
    activeProfile,
    updateActiveProfile,
    removeActiveProfile,
    refreshHousehold,
  } = useBudget();
  const { user } = useAuth();

  const [name, setName] = useState(activeProfile?.name ?? '');
  const [members, setMembers] = useState<ProfileMember[]>([]);
  const [code, setCode] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [typed, setTyped] = useState('');

  /** A budget you own lives in your own household; anything else is a guest pass. */
  const isMine = activeProfile?.household_id === householdId;
  const profileId = activeProfile?.id ?? null;

  useEffect(() => {
    setName(activeProfile?.name ?? '');
  }, [activeProfile?.id, activeProfile?.name]);

  const loadSharing = useCallback(async () => {
    if (!profileId) return;
    const [list, shareCode] = await Promise.all([
      db.listProfileMembers(profileId),
      isMine ? db.getShareCode(profileId) : Promise.resolve(null),
    ]);
    setMembers(list);
    setCode(shareCode);
    setShowCode(false);
  }, [profileId, isMine]);

  useEffect(() => {
    loadSharing().catch(() => {
      /* a failure here is not worth blocking the screen for */
    });
  }, [loadSharing]);

  if (!activeProfile) return null;

  return (
    <div className="pb-4">
      {/* ---------------------------------------------------- the budget */}
      <div className="px-5 py-5">
        <Micro>Budget</Micro>
      </div>
      <Rule />

      <div className="px-5 py-5">
        <label className="block">
          <Micro>Name</Micro>
          <TextInput
            className="mt-2"
            value={name}
            disabled={!isMine}
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
            What this budget is denominated in. Individual items can still be
            entered in any currency.
          </p>
          <CurrencyChips
            className="mt-3"
            value={activeProfile.currency}
            options={CURRENCIES}
            onChange={(next) => isMine && void updateActiveProfile({ currency: next })}
          />
        </div>

        {!isMine && (
          <p className="mt-5 border border-rule p-3 text-[13px] leading-relaxed text-text-secondary">
            This budget was shared with you. You can add, edit and tick off
            everything in it, but only its owner can rename it or change its
            currency.
          </p>
        )}
      </div>

      {/* -------------------------------------------------------- sharing */}
      <Rule />
      <div className="px-5 py-5">
        <Micro>Sharing</Micro>

        {isMine && !code && (
          <>
            <p className="mt-3 text-[13px] leading-relaxed text-text-muted">
              Only you can see “{activeProfile.name}”. Sharing it gives a code
              that lets someone into this budget alone — your other budgets stay
              private.
            </p>
            <Button
              variant="outline"
              className="mt-4 w-full"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void db
                  .shareProfile(activeProfile.id)
                  .then((next) => {
                    setCode(next);
                    setShowCode(true);
                  })
                  .finally(() => setBusy(false));
              }}
            >
              Share this budget
            </Button>
          </>
        )}

        {isMine && code && (
          <>
            <p className="mt-3 text-[13px] leading-relaxed text-text-muted">
              Anyone with this code can open “{activeProfile.name}” and change
              anything in it. They see none of your other budgets.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1 border border-rule px-3 py-3 text-center font-mono tnum text-[18px] tracking-[0.2em]">
                {showCode ? code : '••••-••••'}
              </div>
              <Button variant="outline" onClick={() => setShowCode((v) => !v)}>
                {showCode ? 'Hide' : 'Show'}
              </Button>
            </div>
            <Button
              variant="outline"
              className="mt-3 w-full"
              onClick={() => setConfirmRotate(true)}
            >
              Change code
            </Button>
          </>
        )}

        {members.length > 0 && (
          <div className="mt-6">
            <Micro>Shared with</Micro>
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
                  {isMine && (
                    <button
                      type="button"
                      aria-label={`Remove ${member.email}`}
                      className="h-8 w-7 text-text-muted active:text-text"
                      onClick={() =>
                        void db
                          .removeProfileMember(activeProfile.id, member.user_id)
                          .then(loadSharing)
                      }
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {isMine && (code || members.length > 0) && (
          <Button
            variant="outline"
            className="mt-4 w-full"
            onClick={() => setConfirmStop(true)}
          >
            Stop sharing
          </Button>
        )}
      </div>

      {/* ---------------------------------------------------- destructive */}
      <Rule />
      <div className="px-5 py-6">
        {isMine ? (
          <>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setTyped('');
                setConfirmDelete(true);
              }}
            >
              Delete budget
            </Button>
            <p className="mt-3 text-[13px] leading-relaxed text-text-muted">
              Deletes this budget and every cycle and item in it, for everyone
              it is shared with. Your other budgets are untouched.
            </p>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setConfirmLeave(true)}
            >
              Leave this budget
            </Button>
            <p className="mt-3 text-[13px] leading-relaxed text-text-muted">
              You lose access. Nothing is deleted — the owner keeps everything.
            </p>
          </>
        )}
      </div>

      <Rule />
      <div className="px-5 py-6">
        <Button variant="quiet" className="px-0" onClick={() => void supabase.auth.signOut()}>
          Sign out
        </Button>
      </div>

      <Confirm
        open={confirmDelete}
        title="Delete budget"
        body={`Every cycle and item in “${activeProfile.name}” goes with it, for everyone it is shared with. This cannot be undone.`}
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
        title="Change code"
        body="The current code stops working immediately. Anyone who has not joined yet will need the new one. People already in stay in."
        confirmLabel="Change it"
        onCancel={() => setConfirmRotate(false)}
        onConfirm={() => {
          void db.rotateShareCode(activeProfile.id).then((next) => {
            setCode(next);
            setShowCode(true);
          });
          setConfirmRotate(false);
        }}
      />

      <Confirm
        open={confirmStop}
        title="Stop sharing"
        body={`The code stops working and everyone it was shared with loses access to “${activeProfile.name}”. Nothing in it is deleted.`}
        confirmLabel="Stop sharing"
        onCancel={() => setConfirmStop(false)}
        onConfirm={() => {
          void db.unshareProfile(activeProfile.id).then(() => {
            setCode(null);
            setMembers([]);
          });
          setConfirmStop(false);
        }}
      />

      <Confirm
        open={confirmLeave}
        title="Leave this budget"
        body="You lose access to it. Nothing is deleted — the owner keeps everything. You would need the code again to come back."
        confirmLabel="Leave"
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => {
          if (user) {
            void db
              .removeProfileMember(activeProfile.id, user.id)
              .then(refreshHousehold);
          }
          setConfirmLeave(false);
        }}
      />
    </div>
  );
}
