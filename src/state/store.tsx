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
import type { Cycle, CycleStub, Household, Income, Item, Profile } from '../lib/db';
import { currentCycleKey } from '../lib/cycle';
import { convert, loadRates, type RateNeed, type RateTable } from '../lib/fx';
import { sumAmounts } from '../lib/money';

const ACTIVE_PROFILE_KEY = 'budget.activeProfile';
const ACTIVE_HOUSEHOLD_KEY = 'budget.activeHousehold';
const DISPLAY_CURRENCY_KEY = 'budget.displayCurrency';

interface State {
  loading: boolean;
  error: string | null;
  households: Household[];
  householdId: string | null;
  profiles: Profile[];
  activeProfileId: string | null;
  /** Every cycle that exists for the active profile, oldest first. */
  cycles: CycleStub[];
  /** Index into `cycles` — which one the screens are showing. */
  viewIndex: number;
  cycle: Cycle | null;
  items: Item[];
  incomes: Income[];
  rates: RateTable;
  /** At least one figure fell back to an older day's rate. */
  ratesApproximate: boolean;
  /** Null means "whatever the active profile is denominated in". */
  displayOverride: string | null;
}

const INITIAL: State = {
  loading: true,
  error: null,
  households: [],
  householdId: null,
  profiles: [],
  activeProfileId: null,
  cycles: [],
  viewIndex: -1,
  cycle: null,
  items: [],
  incomes: [],
  rates: {},
  ratesApproximate: false,
  displayOverride: null,
};

export interface Totals {
  income: number;
  committed: number;
  stillToPay: number;
  balance: number;
  /** True when a row could not be converted and was left out. */
  incomplete: boolean;
}

interface BudgetContext extends State {
  household: Household | null;
  activeProfile: Profile | null;
  /** The currency every total on screen is expressed in. */
  currency: string;
  isCurrentCycle: boolean;
  canStepBack: boolean;
  canStepForward: boolean;
  totals: Totals;
  /** An amount in its own currency, expressed in the display currency. */
  inDisplay: (row: { amount: number; currency: string; rate_date: string }) => number | null;
  createHousehold: (name: string) => Promise<void>;
  joinHousehold: (code: string) => Promise<void>;
  selectProfile: (id: string) => void;
  addProfile: (name: string, currency: string) => Promise<void>;
  updateActiveProfile: (patch: { name?: string; currency?: string }) => Promise<void>;
  removeActiveProfile: () => Promise<void>;
  setDisplayCurrency: (currency: string | null) => void;
  stepCycle: (delta: number) => void;
  addItem: (name: string, amount: number, currency: string) => Promise<void>;
  editItem: (
    id: string,
    patch: { name?: string; amount?: number; currency?: string },
  ) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
  toggleItem: (id: string) => Promise<void>;
  resetAll: () => Promise<void>;
  addIncome: (name: string, amount: number, currency: string) => Promise<void>;
  editIncome: (
    id: string,
    patch: { name?: string; amount?: number; currency?: string },
  ) => Promise<void>;
  removeIncome: (id: string) => Promise<void>;
  refreshHousehold: () => Promise<void>;
  dismissError: () => void;
}

const Ctx = createContext<BudgetContext | null>(null);

export function useBudget(): BudgetContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBudget must be used inside BudgetProvider');
  return ctx;
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // Private mode, or storage disabled.
  }
}

function store(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* not worth surfacing */
  }
}

