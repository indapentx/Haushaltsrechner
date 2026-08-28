import { useMemo, useState } from 'react';
import { ItemRow } from '../components/ItemRow';
import { useFlipList } from '../components/useFlipList';
import { Button, Confirm, Micro, Modal, Rule, TextInput } from '../components/ui';
import type { Item } from '../lib/db';
import { formatAmount, parseAmount, toEditableString } from '../lib/money';
import { checklistOrder } from '../lib/sorting';
import { useBudget } from '../state/store';

export default function Checklist() {
  const { items, currency, totals, toggleItem, addItem, editItem, removeItem, resetAll } =
    useBudget();

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [acting, setActing] = useState<Item | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [editName, setEditName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Item | null>(null);

  const ordered = useMemo(() => checklistOrder(items), [items]);
  const registerRow = useFlipList(ordered.map((i) => i.id).join('|'));

  async function submitNew() {
    const trimmed = name.trim();
    const parsed = parseAmount(amount);
    if (!trimmed) return;
    await addItem(trimmed, parsed ?? 0);
    setName('');
    setAmount('');
  }

  function openEdit(item: Item) {
    setActing(null);
    setEditing(item);
    setEditName(item.name);
    setEditAmount(toEditableString(item.amount, currency));
  }

  async function saveEdit() {
    if (!editing) return;
    const trimmed = editName.trim();
    const parsed = parseAmount(editAmount);
    await editItem(editing.id, {
      ...(trimmed ? { name: trimmed } : {}),
      ...(parsed !== null ? { amount: parsed } : {}),
    });
    setEditing(null);
  }

  return (
    <div className="pb-4">
      <div className="flex items-baseline justify-between px-5 py-4">
        <Micro>Still to pay</Micro>
        <span className="font-mono tnum text-[18px]">
          {formatAmount(totals.stillToPay, currency)}
        </span>
      </div>
      <Rule />

      {ordered.length === 0 ? (
        <p className="px-5 py-10 text-[15px] text-text-muted">
          Nothing in this cycle yet. Add the first item below.
        </p>
      ) : (
        <div>
          {ordered.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              currency={currency}
              rowRef={registerRow(item.id)}
              onToggle={() => void toggleItem(item.id)}
              onOpenActions={() => setActing(item)}
            />
          ))}
        </div>
      )}

      {/* Add item */}
      <div className="mt-6 px-5">
        <Micro>Add item</Micro>
        <div className="mt-2 flex gap-2">
          <TextInput
            className="min-w-0 flex-1 basis-0"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitNew();
            }}
          />
          <TextInput
            className="w-24 shrink-0 grow-0 basis-24 font-mono tnum"
            value={amount}
            inputMode="decimal"
            enterKeyHint="done"
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitNew();
            }}
          />
          <Button
            variant="solid"
            className="px-5"
            disabled={!name.trim()}
            onClick={submitNew}
          >
            Add
          </Button>
        </div>
      </div>

      <div className="mt-10 px-5">
        <Button
          variant="outline"
          className="w-full"
          disabled={items.length === 0}
          onClick={() => setConfirmReset(true)}
        >
          Reset all
        </Button>
      </div>

      {/* Long-press actions */}
      <Modal open={acting !== null} onClose={() => setActing(null)} title={acting?.name ?? ''}>
        <div className="flex flex-col gap-3">
          <Button variant="outline" onClick={() => acting && openEdit(acting)}>
            Edit
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setConfirmDelete(acting);
              setActing(null);
            }}
          >
            Delete
          </Button>
          <Button variant="quiet" onClick={() => setActing(null)}>
            Cancel
          </Button>
        </div>
      </Modal>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Edit item">
        <label className="block">
          <Micro>Name</Micro>
          <TextInput
            className="mt-2"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />
        </label>
        <label className="mt-4 block">
          <Micro>Amount</Micro>
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
          <Button variant="quiet" className="flex-1" onClick={() => setEditing(null)}>
            Cancel
          </Button>
          <Button variant="solid" className="flex-1" onClick={saveEdit}>
            Save
          </Button>
        </div>
      </Modal>

      <Confirm
        open={confirmDelete !== null}
        title="Delete item"
        body={`“${confirmDelete?.name ?? ''}” will be removed from this cycle. Past cycles keep their own copy.`}
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) void removeItem(confirmDelete.id);
          setConfirmDelete(null);
        }}
      />

      <Confirm
        open={confirmReset}
        title="Reset all"
        body="Unticks every item in this cycle. Amounts, income and the cycle itself are left alone."
        confirmLabel="Reset all"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          void resetAll();
          setConfirmReset(false);
        }}
      />
    </div>
  );
}
