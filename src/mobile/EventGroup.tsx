import { useCallback, useMemo, useState } from 'react'
import type { EventGroupQueue } from '../../shared/matchmaking'
import { matchmakingClient } from '../features/matchmaking/client'
import { useCurrent } from '../ui/current'
import { useAction, useLoad } from '../ui/hooks'
import { ActionButton, ErrorMessage, PersonPhoto, ResourceState } from '../ui/common'
import { MatchingSetup } from '../ui/MatchingSetup'
import { useMatchingSetupStatus } from '../ui/useMatchingSetupStatus'
import { Link } from 'react-router'

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
  const canJoin = available && state.value?.state === 'idle'
  const readiness = useMatchingSetupStatus(canJoin)
  const [setupOpen, setSetupOpen] = useState(false)
  const setupReady = readiness.value?.profileReady && readiness.value.friendsAreaReady
  const discoveryOff = current.account?.settings.discoverable === false
  function closeSetup() {
    setSetupOpen(false)
    readiness.reload()
  }
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
              ? "This event has started or ended, so new groups can’t form."
              : state.value.state === "waiting"
                ? "You’re in this event’s queue. Your group will appear here automatically when it’s ready."
                : discoveryOff ? "Turn on discovery to find a group."
                : setupReady ? "Join the queue to find other people interested in going."
                : "Finish setup to match with people who plan to go."}
          </p>
        )
      )}
      {canJoin && !discoveryOff && <ResourceState loading={readiness.loading} error={readiness.error} reload={readiness.reload}/>}
      <div className="event-group-actions">
      {canJoin && discoveryOff && <Link className="btn light" to="/profile?section=discovery">Discovery settings</Link>}
      {canJoin && readiness.value && !setupReady && !discoveryOff && <ActionButton onClick={() => setSetupOpen(true)}>Set up event matching</ActionButton>}
      {setupOpen && <MatchingSetup mode="event" close={closeSetup} done={closeSetup}/>}
      <div className="row wrap">
        {state.value && state.value.state !== "idle" && (
          <ActionButton disabled={action.busy || state.loading} onClick={state.reload}>
            Refresh group status
          </ActionButton>
        )}
        {state.value && (state.value.state !== "idle" || (available && setupReady && !discoveryOff)) && (
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
                  readiness.reload();
                }
              });
            }}
          >
            {state.value.state === "idle" ? "Join group queue" : "Leave group queue"}
          </ActionButton>
        )}
      </div>
      </div>
    </section>
  );
}