export function BudgetProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({
    ...INITIAL,
    displayOverride: readStored(DISPLAY_CURRENCY_KEY),
  });

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

  // ------------------------------------------------------------ household

  const loadHousehold = useCallback(async () => {
    const households = await db.listHouseholds();
    const stored = readStored(ACTIVE_HOUSEHOLD_KEY);
    const active =
      households.find((h) => h.id === stored)?.id ?? households[0]?.id ?? null;
    store(ACTIVE_HOUSEHOLD_KEY, active);

    if (!active) {
      patch({ households, householdId: null, profiles: [], loading: false });
      return;
    }

    const profiles = await db.listProfiles(active);
    const storedProfile = readStored(ACTIVE_PROFILE_KEY);
    const activeProfile =
      profiles.find((p) => p.id === storedProfile)?.id ?? profiles[0]?.id ?? null;
    store(ACTIVE_PROFILE_KEY, activeProfile);

    patch({
      households,
      householdId: active,
      profiles,
      activeProfileId: activeProfile,
      loading: false,
    });
  }, [patch]);

  useEffect(() => {
    loadHousehold().catch((e) => {
      fail(e);
      patch({ loading: false });
    });
  }, [loadHousehold, fail, patch]);

  // ---------------------------------------------------------------- rates

  /** Resolve every rate the loaded rows need for the chosen display currency. */
  const resolveRates = useCallback(
    async (items: Item[], incomes: Income[], display: string, known: RateTable) => {
      const needs: RateNeed[] = [...items, ...incomes].map((r) => ({
        rate_date: r.rate_date,
        currency: r.currency,
      }));
      if (needs.length === 0) return { rates: known, approximate: false };
      return loadRates(needs, display);
    },
    [],
  );

  // --------------------------------------------------------------- cycle

  const displayFor = useCallback(
    (profiles: Profile[], profileId: string | null, override: string | null) =>
      override ?? profiles.find((p) => p.id === profileId)?.currency ?? 'TRY',
    [],
  );

  /**
   * Lazy rollover: on every load and every profile switch, make sure the
   * cycle containing *now* exists, then show it.
   */
  const loadCycle = useCallback(
    async (profileId: string) => {
      const token = ++loadToken.current;
      const startKey = currentCycleKey();
      const cycle = await db.ensureCycle(profileId, startKey);
      const [cycles, items, incomes] = await Promise.all([
        db.listCycleStubs(profileId),
        db.listItems(cycle.id),
        db.listIncomes(cycle.id),
      ]);
      if (token !== loadToken.current) return;

      patch({
        cycle,
        cycles,
        items,
        incomes,
        viewIndex: Math.max(0, cycles.findIndex((c) => c.start_date === startKey)),
      });

      const display = displayFor(state.profiles, profileId, state.displayOverride);
      const resolved = await resolveRates(items, incomes, display, state.rates);
      if (token !== loadToken.current) return;
      patch({ rates: resolved.rates, ratesApproximate: resolved.approximate });
    },
    [patch, resolveRates, displayFor, state.profiles, state.displayOverride, state.rates],
  );

  useEffect(() => {
    if (!state.activeProfileId) {
      patch({ cycle: null, items: [], incomes: [], cycles: [], viewIndex: -1 });
      return;
    }
    loadCycle(state.activeProfileId).catch(fail);
    // loadCycle changes identity whenever rates do, which would re-fetch
    // forever; the profile is what should drive a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeProfileId]);

  const showCycleAt = useCallback(
    async (index: number) => {
      const stub = state.cycles[index];
      if (!stub || !state.activeProfileId) return;
      const token = ++loadToken.current;
      const cycle = await db.getCycle(state.activeProfileId, stub.start_date);
      if (!cycle) return;
      const [items, incomes] = await Promise.all([
        db.listItems(cycle.id),
        db.listIncomes(cycle.id),
      ]);
      if (token !== loadToken.current) return;
      patch({ cycle, items, incomes, viewIndex: index });

      const display = displayFor(state.profiles, state.activeProfileId, state.displayOverride);
      const resolved = await resolveRates(items, incomes, display, state.rates);
      if (token !== loadToken.current) return;
      patch({ rates: resolved.rates, ratesApproximate: resolved.approximate });
    },
    [
      state.cycles,
      state.activeProfileId,
      state.profiles,
      state.displayOverride,
      state.rates,
      patch,
      resolveRates,
      displayFor,
    ],
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
    const [items, incomes] = await Promise.all([
      db.listItems(state.cycle.id),
      db.listIncomes(state.cycle.id),
    ]);
    patch({ items, incomes });
  }, [state.cycle, patch]);

  // ------------------------------------------------------------- actions

  const createHousehold = useCallback(
    async (name: string) => {
      try {
        const household = await db.createHousehold(name);
        store(ACTIVE_HOUSEHOLD_KEY, household.id);
        await loadHousehold();
      } catch (e) {
        fail(e);
      }
    },
    [loadHousehold, fail],
  );

  const joinHousehold = useCallback(
    async (code: string) => {
      try {
        const household = await db.joinHousehold(code);
        store(ACTIVE_HOUSEHOLD_KEY, household.id);
        store(ACTIVE_PROFILE_KEY, null);
        await loadHousehold();
      } catch (e) {
        fail(e);
        throw e;
      }
    },
    [loadHousehold, fail],
  );

  const refreshHousehold = useCallback(async () => {
    try {
      await loadHousehold();
    } catch (e) {
      fail(e);
    }
  }, [loadHousehold, fail]);

  const selectProfile = useCallback(
    (id: string) => {
      store(ACTIVE_PROFILE_KEY, id);
      patch({ activeProfileId: id, cycle: null, items: [], incomes: [] });
    },
    [patch],
  );

  const addProfile = useCallback(
    async (name: string, currency: string) => {
      if (!state.householdId) return;
      try {
        const profile = await db.createProfile(
          state.householdId,
          name,
          currency,
          state.profiles.length,
        );
        store(ACTIVE_PROFILE_KEY, profile.id);
        patch((prev) => ({
          profiles: [...prev.profiles, profile],
          activeProfileId: profile.id,
          cycle: null,
          items: [],
          incomes: [],
        }));
      } catch (e) {
        fail(e);
      }
    },
    [state.householdId, state.profiles.length, patch, fail],
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
        loadHousehold().catch(fail);
      }
    },
    [state.activeProfileId, patch, fail, loadHousehold],
  );

  const removeActiveProfile = useCallback(async () => {
    const id = state.activeProfileId;
    if (!id) return;
    try {
      await db.deleteProfile(id);
      store(ACTIVE_PROFILE_KEY, null);
      patch({ activeProfileId: null, cycle: null, items: [], incomes: [], cycles: [] });
      await loadHousehold();
    } catch (e) {
      fail(e);
    }
  }, [state.activeProfileId, patch, fail, loadHousehold]);

  const setDisplayCurrency = useCallback(
    (currency: string | null) => {
      store(DISPLAY_CURRENCY_KEY, currency);
      patch({ displayOverride: currency });
    },
    [patch],
  );

  const addItem = useCallback(
    async (name: string, amount: number, currency: string) => {
      const cycle = state.cycle;
      if (!cycle) return;
      try {
        const item = await db.createItem(
          cycle.id,
          name,
          amount,
          currency,
          cycle.start_date,
          state.items.length,
        );
        patch((prev) => ({ items: [...prev.items, item] }));
      } catch (e) {
        fail(e);
      }
    },
    [state.cycle, state.items.length, patch, fail],
  );

  const editItem = useCallback(
    async (id: string, update: { name?: string; amount?: number; currency?: string }) => {
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

  const addIncome = useCallback(
    async (name: string, amount: number, currency: string) => {
      const cycle = state.cycle;
      if (!cycle) return;
      try {
        const income = await db.createIncome(
          cycle.id,
          name,
          amount,
          currency,
          cycle.start_date,
          state.incomes.length,
        );
        patch((prev) => ({ incomes: [...prev.incomes, income] }));
      } catch (e) {
        fail(e);
      }
    },
    [state.cycle, state.incomes.length, patch, fail],
  );

  const editIncome = useCallback(
    async (id: string, update: { name?: string; amount?: number; currency?: string }) => {
      patch((prev) => ({
        incomes: prev.incomes.map((i) => (i.id === id ? { ...i, ...update } : i)),
      }));
      try {
        await db.updateIncome(id, update);
      } catch (e) {
        fail(e);
        reload().catch(fail);
      }
    },
    [patch, fail, reload],
  );

  const removeIncome = useCallback(
    async (id: string) => {
      patch((prev) => ({ incomes: prev.incomes.filter((i) => i.id !== id) }));
      try {
        await db.deleteIncome(id);
      } catch (e) {
        fail(e);
        reload().catch(fail);
      }
    },
    [patch, fail, reload],
  );

  // ------------------------------------------------------------- derived

  const activeProfile =
    state.profiles.find((p) => p.id === state.activeProfileId) ?? null;
  const household = state.households.find((h) => h.id === state.householdId) ?? null;
  const currency = state.displayOverride ?? activeProfile?.currency ?? 'TRY';

  const inDisplay = useCallback(
    (row: { amount: number; currency: string; rate_date: string }) =>
      convert(row.amount, row.currency, currency, row.rate_date, state.rates),
    [currency, state.rates],
  );

  // When the display currency changes, the rates already loaded may not
  // cover it. Fetch what the new choice needs.
  useEffect(() => {
    if (state.items.length === 0 && state.incomes.length === 0) return;
    let active = true;
    resolveRates(state.items, state.incomes, currency, state.rates)
      .then((resolved) => {
        if (!active) return;
        patch({ rates: resolved.rates, ratesApproximate: resolved.approximate });
      })
      .catch(fail);
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency]);

  const totals: Totals = useMemo(() => {
    let incomplete = false;

    const convertRows = (rows: { amount: number; currency: string; rate_date: string }[]) => {
      const values: number[] = [];
      for (const row of rows) {
        const value = convert(row.amount, row.currency, currency, row.rate_date, state.rates);
        if (value === null) incomplete = true;
        else values.push(value);
      }
      return sumAmounts(values);
    };

    const income = convertRows(state.incomes);
    // Every item counts against the balance, ticked or not. Ticking only
    // records that it has been handed over.
    const committed = convertRows(state.items);
    const stillToPay = convertRows(state.items.filter((i) => !i.is_paid));

    return {
      income,
      committed,
      stillToPay,
      balance: sumAmounts([income, -committed]),
      incomplete,
    };
  }, [state.incomes, state.items, state.rates, currency]);

  const value: BudgetContext = {
    ...state,
    household,
    activeProfile,
    currency,
    isCurrentCycle: state.cycle?.start_date === currentCycleKey(),
    canStepBack: state.viewIndex > 0,
    canStepForward: state.viewIndex >= 0 && state.viewIndex < state.cycles.length - 1,
    totals,
    inDisplay,
    createHousehold,
    joinHousehold,
    selectProfile,
    addProfile,
    updateActiveProfile,
    removeActiveProfile,
    setDisplayCurrency,
    stepCycle,
    addItem,
    editItem,
    removeItem,
    toggleItem,
    resetAll,
    addIncome,
    editIncome,
    removeIncome,
    refreshHousehold,
    dismissError: () => patch({ error: null }),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
