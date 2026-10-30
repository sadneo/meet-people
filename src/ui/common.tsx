import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ModalLayerContext } from './modal-layer';
import { Link } from "react-router";
import { useProfilePhoto } from "../features/account/useProfilePhoto";

export function Brand() {
  return (
    <Link to="/" aria-label="Pebble home">
      <img
        className="brand"
        src="/pebble/pebble-wordmark.svg"
        alt="Pebble"
        width="150"
        height="66"
      />
    </Link>
  );
}
export function ErrorMessage({ children }: { children?: ReactNode }) {
  return children ? (
    <p role="alert" className="account-error">
      {children}
    </p>
  ) : null;
}
export function Loading() {
  return <p role="status">Loadingâ€¦</p>;
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="card blank">
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function ActionButton({
  children,
  onClick,
  disabled = false,
  secondary = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <button
      type="button"
      className={`btn ${secondary ? "light" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    External: <path d="M7 17 17 7M7 7h10v10" />,
    Back: <path d="m15 18-6-6 6-6" />,
    ChevronRight: <path d="m9 6 6 6-6 6" />,
    Eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></>,
    EyeOff: <path d="m3 3 18 18M10.6 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8M6.5 6.5A18 18 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5.5-1.5M10 10a3 3 0 0 0 4 4"/>,
    Send: <path d="m5 12 7-7 7 7M12 5v14" />,
    Bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    Clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    More: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    Skip: <path d="m6 6 12 12M6 18 18 6" />,
    Undo: <path d="M4 10h9a7 7 0 0 1 0 14M4 10l5-5M4 10l5 5" />,
    AddFriend: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-2a6 6 0 0 1 12 0v2M19 8v6M16 11h6" /></>,
    Preferences: <path d="M4 7h16M4 17h16M9 4v6m6 4v6" />,
    DiscoveryPreferences: <><path d="M3 7h3m6 0h9M3 17h9m6 0h3" /><circle cx="9" cy="7" r="3" /><circle cx="15" cy="17" r="3" /></>,
    DiscoveryActivity: <><circle cx="12" cy="12" r="9" /><path d="M12 3v9h9" /></>,
    Settings: <><path d="m9 3-.6 2.2-2 .9-2-.6L2 9.5 3.5 11v2L2 14.5l2.4 4 2-.6 2 .9L9 21h6l.6-2.2 2-.9 2 .6 2.4-4-1.5-1.5v-2L22 9.5l-2.4-4-2 .6-2-.9L15 3H9Z"/><circle cx="12" cy="12" r="3"/></>,
    Activity: <><circle cx="12" cy="12" r="9" /><path d="M12 3v9h9M12 7v5l-3 3" /></>,
    Filter: <path d="M4 7h16M7 12h10M10 17h4" />,
    Check: <path d="m5 12 4 4L19 6" />,
    ArrowRight: <path d="M4 12h16m-6-6 6 6-6 6" />,
    Location: <><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    Garden: (
      <path d="M12 21v-9M12 16C5 16 3 12 3 6c6 0 9 3 9 8M12 12c0-6 3-9 9-9 0 6-3 9-9 9" />
    ),
    Discover: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z" />
      </>
    ),
    Events: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2" />
      </>
    ),
    Messages: (
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9.5 9.5 0 0 1-4-.9L3 21l1.9-5.5a9.5 9.5 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3h.5a8.5 8.5 0 0 1 8 8v.5Z" />
    ),
    Profile: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2" />
      </>
    ),
    Friends: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M21 21v-2a6 6 0 0 0-4-5.65" />
      </>
    ),
    Dating: (
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
    ),
  };
  return (
    <svg
      className="ui-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? <path d="M4 7h16M4 17h16M9 4v6m6 4v6" />}
    </svg>
  );
}
export function Avatar({
  name,
  url,
  large = false,
}: {
  name: string;
  url?: string | null;
  large?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const safe =
    url &&
    (/^https:\/\//i.test(url) || url.startsWith("blob:")) &&
    failed !== url;
  return safe ? (
    <img
      className={`portrait ${large ? "large-avatar" : ""}`}
      src={url}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailed(url)}
    />
  ) : (
    <span
      className={`initial-avatar ${large ? "large-avatar" : ""}`}
      aria-label={name}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
export function PersonPhoto({
  id,
  name,
  revision,
  fallback,
  large = false,
}: {
  id: string;
  name: string;
  revision?: number;
  fallback?: string | null;
  large?: boolean;
}) {
  const photo = useProfilePhoto({ owner: id, revision });
  return <Avatar name={name} url={photo.url ?? fallback} large={large} />;
}
export function Modal({
  title,
  children,
  close,
  className = '',
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [layerBack, setLayerBack] = useState<(() => void) | null>(null);
  const layerOpener = useRef<HTMLElement | null>(null);
  const activate = useCallback((back: () => void) => {
    layerOpener.current = document.activeElement as HTMLElement | null;
    setLayerBack(() => back);
    return () => setLayerBack(null);
  }, []);
  useLayoutEffect(() => {
    if (!layerBack && layerOpener.current) { layerOpener.current.focus(); layerOpener.current = null; }
  }, [layerBack]);
  const goBack = layerBack ?? close;
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current!,
      opener = document.activeElement as HTMLElement | null;
    element.showModal();
    return () => {
      element.close();
      opener?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`account-modal ${className} ${layerBack ? 'has-modal-layer' : ''}`}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])'))
          .filter(element => !element.matches(':disabled') && element.getClientRects().length > 0 && element.tabIndex >= 0);
        const first = focusable[0], last = focusable.at(-1);
        if (!first || !last) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        goBack();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) goBack();
      }}
    >
      <header className="row between" hidden={!!layerBack}>
        <h2 id={titleId}>{title}</h2>
        <button className="round" onClick={close} aria-label="Close">
          Ã—
        </button>
      </header>
      <ModalLayerContext.Provider value={{ host, activate }}>
        <div className="modal-content" hidden={!!layerBack}>{children}</div>
        <div ref={setHost} className="modal-layer-host" hidden={!layerBack}/>
      </ModalLayerContext.Provider>
    </dialog>
  );
}

export function ResourceState({
  loading,
  error,
  reload,
}: {
  loading: boolean;
  error: string;
  reload: () => void;
}) {
  return (
    <>
      {loading && <Loading />}
      <ErrorMessage>{error}</ErrorMessage>
      {error && (
        <ActionButton secondary onClick={reload}>
          Reload saved data
        </ActionButton>
      )}
    </>
  );
}
