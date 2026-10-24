import { useMemo, useState } from 'react';
import {
  Button,
  Confirm,
  CurrencyChips,
  Micro,
  Modal,
  Rule,
  TextInput,
} from '../components/ui';
import type { GroceryItem } from '../lib/db';
import { CURRENCIES, formatAmount, formatMoney, parseAmount, sumAmounts, toEditableString } from '../lib/money';
import { useBudget } from '../state/store';

const NO_STORE = 'Anywhere';

export default function Groceries() {
  const {
    groceries,
    currency,
    activeProfile,
    inDisplay,
    addGrocery,
    editGrocery,
    removeGrocery,
    toggleGrocery,
    clearGroceries,
    checkoutGroceries,
  } = useBudget();

  const ownCurrency = activeProfile?.currency ?? 'TRY';
  const [name, setName] = useState('');
  const [store, setStore] = useState('');
  const [amount, setAmount] = useState('');
  const [newCurrency, setNewCurrency] = useState(ownCurrency);
  const [editing, setEditing] = useState<GroceryItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editStore, setEditStore] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCurrency, setEditCurrency] = useState(ownCurrency);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmCheckout, setConfirmCheckout] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  /** Shops already used on this list, offered as suggestions. */
  const knownStores = useMemo(
    () => [...new Set(groceries.map((g) => g.store).filter(Boolean) as string[])].sort(),
    [groceries],
  );

  const value = (row: GroceryItem) => inDisplay(row) ?? 0;

  /** Grouped by shop, because that is how you pay for them. */
  const groups = useMemo(() => {
    const byStore = new Map<string, GroceryItem[]>();
    for (const row of groceries) {
      const key = row.store?.trim() || NO_STORE;
      byStore.set(key, [...(byStore.get(key) ?? []), row]);
    }
    return [...byStore.entries()]
      .sort(([a], [b]) => (a === NO_STORE ? 1 : b === NO_STORE ? -1 : a.localeCompare(b)))
      .map(([shop, rows]) => ({
        shop,
        rows: [...rows].sort((a, b) =>
          a.is_bought === b.is_bought ? a.sort_order - b.sort_order : a.is_bought ? 1 : -1,
        ),
        subtotal: sumAmounts(rows.map(value)),
      }));
  }, [groceries, inDisplay]);

  const total = sumAmounts(groceries.map(value));
  const bought = sumAmounts(groceries.filter((g) => g.is_bought).map(value));
  const boughtCount = groceries.filter((g) => g.is_bought).length;

  async function submitNew() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await addGrocery(trimmed, store, parseAmount(amount) ?? 0, newCurrency);
    setName('');
    setAmount('');
    // The shop usually stays the same for the next few lines.
  }

  function openEdit(row: GroceryItem) {
    setEditing(row);
    setEditName(row.name);
    setEditStore(row.store ?? '');
    setEditAmount(toEditableString(row.amount, row.currency));
    setEditCurrency(row.currency);
  }

  async function saveEdit() {
    if (!editing) return;
    await editGrocery(editing.id, {
      name: editName.trim() || editing.name,
      store: editStore.trim() || null,
      amount: parseAmount(editAmount) ?? editing.amount,
      currency: editCurrency,
    });
    setEditing(null);
  }

  return (
    <div className="pb-4">
      <div className="grid grid-cols-2">
        <div className="px-5 py-4">
          <Micro>Shopping list</Micro>
          <div className="mt-1.5 font-mono tnum text-[18px]">
            {formatMoney(total, currency)}
          </div>
        </div>
        <div className="border-l border-rule px-5 py-4">
          <Micro>In the basket</Micro>
          <div className="mt-1.5 font-mono tnum text-[18px]">
            {formatAmount(bought, currency)}
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
                {formatAmount(group.subtotal, currency)}
              </span>
            </div>
            <Rule />
            {group.rows.map((row) => {
              const foreign = row.currency !== currency;
              const converted = inDisplay(row);
              return (
                <div key={row.id} className="flex items-center border-b border-rule">
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
                            : `≈ ${formatAmount(converted, currency)}`}
                        </span>
                      )}
                    </span>
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
              );
            })}
          </div>
        ))
      )}

      {/* ------------------------------------------------------- add a line */}
      <div className="mt-6 px-5">
        <Micro>Add</Micro>
        <TextInput
          className="mt-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Banana"
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submitNew();
          }}
        />
        <div className="mt-2 flex gap-2">
          <TextInput
            className="min-w-0 flex-1 basis-0"
            list="known-stores"
            value={store}
            onChange={(e) => setStore(e.target.value)}
            placeholder="Shop"
          />
          <TextInput
            className="w-24 shrink-0 grow-0 basis-24 font-mono tnum"
            inputMode="decimal"
            enterKeyHint="done"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitNew();
            }}
          />
          <Button variant="solid" className="px-5" disabled={!name.trim()} onClick={submitNew}>
            Add
          </Button>
        </div>
        <datalist id="known-stores">
          {knownStores.map((shop) => (
            <option key={shop} value={shop} />
          ))}
        </datalist>
        <CurrencyChips
          className="mt-2"
          value={newCurrency}
          options={CURRENCIES}
          onChange={setNewCurrency}
        />
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
        <p className="mt-3 text-[13px] leading-relaxed text-text-muted">
          {boughtCount === 0
            ? 'Tick things off as you buy them. What you have bought can then be added to this cycle as one item.'
            : `Adds ${formatAmount(bought, currency)} to this cycle and clears the ${boughtCount} ticked ${
                boughtCount === 1 ? 'line' : 'lines'
              }. Anything you did not find stays on the list.`}
        </p>

        <Button
          variant="outline"
          className="mt-5 w-full"
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
        <label className="mt-4 block">
          <Micro>Shop</Micro>
          <TextInput
            className="mt-2"
            list="known-stores"
            value={editStore}
            onChange={(e) => setEditStore(e.target.value)}
            placeholder="Anywhere"
          />
        </label>
        <label className="mt-4 block">
          <Micro>Price</Micro>
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
        <div className="mt-4">
          <Micro>Currency</Micro>
          <CurrencyChips
            className="mt-2"
            value={editCurrency}
            options={CURRENCIES}
            onChange={setEditCurrency}
          />
        </div>
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

      <Confirm
        open={confirmCheckout}
        title="Add to budget"
        body={`${formatAmount(bought, currency)} goes into this cycle as an item called “Groceries”, and the ticked lines leave the list. Anything still unticked stays.`}
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
