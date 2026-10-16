import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Account } from '../../shared/account'

export type AccountContextValue = { session: Session | null; account: Account; loaded: boolean; busy: boolean; error: string; save: (value: Account) => Promise<boolean>; reload: () => Promise<void> }
export const AccountContext = createContext<AccountContextValue | null>(null)
export function useAccount() { return useContext(AccountContext) }
