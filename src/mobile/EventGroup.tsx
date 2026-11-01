import { useCallback, useMemo } from 'react'
import type { EventGroupQueue } from '../../shared/matchmaking'
import { matchmakingClient } from '../features/matchmaking/client'
import { useCurrent } from '../ui/current'
import { useAction, useLoad } from '../ui/hooks'
import { ActionButton, ErrorMessage, PersonPhoto, ResourceState } from '../ui/common'

export function EventGroup({ id, available }: { id: string; available: boolean }) {
  const current = useCurrent(),
    client = useMemo(
      () => matchmakingClient(current.session.access_token),
      [current.session.access_token],
    ),
    action = useAction();
  const shouldPoll = useCallback(
    (value: EventGroupQueue) => available && !action.busy && value.state === "waiting",
    [available, action.busy],
  );
  const state = useLoad(
    useCallback((signal) => client.groupQueue(id, signal), [client, id]),
    { intervalMs: 3000, shouldPoll },
  );
  return (
    <section className="event-group-controls">
      <h3 className="event-group-heading" aria-live="polite">
        {available && state.value?.state === "waiting" && (
          <span className="group-search-spinner" aria-hidden="true" />
        )}
        {state.value?.state === "proposal"
          ? "Suggested group"
          : !available
            ? "Group matching closed"
            : state.value?.state === "waiting"
              ? "Waiting for a group"
              : "Find a group to go with"}
      </h3>
      <ResourceState loading={state.loading} error={state.error} reload={state.reload} />
      <ErrorMessage>{action.error}</ErrorMessage>
      {state.value?.state === "proposal" ? (
        <>
          <p>Here are the people in your suggested group for this event.</p>
          <div className="proposal-members">
            {state.value.proposal?.members.map((member) => (
              <div key={member.id}>
                <PersonPhoto id={member.id} name={member.name} fallback={member.avatar} />
                <span>{member.name}</span>
              </div>
            ))}
          </div>
          <p className="account-note">
            A suggested group doesn’t confirm attendance or create a group chat.
          </p>
        </>
      ) : (
        state.value && (
          <p>
            {!available
              ? "Group matching is closed for this event."
              : state.value.state === "waiting"
                ? "You’re in this event’s queue. Your group will appear here automatically when it’s ready."
                : "Join the queue to find other people interested in going."}
          </p>
        )
      )}
      <div className="row wrap">
        {state.value && state.value.state !== "idle" && (
          <ActionButton disabled={action.busy || state.loading} onClick={state.reload}>
            Refresh group status
          </ActionButton>
        )}
        {state.value && (state.value.state !== "idle" || available) && (
          <ActionButton
            secondary={state.value.state !== "idle"}
            disabled={action.busy || state.loading}
            onClick={() => {
              void action.run(async () => {
                try {
                  if (state.value!.state === "idle") await client.groupJoin(id);
                  else await client.groupLeave(id);
                } finally {
                  state.reload();
                }
              });
            }}
          >
            {state.value.state === "idle" ? "Join group queue" : "Leave group queue"}
          </ActionButton>
        )}
      </div>
    </section>
  );
}
