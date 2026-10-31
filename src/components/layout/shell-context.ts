import { createContext, useContext } from 'react';

/** Set by AppLayout. Chrome that behaves differently inside the signed-in shell reads it. */
export const ShellContext = createContext<boolean>(false);

export const useInsideAppShell = () => useContext(ShellContext);
