import { useState } from 'react';
import { TabBar, type Tab } from './components/TabBar';
import { Button } from './components/ui';
import Checklist from './screens/Checklist';
import Overview from './screens/Overview';
import Settings from './screens/Settings';
import FirstBudget from './screens/FirstBudget';
import SignIn from './screens/SignIn';
import { BudgetProvider, useBudget } from './state/store';
import { useAuth } from './state/useAuth';

export default function App() {
  const { session, loading } = useAuth();

  if (loading) return <Splash />;
  if (!session) return <SignIn />;

  return (
    <BudgetProvider>
      <Main />
    </BudgetProvider>
  );
}

function Main() {
  const { loading, profiles, error, dismissError } = useBudget();
  const [tab, setTab] = useState<Tab>('Overview');

  if (loading) return <Splash />;
  if (profiles.length === 0) return <FirstBudget />;

  return (
    <div className="min-h-dvh bg-ink">
      <main className="mx-auto w-full max-w-md pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+4.5rem)] sm:border-x sm:border-rule sm:min-h-dvh">
        {tab === 'Overview' && <Overview />}
        {tab === 'Checklist' && <Checklist />}
        {tab === 'Settings' && <Settings />}
      </main>

      {error && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+3.5rem)] z-50 mx-auto w-full max-w-md px-5">
          <div className="flex items-center gap-3 border border-rule bg-surface px-4 py-3">
            <span className="flex-1 text-[13px] leading-snug text-text-secondary">
              {error}
            </span>
            <Button variant="quiet" className="min-h-9 px-0" onClick={dismissError}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <TabBar active={tab} onSelect={setTab} />
    </div>
  );
}

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink">
      <span className="micro text-text-muted">Haushaltsrechner</span>
    </div>
  );
}
