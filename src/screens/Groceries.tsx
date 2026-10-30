import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Confirm, Micro, Modal, Rule, TextInput } from '../components/ui';
import { ReorderList } from '../components/ReorderList';
import { SwipeRow } from '../components/SwipeRow';
import type { GroceryItem } from '../lib/db';
import { convert } from '../lib/fx';
import {
  formatAmount,
  formatMoney,
  parseAmount,
  sumAmounts,
  toEditableString,
} from '../lib/money';
import { useBudget } from '../state/store';

const NO_STORE = 'Anywhere';

/**
 * The shopping happens in Germany, so every line is in euros. Kept as one
 * constant rather than a picker: a currency chooser on every line is noise
 * when the answer never changes. Change this if the shopping moves country.
 */
const GROCERY_CURRENCY = 'EUR';

/** Remembered per budget, so the shop you used last is already filled in. */
const LAST_SHOP_KEY = 'budget.lastShop';

/** Which currency the list's own totals are read in. */
const LIST_CURRENCY_KEY = 'budget.listCurrency';

export default function Groceries() {
  const {
    groceries,
    shops,
    currency,
    rates,
    activeProfile,
    addGrocery,
    addShop,
    reorderShops,
    removeShop,
    editGrocery,
    removeGrocery,
    toggleGrocery,
    clearGroceries,
    checkoutGroceries,
  } = useBudget();

  const profileId = activeProfile?.id ?? null;

  /*
   * The list is bought in euros, so it is read in euros by default — even
   * when the budget it belongs to is denominated in something else. Tap the
   * currency to see the same figures in the budget's own currency.
   */
  const [listCurrency, setListCurrency] = useState<string>(() => {
    try {
      return localStorage.getItem(LIST_CURRENCY_KEY) ?? GROCERY_CURRENCY;
    } catch {
      return GROCERY_CURRENCY;
    }
  });

  function switchCurrency() {
    const next = listCurrency === GROCERY_CURRENCY ? currency : GROCERY_CURRENCY;
    setListCurrency(next);
    try {
      localStorage.setItem(LIST_CURRENCY_KEY, next);
    } catch {
      /* storage may be unavailable */
    }
  }

  /** A line's worth — price times how many — in the currency being read. */
  const inListCurrency = (row: GroceryItem) =>
    convert(row.amount * row.quantity, row.currency, listCurrency, row.rate_date, rates);
  const [name, setName] = useState('');
  const [store, setStore] = useState('');
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [managingShops, setManagingShops] = useState(false);
  const [newShop, setNewShop] = useState('');
  const [editing, setEditing] = useState<GroceryItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editStore, setEditStore] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editQuantity, setEditQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  /** The one row swiped open, if any. Opening another closes it. */
  const [openId, setOpenId] = useState<string | null>(null);
  const addInFlight = useRef(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmCheckout, setConfirmCheckout] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // The shop sticks until it is changed: adding ten things from one shop
  // should not mean typing its name ten times, or even once if it is the
  // same shop as last week.
  useEffect(() => {
    if (!profileId) return;
    try {
      setStore(localStorage.getItem(`${LAST_SHOP_KEY}.${profileId}`) ?? '');
    } catch {
      /* storage may be unavailable */
    }
  }, [profileId]);

  const value = (row: GroceryItem) => inListCurrency(row) ?? 0;

  /** Grouped by shop, because that is how you pay for them. */
  const groups = useMemo(() => {
    const byStore = new Map<string, GroceryItem[]>();
    for (const row of groceries) {
      const key = row.store?.trim() || NO_STORE;
      byStore.set(key, [...(byStore.get(key) ?? []), row]);
    }
    // Your order, not the alphabet. Shops that have since been removed sort
    // after the known ones; Anywhere is always last.
    const rank = new Map(shops.map((shop, index) => [shop.name, index]));
    const place = (name: string) =>
      name === NO_STORE ? Number.MAX_SAFE_INTEGER : (rank.get(name) ?? shops.length);
    return [...byStore.entries()]
      .sort(([a], [b]) => place(a) - place(b) || a.localeCompare(b))
      .map(([shop, rows]) => ({
        shop,
        rows: [...rows].sort((a, b) =>
          a.is_bought === b.is_bought ? a.sort_order - b.sort_order : a.is_bought ? 1 : -1,
        ),
        subtotal: sumAmounts(rows.map(value)),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groceries, listCurrency, rates, shops]);

  const total = sumAmounts(groceries.map(value));
  const bought = sumAmounts(groceries.filter((g) => g.is_bought).map(value));
  const boughtCount = groceries.filter((g) => g.is_bought).length;

  async function submitNew() {
    const trimmed = name.trim();
    // A double tap on a phone is easy; without this guard it adds the line
    // twice.
    if (!trimmed || addInFlight.current) return;
    addInFlight.current = true;
    setAdding(true);
    const count = Math.max(1, Math.round(Number(quantity) || 1));
    try {
      await addGrocery(trimmed, store, parseAmount(amount) ?? 0, count, GROCERY_CURRENCY);
    } finally {
      addInFlight.current = false;
      setAdding(false);
    }
    setName('');
    setAmount('');
    setQuantity('1');
    // The shop is deliberately left alone, and remembered for next time.
    if (profileId) {
      try {
        if (store.trim()) {
          localStorage.setItem(`${LAST_SHOP_KEY}.${profileId}`, store.trim());
        } else {
          localStorage.removeItem(`${LAST_SHOP_KEY}.${profileId}`);
        }
      } catch {
        /* storage may be unavailable */
      }
    }
  }

  function openEdit(row: GroceryItem) {
    setEditing(row);
    setEditName(row.name);
    setEditStore(row.store ?? '');
    setEditAmount(toEditableString(row.amount, row.currency));
    setEditQuantity(row.quantity);
  }

  async function saveEdit() {
    if (!editing) return;
    await editGrocery(editing.id, {
      name: editName.trim() || editing.name,
      store: editStore.trim() || null,
      amount: parseAmount(editAmount) ?? editing.amount,
      quantity: Math.max(1, editQuantity),
    });
    setEditing(null);
  }

  return (
    <div className="pb-4">
      <div className="grid grid-cols-2">
        <div className="px-5 py-4">
          <div className="flex items-baseline justify-between gap-2">
            <Micro>Total</Micro>
            <button
              type="button"
              onClick={switchCurrency}
              aria-label={`Showing ${listCurrency}. Tap to change.`}
              className="micro text-text-secondary active:opacity-60"
            >
              {listCurrency}
            </button>
          </div>
          <div className="mt-1.5 font-mono tnum text-[18px]">
            {formatMoney(total, listCurrency)}
          </div>
        </div>
        <div className="border-l border-rule px-5 py-4">
          {/* Same wrapper as the cell on the left: a bare inline label sits
              in the parent's line box and drops this whole column a few
              pixels below the other one. */}
          <div className="flex items-baseline justify-between gap-2">
            <Micro>In the basket</Micro>
          </div>
          <div className="mt-1.5 font-mono tnum text-[18px]">
            {formatAmount(bought, listCurrency)}
          </div>
        </div>
      </div>
      <Rule />

      {groups.length === 0 ? (
        <p className="px-5 py-10 text-[15px] text-text-muted">
          Nothing on the list. Add the first thing below.
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.shop}>
            <div className="flex items-baseline justify-between bg-surface px-5 py-2">
              <Micro className="text-text">{group.shop}</Micro>
              <span className="micro font-mono text-text-secondary">
                {formatAmount(group.subtotal, listCurrency)}
              </span>
            </div>
            <Rule />
            {group.rows.map((row) => {
              const foreign = row.currency !== listCurrency;
              const converted = inListCurrency(row);
              return (
                <SwipeRow
                  key={row.id}
                  className="bg-ink"
                  open={openId === row.id}
                  onOpenChange={(open) => setOpenId(open ? row.id : null)}
                  onTouch={() => setOpenId((id) => (id === row.id ? id : null))}
                  swallowTap={openId !== null && openId !== row.id}
                  onDelete={() => {
                    setOpenId(null);
                    void removeGrocery(row.id);
                  }}
                >
                <div className="flex items-center border-b border-rule">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={row.is_bought}
                    onClick={() => void toggleGrocery(row.id)}
                    className="flex flex-1 items-center gap-3 px-5 py-3.5 text-left"
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center border ${
                        row.is_bought ? 'border-text-muted' : 'border-text-secondary'
                      }`}
                    >
                      {row.is_bought && (
                        <svg viewBox="0 0 12 12" className="h-3 w-3 text-text-muted">
                          <path
                            d="M2 6.5 4.7 9 10 3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="square"
                          />
                        </svg>
                      )}
                    </span>
                    <span
                      className={`flex-1 text-[16px] ${
                        row.is_bought ? 'text-text-muted line-through' : 'text-text'
                      }`}
                    >
                      {row.name}
                    </span>
                    <span className="flex flex-col items-end">
                      <span
                        className={`font-mono tnum text-[15px] ${
                          row.is_bought ? 'text-text-muted line-through' : 'text-text'
                        }`}
                      >
                        {formatAmount(row.amount, row.currency)}
                        {foreign && (
                          <span className="micro ml-1.5 text-text-muted">{row.currency}</span>
                        )}
                      </span>
                      {foreign && (
                        <span className="micro mt-0.5 text-text-muted">
                          {converted === null
                            ? 'no rate'
                            : `≈ ${formatAmount(converted, listCurrency)}`}
                        </span>
                      )}
                    </span>
                  </button>
                  {/* One tap for another of the same thing — the commonest
                      correction while shopping. Lowering it is done in the
                      edit sheet. */}
                  <button
                    type="button"
                    onClick={() =>
                      void editGrocery(row.id, { quantity: row.quantity + 1 })
                    }
                    aria-label={`${row.name}: ${row.quantity}. Tap to add another.`}
                    className={`micro h-11 w-9 ${
                      row.quantity > 1 ? 'text-text' : 'text-text-muted'
                    } active:text-text`}
                  >
                    ×{row.quantity}
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(row)}
                    aria-label={`Edit ${row.name}`}
                    className="h-11 w-8 text-text-muted active:text-text"
                  >
                    ···
                  </button>
                </div>
                </SwipeRow>
              );
            })}
          </div>
        ))
      )}

      {/* ------------------------------------------------------- add a line */}
      <div className="mt-6 px-5">
        <Micro>Add</Micro>

        {/* Pick the shop rather than typing it again. Tapping the chosen one
            clears it, which files the line under Anywhere. */}
        <div className="mt-2 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {shops.map((shop) => {
            const chosen = store === shop.name;
            return (
              <button
                key={shop.id}
                type="button"
                onClick={() => setStore(chosen ? '' : shop.name)}
                aria-pressed={chosen}
                className={`min-h-9 shrink-0 rounded-full px-4 text-[14px] ${
                  chosen
                    ? 'bg-white text-black'
                    : 'border border-rule text-text-secondary active:bg-surface-raised'
                }`}
              >
                {shop.name}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setManagingShops(true)}
            aria-label="Add or remove a shop"
            className="min-h-9 w-9 shrink-0 rounded-full border border-rule text-text-secondary active:bg-surface-raised"
          >
            +
          </button>
        </div>

        <TextInput
          className="mt-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Item"
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submitNew();
          }}
        />
        <div className="mt-2 flex gap-2">
          <TextInput
            className="w-16 shrink-0 grow-0 basis-16 text-center font-mono tnum"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/\D/g, '').slice(0, 3))}
            onBlur={() => setQuantity(String(Math.max(1, Number(quantity) || 1)))}
            aria-label="How many"
          />
          <TextInput
            className="min-w-0 flex-1 basis-0 font-mono tnum"
            inputMode="decimal"
            enterKeyHint="done"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitNew();
            }}
          />
          <Button
            variant="solid"
            className="px-5"
            disabled={!name.trim() || adding}
            onClick={submitNew}
          >
            Add
          </Button>
        </div>
      </div>

      {/* --------------------------------------------------------- finish up */}
      <div className="mt-10 px-5">
        <Button
          variant="solid"
          className="w-full"
          disabled={boughtCount === 0}
          onClick={() => setConfirmCheckout(true)}
        >
          Add to budget
        </Button>
        <Button
          variant="outline"
          className="mt-3 w-full"
          disabled={groceries.length === 0}
          onClick={() => setConfirmClear(true)}
        >
          Clear list
        </Button>
      </div>

      {note && (
        <p className="mx-5 mt-5 border border-rule p-3 text-[13px] leading-relaxed text-text-secondary">
          {note}
        </p>
      )}

      {/* ------------------------------------------------------------ edit */}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Edit line">
        <label className="block">
          <Micro>Name</Micro>
          <TextInput
            className="mt-2"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
        </label>
        <div className="mt-4">
          <Micro>Shop</Micro>
          <div className="mt-2 flex flex-wrap gap-2">
            {shops.map((shop) => (
              <button
                key={shop.id}
                type="button"
                onClick={() => setEditStore(editStore === shop.name ? '' : shop.name)}
                className={`min-h-9 rounded-full px-4 text-[14px] ${
                  editStore === shop.name
                    ? 'bg-white text-black'
                    : 'border border-rule text-text-secondary'
                }`}
              >
                {shop.name}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <Micro>How many</Micro>
          <div className="mt-2 flex items-center gap-3">
            <Button
              variant="outline"
              className="w-14"
              disabled={editQuantity <= 1}
              onClick={() => setEditQuantity((n) => Math.max(1, n - 1))}
            >
              −
            </Button>
            <span className="flex-1 text-center font-mono tnum text-[18px]">
              {editQuantity}
            </span>
            <Button
              variant="outline"
              className="w-14"
              onClick={() => setEditQuantity((n) => n + 1)}
            >
              +
            </Button>
          </div>
        </div>
        <label className="mt-4 block">
          <Micro>Price each</Micro>
          <TextInput
            className="mt-2 font-mono tnum"
            inputMode="decimal"
            value={editAmount}
            onChange={(e) => setEditAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveEdit();
            }}
          />
        </label>
        <div className="mt-6 flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              if (editing) void removeGrocery(editing.id);
              setEditing(null);
            }}
          >
            Delete
          </Button>
          <Button variant="solid" className="flex-1" onClick={saveEdit}>
            Save
          </Button>
        </div>
      </Modal>

      <Modal
        open={managingShops}
        onClose={() => {
          setManagingShops(false);
          setNewShop('');
        }}
        title="Shops"
      >
        {shops.length > 0 && (
          <div className="-mx-5 -mt-5 mb-5">
            <ReorderList
              items={shops.map((shop) => ({ id: shop.id, label: shop.name }))}
              onReorder={(ids) => void reorderShops(ids)}
              trailing={(item) => (
                <button
                  type="button"
                  onClick={() => void removeShop(item.id)}
                  aria-label={`Remove ${item.label}`}
                  className="h-12 w-12 text-text-muted active:text-text"
                >
                  ×
                </button>
              )}
            />
          </div>
        )}
        <Micro>New shop</Micro>
        <TextInput
          className="mt-2"
          value={newShop}
          onChange={(e) => setNewShop(e.target.value)}
          placeholder="Edeka"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && newShop.trim()) {
              void addShop(newShop).then(() => setNewShop(''));
            }
          }}
        />
        <p className="mt-3 text-[13px] leading-relaxed text-text-muted">
          Drag the handle to set the order the list follows. Removing a shop
          leaves the lines filed under it alone.
        </p>
        <Button
          variant="solid"
          className="mt-4 w-full"
          disabled={!newShop.trim()}
          onClick={() => void addShop(newShop).then(() => setNewShop(''))}
        >
          Add shop
        </Button>
      </Modal>

      <Confirm
        open={confirmCheckout}
        title="Add to budget"
        body={`${formatAmount(bought, listCurrency)} goes into this cycle as an item called “Groceries”, and the ticked lines leave the list. Anything still unticked stays.`}
        confirmLabel="Add it"
        onCancel={() => setConfirmCheckout(false)}
        onConfirm={() => {
          setConfirmCheckout(false);
          void checkoutGroceries('Groceries').then((created) => {
            setNote(
              created === 0
                ? 'Nothing was added.'
                : `Added to this cycle as ${created} item${created === 1 ? '' : 's'}.`,
            );
            setTimeout(() => setNote(null), 5000);
          });
        }}
      />

      <Confirm
        open={confirmClear}
        title="Clear list"
        body="Everything on the list goes, bought or not. Nothing is added to your budget."
        confirmLabel="Clear it"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          void clearGroceries();
          setConfirmClear(false);
        }}
      />
    </div>
  );
}
