import { useState } from 'react';
import { BalanceBlock } from '../components/BalanceBlock';
import { CycleNav } from '../components/CycleNav';
import { ProfileSwitcher } from '../components/ProfileSwitcher';
import { parseAmount, toEditableString } from '../lib/money';
import { useBudget } from '../state/store';

export default function Overview() {
  const { totals, currency, setIncome } = useBudget();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function startEditing() {
    setDraft(toEditableString(totals.income, currency));
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const parsed = parseAmount(draft);
    if (parsed !== null) void setIncome(parsed);
    else if (draft.trim() === '') void setIncome(0);
  }

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
        editingIncome={editing}
        incomeDraft={draft}
        onIncomeDraft={setDraft}
        onIncomeCommit={commit}
        onEditIncome={startEditing}
      />
    </div>
  );
}
