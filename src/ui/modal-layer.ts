import { createContext, useContext } from 'react'

export const ModalLayerContext = createContext<{ host: HTMLDivElement | null; activate: (back: () => void) => () => void } | null>(null)
export function useModalLayer() { return useContext(ModalLayerContext) }
