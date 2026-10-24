import { useMemo, useState } from 'react';
import { BalanceBlock } from '../components/BalanceBlock';
import { CycleNav } from '../components/CycleNav';
import { ProfileSwitcher } from '../components/ProfileSwitcher';
import { Button, CurrencyChips, Micro, Modal, Rule, TextInput } from '../components/ui';
import type { Income } from '../lib/db';
import { CURRENCIES, formatAmount, parseAmount, toEditableString } from '../lib/money';
import { byAmount, type AmountSort } from '../lib/sorting';
import { useBudget } from '../state/store';

export default function Overview() {
  const {
    totals,
    currency,
    incomes,
    activeProfile,
    ratesApproximate,
    inDisplay,
    addIncome,
    editIncome,
    removeIncome,
    setDisplayCurrency,
  } = useBudget();

  const { items } = useBudget();
  const [showIncome, setShowIncome] = useState(false);
  const [showCurrency, setShowCurrency] = useState(false);
  const [sort, setSort] = useState<AmountSort>('high');
  // Sort by what each item is worth in the displayed currency, not by its
  // raw number — otherwise €800 of rent ranks below ₺1.250 of electricity.
  const ordered = useMemo(
    () => byAmount(items, sort, (item) => inDisplay(item) ?? item.amount),
    [items, sort, inDisplay],
  );

  return (
    <div>
      <ProfileSwitcher />
      <CycleNav />
      <BalanceBlock
        balance={totals.balance}
        income={totals.income}
        committed={totals.committed}
        stillToPay={totals.stillToPay}
        currency={currency}
        approximate={ratesApproximate || totals.incomplete}
        onEditIncome={() => setShowIncome(true)}
        onChangeCurrency={() => setShowCurrency(true)}
      />

      {/* The items themselves, biggest first. Ticking happens on the
          Checklist; this is the read view. */}
      <div className="flex px-5 py-3">
        <button
          type="button"
          onClick={() => setSort((s) => (s === 'high' ? 'low' : 'high'))}
          className="micro text-text-secondary active:text-text"
          aria-label={`Sorted by amount, ${
            sort === 'high' ? 'high to low' : 'low to high'
          }. Tap to reverse.`}
        >
          Amount, {sort === 'high' ? 'high to low' : 'low to high'}
        </button>
      </div>
      <Rule />

      {ordered.length === 0 ? (
        <p className="px-5 py-10 text-[15px] text-text-muted">
          Nothing in this cycle yet. Add the first item on the Checklist.
        </p>
      ) : (
        ordered.map((item) => {
          const converted = inDisplay(item);
          const foreign = item.currency !== currency;
          return (
            <div
              key={item.id}
              className="flex items-center gap-3 border-b border-rule px-5 py-4"
            >
              <span
                className={`flex-1 text-[16px] ${
                  item.is_paid ? 'text-text-muted' : 'text-text'
                }`}
              >
                {item.name}
              </span>
              <span className="flex flex-col items-end">
                <span
                  className={`font-mono tnum text-[16px] ${
                    item.is_paid ? 'text-text-muted' : 'text-text'
                  }`}
                >
                  {formatAmount(item.amount, item.currency)}
                  {foreign && (
                    <span className="micro ml-1.5 text-text-muted">{item.currency}</span>
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
            </div>
          );
        })
      )}

      <IncomeSheet
        open={showIncome}
        onClose={() => setShowIncome(false)}
        incomes={incomes}
        displayCurrency={currency}
        defaultCurrency={activeProfile?.currency ?? 'TRY'}
        inDisplay={inDisplay}
        onAdd={addIncome}
        onEdit={editIncome}
        onRemove={removeIncome}
      />

      <Modal
        open={showCurrency}
        onClose={() => setShowCurrency(false)}
        title="Show totals in"
      >
        <CurrencyChips
          value={currency}
          options={CURRENCIES}
          onChange={(code) => {
            // Back to the profile's own currency means no override at all.
            setDisplayCurrency(code === activeProfile?.currency ? null : code);
            setShowCurrency(false);
          }}
        />
        <p className="mt-4 text-[13px] leading-relaxed text-text-muted">
          Each entry keeps the currency it was typed in. Only the totals are
          converted, at the rate of the cycle they belong to.
        </p>
      </Modal>
    </div>
  );
}

function IncomeSheet({
  open,
  onClose,
  incomes,
  displayCurrency,
  defaultCurrency,
  inDisplay,
  onAdd,
  onEdit,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  incomes: Income[];
  displayCurrency: string;
  defaultCurrency: string;
  inDisplay: (row: { amount: number; currency: string; rate_date: string }) => number | null;
  onAdd: (name: string, amount: number, currency: string) => Promise<void>;
  onEdit: (
    id: string,
    patch: { name?: string; amount?: number; currency?: string },
  ) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState<Income | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);

  function reset() {
    setEditing(null);
    setName('');
    setAmount('');
    setCurrency(defaultCurrency);
  }

  function select(income: Income) {
    setEditing(income);
    setName(income.name);
    setAmount(toEditableString(income.amount, income.currency));
    setCurrency(income.currency);
  }

  async function submit() {
    const trimmed = name.trim() || 'Income';
    const parsed = parseAmount(amount);
    if (parsed === null) return;
    if (editing) await onEdit(editing.id, { name: trimmed, amount: parsed, currency });
    else await onAdd(trimmed, parsed, currency);
    reset();
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Income"
    >
      {incomes.length > 0 && (
        <div className="-mx-5 mb-5">
          <Rule />
          {incomes.map((income) => {
            const converted = inDisplay(income);
            const selected = editing?.id === income.id;
            return (
              <div
                key={income.id}
                className={`flex items-center border-b border-rule ${
                  selected ? 'bg-surface-raised' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => select(income)}
                  className="flex flex-1 items-center gap-3 px-5 py-3 text-left"
                >
                  <span className="flex-1 text-[15px]">{income.name}</span>
                  <span className="flex flex-col items-end">
                    <span className="font-mono tnum text-[15px]">
                      {formatAmount(income.amount, income.currency)}
                      {income.currency !== displayCurrency && (
                        <span className="micro ml-1.5 text-text-muted">{income.currency}</span>
                      )}
                    </span>
                    {/* What it is worth in the currency being displayed. */}
                    {income.currency !== displayCurrency && (
                      <span className="micro mt-0.5 text-text-muted">
                        {converted === null
                          ? 'no rate'
                          : `≈ ${formatAmount(converted, displayCurrency)}`}
                      </span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void onRemove(income.id)}
                  aria-label={`Remove ${income.name}`}
                  className="h-11 w-10 text-text-muted active:text-text"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Micro>{editing ? 'Edit entry' : 'Add income'}</Micro>
      <TextInput
        className="mt-2"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Salary"
      />
      <TextInput
        className="mt-2 font-mono tnum"
        inputMode="decimal"
        enterKeyHint="done"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0"
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit();
        }}
      />
      <CurrencyChips
        className="mt-2"
        value={currency}
        options={CURRENCIES}
        onChange={setCurrency}
      />

      <div className="mt-5 flex gap-3">
        {editing && (
          <Button variant="quiet" className="flex-1" onClick={reset}>
            Cancel
          </Button>
        )}
        <Button
          variant="solid"
          className="flex-1"
          disabled={parseAmount(amount) === null}
          onClick={submit}
        >
          {editing ? 'Save' : 'Add'}
        </Button>
      </div>
    </Modal>
  );
}
