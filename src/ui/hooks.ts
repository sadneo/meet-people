import { useCallback, useEffect, useRef, useState } from "react";

export function useLoad<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{
    value: T | null;
    error: string;
    loading: boolean;
    loader: typeof load | null;
    version: number;
  }>({ value: null, error: "", loading: true, loader: null, version: -1 });
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted)
          setState({ value, error: "", loading: false, loader: load, version });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            value: null,
            error:
              error instanceof Error
                ? error.message
                : "This service is unavailable. Try again.",
            loading: false,
            loader: load,
            version,
          });
      });
    return () => controller.abort();
  }, [load, version]);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return {
    ...(state.loader === load && state.version === version
      ? state
      : { value: null, error: "", loading: true }),
    reload,
  };
}
export function useAction() {
  const lock = useRef(false),
    live = useRef(true);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    if (lock.current || !live.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      return await action();
    } catch (failure) {
      if (live.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "The action could not be confirmed. Refresh before trying again.",
        );
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }
  return { busy, error, run };
}
