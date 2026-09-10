import { createContext, useCallback, useContext, useState } from 'react';

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
          {typeof content === 'function' ? content() : content}
        </div>
      </div>
    </SheetContext.Provider>
  );
}
