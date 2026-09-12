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
    <SheetContext.Provider value={{ open, close }}>
      {children}
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
    </SheetContext.Provider>
  );
}
