import { createContext, useContext } from 'react';

// Lets any tab switch tabs, and hands the Snap tab a one-shot instruction
// ('camera' | 'focus-amount') for the two Home/Receipts Quick actions that
// jump to Snap and then need it to do something on arrival.
export const NavContext = createContext(null);
export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used inside the app shell');
  return ctx;
}
