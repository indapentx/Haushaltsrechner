import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as db from '../lib/db';
import type { Cycle, CycleStub, Item, Profile } from '../lib/db';
import { currentCycleKey } from '../lib/cycle';
import { sumAmounts } from '../lib/money';

const ACTIVE_PROFILE_KEY = 'budget.activeProfile';

interface State {
  loading: boolean;
  error: string | null;
  profiles: Profile[];
  activeProfileId: string | null;
  /** Every cycle that exists for the active profile, oldest first. */
  cycles: CycleStub[];
  /** Index into `cycles` — which one the screens are showing. */
  viewIndex: number;
  cycle: Cycle | null;
  items: Item[];
}

const INITIAL: State = {
  loading: true,
  error: null,
  profiles: [],
  activeProfileId: null,
  cycles: [],
  viewIndex: -1,
  cycle: null,
  items: [],
};

interface BudgetContext extends State {
  activeProfile: Profile | null;
  currency: string;
  isCurrentCycle: boolean;
  canStepBack: boolean;
  canStepForward: boolean;
  totals: { income: number; committed: number; stillToPay: number; balance: number };
  selectProfile: (id: string) => void;
  addProfile: (name: string, currency: string) => Promise<void>;
  updateActiveProfile: (patch: { name?: string; currency?: string }) => Promise<void>;
  removeActiveProfile: () => Promise<void>;
  stepCycle: (delta: number) => void;
  setIncome: (value: number) => Promise<void>;
  addItem: (name: string, amount: number) => Promise<void>;
  editItem: (id: string, patch: { name?: string; amount?: number }) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  toggleItem: (id: string) => Promise<void>;
  resetAll: () => Promise<void>;
  dismissError: () => void;
}

const Ctx = createContext<BudgetContext | null>(null);

export function useBudget(): BudgetContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBudget must be used inside BudgetProvider');
  return ctx;
}

function readStoredProfileId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROFILE_KEY);
  } catch {
    return null; // Private mode, or storage disabled.
  }
}

function storeProfileId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_PROFILE_KEY, id);
    else localStorage.removeItem(ACTIVE_PROFILE_KEY);
  } catch {
    /* not worth surfacing */
  }
}

