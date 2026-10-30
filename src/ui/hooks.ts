import { useCallback, useEffect, useRef, useState } from "react";

export function useLoad<T>(
  load: (signal: AbortSignal) => Promise<T>,
  polling?: { intervalMs: number; shouldPoll: (value: T) => boolean },
) {
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
  const intervalMs = polling?.intervalMs ?? 0;
  const shouldPoll = polling?.shouldPoll;
  useEffect(() => {
    if (
      intervalMs <= 0 ||
      state.loading ||
      state.error ||
      state.value === null ||
      state.loader !== load ||
      state.version !== version ||
      !shouldPoll?.(state.value)
    ) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      // Background reads retain the current view while the request is pending.
      void load(controller.signal)
        .then((value) => {
          if (!controller.signal.aborted)
            setState({ value, error: "", loading: false, loader: load, version });
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setState({
              value: null,
              error: error instanceof Error ? error.message : "This service is unavailable. Try again.",
              loading: false,
              loader: load,
              version,
            });
        });
    }, intervalMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [intervalMs, shouldPoll, state, load, version]);
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
