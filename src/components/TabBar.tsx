import { Rule } from './ui';

export const TABS = ['Overview', 'Checklist', 'Expenses', 'Settings'] as const;
export type Tab = (typeof TABS)[number];

/**
 * No router: four tabs, no deep links, and a standalone iOS app has no back
 * button to honour.
 */
export function TabBar({
  active,
  onSelect,
}: {
  active: Tab;
  onSelect: (tab: Tab) => void;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 bg-ink">
      <div className="mx-auto w-full max-w-md">
        <Rule />
        <div className="grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
          {TABS.map((tab) => {
            const selected = tab === active;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => onSelect(tab)}
                aria-current={selected ? 'page' : undefined}
                className={`micro min-h-14 border-r border-rule last:border-r-0 ${
                  selected ? 'text-text' : 'text-text-muted'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
