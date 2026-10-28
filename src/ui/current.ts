import { createContext, useContext } from "react";
import type { Session } from "@supabase/supabase-js";
import type { useUnifiedAccount } from "../auth/useUnifiedAccount";

type Current = ReturnType<typeof useUnifiedAccount> & { session: Session };
export const CurrentContext = createContext<Current | null>(null);
export function useCurrent() {
  const value = useContext(CurrentContext);
  if (!value) throw new Error("Signed-in account required");
  return value;
}
