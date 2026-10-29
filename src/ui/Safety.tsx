import { useCallback, useRef, useState } from "react";
import {
  SafetyReportReasonSchema,
  type SubmitSafetyReport,
} from "../../shared/safety";
import { safetyClient } from "../features/account/safety-client";
import { useAction, useLoad } from "./hooks";
import { ActionButton, ErrorMessage, Modal, ResourceState } from "./common";

export function SafetyActions({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="text-link" onClick={() => setOpen(true)}>
        Block or report
      </button>
      {open && (
        <Modal title={`Safety · ${name}`} close={() => setOpen(false)}>
          <SafetyForm id={id} />
        </Modal>
      )}
    </>
  );
}
function SafetyForm({ id }: { id: string }) {
  const state = useLoad(
      useCallback((signal) => safetyClient.state(id, signal), [id]),
    ),
    action = useAction();
  const [reason, setReason] =
      useState<SubmitSafetyReport["reason"]>("Harassment"),
    [context, setContext] = useState(""),
    [reported, setReported] = useState(false),
    [confirm, setConfirm] = useState(false);
  const pendingReport = useRef<{
    value: SubmitSafetyReport;
    uncertain: boolean;
  } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  return (
    <>
      <ResourceState
        loading={state.loading}
        error={state.error}
        reload={state.reload}
      />
      <ErrorMessage>{action.error}</ErrorMessage>
      <p className="account-note">
        Blocking prevents new contact actions. Existing shared groups and
        history may remain visible.
      </p>
      {state.value && (
        <ActionButton
          secondary
          disabled={action.busy}
          onClick={() => setConfirm(true)}
        >
          {state.value.outgoingBlocked ? "Unblock account" : "Block account"}
        </ActionButton>
      )}
      {confirm && (
        <div className="notice">
          <p>
            {state.value?.outgoingBlocked
              ? "Allow future contact actions again?"
              : "Prevent new contact actions from this account?"}
          </p>
          <ActionButton
            disabled={action.busy}
            onClick={() => {
              void action.run(async () => {
                try {
                  await safetyClient.block(id, !state.value!.outgoingBlocked);
                } finally {
                  setConfirm(false);
                  state.reload();
                  window.dispatchEvent(new Event("pebble:matching-changed"));
                }
              });
            }}
          >
            Confirm
          </ActionButton>
          <ActionButton
            secondary
            disabled={action.busy}
            onClick={() => setConfirm(false)}
          >
            Cancel
          </ActionButton>
        </div>
      )}
      <h3 className="section">Report a concern</h3>
      {reported ? (
        <p role="status">
          Your report was received. This does not guarantee a moderation action.
        </p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              if (uncertain) return;
              const value: SubmitSafetyReport = {
                requestId: crypto.randomUUID(),
                targetId: id,
                reason,
                context,
              };
              pendingReport.current = { value, uncertain: true };
              setUncertain(true);
              const receipt = await safetyClient.report(value);
              if (
                receipt.requestId !== value.requestId ||
                receipt.targetId !== id
              )
                throw new Error("Report receipt could not be confirmed.");
              setUncertain(false);
              setReported(true);
            });
          }}
        >
          <fieldset disabled={action.busy || uncertain}>
            <label>
              Reason
              <select
                value={reason}
                onChange={(event) =>
                  setReason(event.target.value as SubmitSafetyReport["reason"])
                }
              >
                {SafetyReportReasonSchema.options.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
            <label>
              Details (optional)
              <textarea
                maxLength={1000}
                value={context}
                onChange={(event) => setContext(event.target.value)}
              />
            </label>
            <button className="btn">Send report</button>
          </fieldset>
        </form>
      )}
      {uncertain && (
        <ActionButton
          secondary
          disabled={action.busy}
          onClick={() => {
            void action.run(async () => {
              if (!pendingReport.current) return;
              const receipt = await safetyClient.receipt(
                pendingReport.current.value.requestId,
              );
              if (
                receipt.targetId !== id ||
                receipt.requestId !== pendingReport.current.value.requestId
              )
                throw new Error("Report receipt could not be confirmed.");
              setReported(true);
              setUncertain(false);
            });
          }}
        >
          Check report receipt
        </ActionButton>
      )}
    </>
  );
}
export function Blocklist() {
  const state = useLoad(useCallback((signal) => safetyClient.list(signal), [])),
    action = useAction(),
    [confirm, setConfirm] = useState<string | null>(null);
  return (
    <section className="account-panel">
      <h3>Blocked accounts</h3>
      <ResourceState
        loading={state.loading}
        error={state.error}
        reload={state.reload}
      />
      <ErrorMessage>{action.error}</ErrorMessage>
      {state.value && !state.value.blocks.length && <p>No blocked accounts.</p>}
      {state.value?.blocks.map((block) => (
        <div key={block.targetId} className="row between item">
          <span>Account {block.targetId.slice(0, 8)}</span>
          <ActionButton
            secondary
            disabled={action.busy}
            onClick={() => setConfirm(block.targetId)}
          >
            Unblock
          </ActionButton>
        </div>
      ))}
      {confirm && (
        <Modal
          title="Unblock this account?"
          close={() => {
            if (!action.busy) setConfirm(null);
          }}
        >
          <p>
            They can make new contact requests. Previous connections won’t be
            restored.
          </p>
          <ActionButton
            disabled={action.busy}
            onClick={() => {
              void action.run(async () => {
                try {
                  await safetyClient.block(confirm, false);
                } finally {
                  setConfirm(null);
                  state.reload();
                }
              });
            }}
          >
            Unblock
          </ActionButton>
        </Modal>
      )}
    </section>
  );
}
