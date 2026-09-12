import { createContext, useCallback, useContext, useState } from 'react';
import ErrorBoundary from './ErrorBoundary.jsx';

const SheetContext = createContext(null);

export function useSheet() {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error('useSheet must be used inside <SheetProvider>');
  return ctx;
}

export function SheetProvider({ children }) {
  const [content, setContent] = useState(null);
  const open = useCallback((node) => setContent(() => node), []);
  const close = useCallback(() => setContent(null), []);

  return (
    <SheetContext.Provider value={{ open, close, content }}>
      {children}
    </SheetContext.Provider>
  );
}

// The overlay itself, split out from SheetProvider so it can be mounted
// deeper in the tree, inside whatever other context a given app shell sets
// up (NavContext, for Personal's Shell). SheetProvider has to wrap the
// shell from above since the shell calls useSheet() itself to open things -
// but sheet CONTENT (e.g. ConfirmSlipSheet, which calls useNav() to jump
// to Today after saving a slip) needs to render *inside* that context, not
// as a sibling of it. Rendering the overlay here, inside the shell, instead
// of inside SheetProvider's own JSX, is what makes that possible.
export function SheetOutlet() {
  const { content, close } = useSheet();
  return (
    <div className={'sheet' + (content ? ' on' : '')} id="sheet" onClick={e => { if (e.target.id === 'sheet') close(); }}>
      <div>
        <div className="grab" />
        {/* A sheet showing a bad result (e.g. an odd-shaped OCR read) used
            to crash the ENTIRE app to a blank white screen, since nothing
            anywhere caught render errors. Scoping the boundary to just the
            sheet keeps the rest of the app (nav, whatever tab is open)
            working even if this one sheet's content can't render - keyed
            on content so opening something else clears any past error. */}
        <ErrorBoundary resetKey={content} fallback={err => (
          <div style={{ textAlign: 'center', padding: '20px 4px' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Could not show this</div>
            <div className="mini" style={{ marginBottom: 12 }}>{err.message || 'Unknown error'}</div>
            <button className="b g" onClick={close}>Close</button>
          </div>
        )}>
          {typeof content === 'function' ? content() : content}
        </ErrorBoundary>
      </div>
    </div>
  );
}
