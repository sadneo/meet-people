import { createContext, useContext, type Dispatch } from 'react'
import type { Action, Scene, State } from './model'

export type PrototypeContextValue = {
  state: State; dispatch: Dispatch<Action>; scene: Scene; go: (scene: Scene) => void;
  empty: boolean; setEmpty: (empty: boolean) => void;
  personId: string; setPersonId: (id: string) => void;
  eventId: string; setEventId: (id: string) => void;
  chatPerson: string | null; setChatPerson: (id: string | null) => void;
}
export const PrototypeContext = createContext<PrototypeContextValue | null>(null)
export function usePrototype() {
  const context = useContext(PrototypeContext)
  if (!context) throw new Error('Prototype screens require the local prototype provider')
  return context
}
