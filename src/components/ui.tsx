import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';

/** Hairline rule, the app's main structural device. */
export function Rule({ className = '' }: { className?: string }) {
  return <div className={`h-px bg-rule ${className}`} />;
}

type ButtonVariant = 'solid' | 'outline' | 'quiet';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  // The one filled control: primary actions only.
  solid: 'bg-text text-ink active:bg-text-secondary',
  outline: 'border border-rule text-text active:bg-surface-raised',
  quiet: 'text-text-secondary active:text-text',
};

export function Button({
  variant = 'outline',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={`min-h-11 px-4 rounded-none transition-colors disabled:opacity-40 disabled:pointer-events-none ${BUTTON_STYLES[variant]} ${className}`}
      {...props}
    />
  );
}

export function TextInput({
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`min-h-11 w-full bg-surface-raised px-3 text-text placeholder:text-text-muted ${className}`}
      {...props}
    />
  );
}

/** Uppercase mono micro-label. */
export function Micro({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`micro text-text-secondary ${className}`}>{children}</span>;
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    panel.current?.querySelector<HTMLElement>('input, button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full sm:max-w-sm border-t sm:border border-rule bg-surface pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-4">
          <Micro>{title}</Micro>
        </div>
        <Rule />
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/**
 * Destructive confirmation. Outlined, never filled, per the spec's rule for
 * destructive actions. `requireText` makes the user type a value (the profile
 * name) before the action unlocks.
 */
export function Confirm({
  open,
  title,
  body,
  confirmLabel,
  requireText,
  typed,
  onTyped,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  requireText?: string;
  typed?: string;
  onTyped?: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const locked = requireText !== undefined && typed !== requireText;

  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-text-secondary text-[15px] leading-relaxed">{body}</p>
      {requireText !== undefined && (
        <label className="mt-4 block">
          <Micro>Type “{requireText}” to confirm</Micro>
          <TextInput
            className="mt-2"
            value={typed ?? ''}
            onChange={(e) => onTyped?.(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
          />
        </label>
      )}
      <div className="mt-6 flex gap-3">
        <Button variant="quiet" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="outline" className="flex-1" disabled={locked} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
