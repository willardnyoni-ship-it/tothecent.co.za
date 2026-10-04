import { useBudget } from '../store/BudgetStore.jsx';
import { SheetOutlet, useSheet } from './Sheet.jsx';
import SubscriptionPanel from './SubscriptionPanel.jsx';
import { DataSheetContent, SubscriptionSheetContent } from './SettingsSheets.jsx';

// Shown instead of the app once the free month is over and nobody is paying.
// People's data is never held back: they can still download it from here.
export default function Paywall() {
  const { doSignOut, syncCfg } = useBudget();
  const { open } = useSheet();
  return (
    <div className="light-tab" style={{ minHeight: '100vh', padding: '28px 16px 40px' }}>
      <div style={{ maxWidth: 460, margin: '0 auto' }}>
        <h1 style={{ marginBottom: 6 }}>Your free month has ended</h1>
        <div className="sub" style={{ marginBottom: 16 }}>Subscribe to keep using To The Cent. Everything you added is still here, and it all comes back as soon as you subscribe.</div>
        <SubscriptionPanel />
        <div style={{ height: 14 }} />
        <button className="b g" onClick={() => open(() => <DataSheetContent />)}>Download a copy of my data</button>
        <div style={{ height: 8 }} />
        <button className="b g sm" style={{ width: '100%' }} onClick={doSignOut}>Sign out{syncCfg.email ? ` (${syncCfg.email})` : ''}</button>
        <div className="mini" style={{ marginTop: 14, textAlign: 'center' }}>Questions about billing? Reply to any email from us.</div>
      </div>
      <SheetOutlet />
    </div>
  );
}

// A slim reminder in the last week of the free month.
export function TrialBar({ daysLeft }) {
  const { open } = useSheet();
  return (
    <div style={{ background: 'var(--acc, #238B57)', color: '#fff', padding: '8px 14px', fontSize: 14, display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
      <span>Your free month ends in {daysLeft} day{daysLeft === 1 ? '' : 's'}.</span>
      <button className="b sm" style={{ background: '#fff', color: '#16603C' }} onClick={() => open(() => <SubscriptionSheetContent />)}>Subscribe</button>
    </div>
  );
}
