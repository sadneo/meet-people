import { createContext, useContext, useState } from 'react'

// Unsupported fields deliberately live only in this actor-scoped React tree.
// No storage, requests or canonical profile writes. Replace at the resource boundary.
export const previewNote = 'Preview for this visit only. These changes are not saved to your account.'
export function usePreviewState() {
  const [picture, setPicture] = useState<string | null | undefined>(undefined)
  return { picture, setPicture }
}
type PreviewState = ReturnType<typeof usePreviewState>
export const AccountUiPreviewContext = createContext<PreviewState | null>(null)
export function useAccountUiPreview() {
  const context = useContext(AccountUiPreviewContext)
  const standalone = usePreviewState()
  return context ?? standalone
}