export function BudgetProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [state, setState] = useState<State>(INITIAL);
  const patch = useCallback(
    (p: Partial<State> | ((prev: State) => Partial<State>)) =>
      setState((prev) => ({ ...prev, ...(typeof p === 'function' ? p(prev) : p) })),
    [],
  );

  const fail = useCallback(
    (e: unknown) => patch({ error: e instanceof Error ? e.message : String(e) }),
    [patch],
  );

  /** Guards against a slow response for a profile the user has already left. */
  const loadToken = useRef(0);

  // ------------------------------------------------------------- profiles

  const loadProfiles = useCallback(async () => {
    const profiles = await db.listProfiles();
    const stored = readStoredProfileId();
    const active =
      profiles.find((p) => p.id === stored)?.id ?? profiles[0]?.id ?? null;
    patch({ profiles, activeProfileId: active, loading: false });
    if (active !== stored) storeProfileId(active);
  }, [patch]);

  useEffect(() => {
    loadProfiles().catch((e) => {
      fail(e);
      patch({ loading: false });
    });
  }, [loadProfiles, fail, patch]);

  // --------------------------------------------------------------- cycle

  /**
   * Lazy rollover: on every load and every profile switch, make sure the
   * cycle containing *now* exists, then show it.
   */
  const loadCycle = useCallback(
    async (profileId: string) => {
      const token = ++loadToken.current;
      const startKey = currentCycleKey();
      const cycle = await db.ensureCycle(profileId, startKey);
      const cycles = await db.listCycleStubs(profileId);
      const items = await db.listItems(cycle.id);
      if (token !== loadToken.current) return;
      patch({
        cycle,
        cycles,
        items,
        viewIndex: Math.max(0, cycles.findIndex((c) => c.start_date === startKey)),
      });
    },
    [patch],
  );

  useEffect(() => {
    if (!state.activeProfileId) {
      patch({ cycle: null, items: [], cycles: [], viewIndex: -1 });
      return;
    }
    loadCycle(state.activeProfileId).catch(fail);
  }, [state.activeProfileId, loadCycle, fail, patch]);

  const showCycleAt = useCallback(
    async (index: number) => {
      const stub = state.cycles[index];
      if (!stub || !state.activeProfileId) return;
      const token = ++loadToken.current;
      const cycle = await db.getCycle(state.activeProfileId, stub.start_date);
      if (!cycle) return;
      const items = await db.listItems(cycle.id);
      if (token !== loadToken.current) return;
      patch({ cycle, items, viewIndex: index });
    },
    [state.cycles, state.activeProfileId, patch],
  );

  const stepCycle = useCallback(
    (delta: number) => {
      const next = state.viewIndex + delta;
      if (next < 0 || next >= state.cycles.length) return;
      showCycleAt(next).catch(fail);
    },
    [state.viewIndex, state.cycles.length, showCycleAt, fail],
  );

  /** Re-read the current cycle from the server, discarding local guesses. */
  const reload = useCallback(async () => {
    if (!state.cycle) return;
    const items = await db.listItems(state.cycle.id);
    const cycle = state.activeProfileId
      ? await db.getCycle(state.activeProfileId, state.cycle.start_date)
      : null;
    patch({ items, ...(cycle ? { cycle } : {}) });
  }, [state.cycle, state.activeProfileId, patch]);

  // ------------------------------------------------------------- actions

  const selectProfile = useCallback(
    (id: string) => {
      storeProfileId(id);
      patch({ activeProfileId: id, cycle: null, items: [] });
    },
    [patch],
  );

  const addProfile = useCallback(
    async (name: string, currency: string) => {
      try {
        const sortOrder = state.profiles.length;
        const profile = await db.createProfile(userId, name, currency, sortOrder);
        storeProfileId(profile.id);
        patch((prev) => ({
          profiles: [...prev.profiles, profile],
          activeProfileId: profile.id,
          cycle: null,
          items: [],
        }));
      } catch (e) {
        fail(e);
      }
    },
    [state.profiles.length, userId, patch, fail],
  );

  const updateActiveProfile = useCallback(
    async (update: { name?: string; currency?: string }) => {
      const id = state.activeProfileId;
      if (!id) return;
      patch((prev) => ({
        profiles: prev.profiles.map((p) => (p.id === id ? { ...p, ...update } : p)),
      }));
      try {
        await db.updateProfile(id, update);
      } catch (e) {
        fail(e);
        loadProfiles().catch(fail);
      }
    },
    [state.activeProfileId, patch, fail, loadProfiles],
  );

  const removeActiveProfile = useCallback(async () => {
    const id = state.activeProfileId;
    if (!id) return;
    try {
      await db.deleteProfile(id);
      storeProfileId(null);
      patch({ activeProfileId: null, cycle: null, items: [], cycles: [] });
      await loadProfiles();
    } catch (e) {
      fail(e);
    }
  }, [state.activeProfileId, patch, fail, loadProfiles]);

  const setIncome = useCallback(
    async (value: number) => {
      const cycle = state.cycle;
      if (!cycle || value === cycle.income) return;
      patch({ cycle: { ...cycle, income: value } });
      try {
        await db.setIncome(cycle.id, value);
      } catch (e) {
        fail(e);
        patch({ cycle });
      }
    },
    [state.cycle, patch, fail],
  );

  const addItem = useCallback(
    async (name: string, amount: number) => {
      const cycle = state.cycle;
      if (!cycle) return;
      const sortOrder = state.items.length;
      try {
        const item = await db.createItem(cycle.id, name, amount, sortOrder);
        patch((prev) => ({ items: [...prev.items, item] }));
      } catch (e) {
        fail(e);
      }
    },
    [state.cycle, state.items.length, patch, fail],
  );

  const editItem = useCallback(
    async (id: string, update: { name?: string; amount?: number }) => {
      patch((prev) => ({
        items: prev.items.map((i) => (i.id === id ? { ...i, ...update } : i)),
      }));
      try {
        await db.updateItem(id, update);
      } catch (e) {
        fail(e);
        reload().catch(fail);
      }
    },
    [patch, fail, reload],
  );

  const removeItem = useCallback(
    async (id: string) => {
      patch((prev) => ({ items: prev.items.filter((i) => i.id !== id) }));
      try {
        await db.deleteItem(id);
      } catch (e) {
        fail(e);
        reload().catch(fail);
      }
    },
    [patch, fail, reload],
  );

  const toggleItem = useCallback(
    async (id: string) => {
      const item = state.items.find((i) => i.id === id);
      if (!item) return;
      const is_paid = !item.is_paid;
      const paid_at = is_paid ? new Date().toISOString() : null;
      patch((prev) => ({
        items: prev.items.map((i) => (i.id === id ? { ...i, is_paid, paid_at } : i)),
      }));
      try {
        await db.updateItem(id, { is_paid, paid_at });
      } catch (e) {
        fail(e);
        reload().catch(fail);
      }
    },
    [state.items, patch, fail, reload],
  );

  const resetAll = useCallback(async () => {
    const cycle = state.cycle;
    if (!cycle) return;
    const before = state.items;
    patch((prev) => ({
      items: prev.items.map((i) => ({ ...i, is_paid: false, paid_at: null })),
    }));
    try {
      await db.resetCycleItems(cycle.id);
    } catch (e) {
      fail(e);
      patch({ items: before });
    }
  }, [state.cycle, state.items, patch, fail]);

  // ------------------------------------------------------------- derived

  const activeProfile =
    state.profiles.find((p) => p.id === state.activeProfileId) ?? null;

  const totals = useMemo(() => {
    const income = state.cycle?.income ?? 0;
    // Every item counts against the balance, ticked or not. Ticking only
    // records that it has been handed over.
    const committed = sumAmounts(state.items.map((i) => i.amount));
    const stillToPay = sumAmounts(
      state.items.filter((i) => !i.is_paid).map((i) => i.amount),
    );
    return {
      income,
      committed,
      stillToPay,
      balance: sumAmounts([income, -committed]),
    };
  }, [state.cycle?.income, state.items]);

  const value: BudgetContext = {
    ...state,
    activeProfile,
    currency: activeProfile?.currency ?? 'TRY',
    isCurrentCycle: state.cycle?.start_date === currentCycleKey(),
    canStepBack: state.viewIndex > 0,
    canStepForward: state.viewIndex >= 0 && state.viewIndex < state.cycles.length - 1,
    totals,
    selectProfile,
    addProfile,
    updateActiveProfile,
    removeActiveProfile,
    stepCycle,
    setIncome,
    addItem,
    editItem,
    removeItem,
    toggleItem,
    resetAll,
    dismissError: () => patch({ error: null }),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
