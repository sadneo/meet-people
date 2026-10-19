import type { ReactNode } from 'react'
import { AccountUiPreviewContext, usePreviewState } from './account-ui-preview-context'
import './account-preferences.css'

export function AccountUiPreviewProvider({ children }: { children: ReactNode }) {
  const value = usePreviewState()
  return <AccountUiPreviewContext.Provider value={value}>{children}</AccountUiPreviewContext.Provider>
}
