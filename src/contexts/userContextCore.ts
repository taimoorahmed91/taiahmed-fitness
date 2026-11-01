import { createContext, useContext } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import type { AccessSource } from '@/lib/offlineIdentity';

// The user context object, kept apart from UserProvider (which imports the Supabase client) so small pieces of UI can ask
// "which account is this?" without loading the client or needing a provider. UserProvider and `useUser` stay in UserContext.tsx.

export interface UserContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  recovering: boolean;
  isApproved: boolean | null;
  isOwner: boolean | null;
  /** Where `isApproved` came from. 'last-known-offline' = the server could not be reached (see lib/offlineIdentity.ts). */
  approvalSource: AccessSource | null;
  /**
   * True when approval comes only from this device's memory of a past server approval: the person may use
   * local workout recovery, nothing more. Owner rights are never granted this way and no server write is allowed.
   */
  offlineRecoveryOnly: boolean;
  /** The last profile check failed (it is retried when the connection returns). */
  profileError: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  isLoggedIn: boolean;
}

export const UserContext = createContext<UserContextType | undefined>(undefined);


/**
 * The signed-in user's id, or null when signed out or when there is no UserProvider (isolated previews and tests).
 * Never throws. For code that only needs to know WHICH account is on screen (to keep one account's UI state away from
 * another), without requiring a provider.
 */
export const useOptionalUserId = (): string | null => useContext(UserContext)?.user?.id ?? null;
