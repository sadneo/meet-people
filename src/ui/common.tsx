import { useEffect, useRef, useState, type ReactNode } from "react";
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
  return <p role="status">Loading…</p>;
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
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
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
      className="account-modal"
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) close();
      }}
    >
      <header className="row between">
        <h2 id="dialog-title">{title}</h2>
        <button className="round" onClick={close} aria-label="Close">
          ×
        </button>
      </header>
      {children}
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
