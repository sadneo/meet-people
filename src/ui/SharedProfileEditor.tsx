import { useRef, useState } from 'react'
import { SaveAccountSchema } from '../../shared/account'
import { interestSelectionProblem } from '../../shared/interests'
import { ActionButton, ErrorMessage, Modal } from './common'
import { useCurrent } from './current'
import { useAction } from './hooks'
import { Availability, Interests } from './Profile'
import { MatchingSchedule } from './MatchingSchedule'

// Edit canonical profile fields without leaving the matching task that opened them.
export function SharedProfileEditor({ field, close }: { field: 'interests' | 'availability'; close: () => void }) {
  const current = useCurrent()
  const action = useAction()
  const initial = current.account!.profile!
  const [interests, setInterests] = useState(initial.interests)
  const [availability, setAvailability] = useState(initial.availability)
  const [scheduleBusy, setScheduleBusy] = useState(false)
  const locked = useRef(false)
  const busy = action.busy || current.busy || scheduleBusy
  return <Modal title={field === 'interests' ? 'Your interests' : 'Your availability'} close={() => { if (!busy && !locked.current) close() }}>
    <form className="account-form" onSubmit={event => {
      event.preventDefault()
      if (busy || locked.current || !current.available) return
      locked.current = true
      void action.run(async () => {
        const profile = { ...current.account!.profile!, ...(field === 'interests' ? { interests } : { availability }) }
        if (field === 'interests') {
          const error = interestSelectionProblem(interests)
          if (error) throw new Error(error)
        }
        const parsed = SaveAccountSchema.safeParse({ ...current.account!, profile })
        if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Check your choices before saving.')
        if (await current.save(parsed.data)) {
          window.dispatchEvent(new Event('pebble:matching-changed'))
          close()
        }
      }).finally(() => { locked.current = false })
    }}>
      <fieldset disabled={busy || !current.available}>
        {field === 'interests' ? <Interests value={interests} change={setInterests}/>
          : <Availability value={availability} change={setAvailability}/>}
      </fieldset>
      {field === 'availability' && <>
        <p className="account-note">Timezone and sharing changes save immediately. Save changes applies your weekly time windows.</p>
        <MatchingSchedule compact token={current.session.access_token} disabled={action.busy || current.busy}
          onBusyChange={setScheduleBusy} onSaved={() => window.dispatchEvent(new Event('pebble:matching-changed'))}/>
      </>}
      <ErrorMessage>{action.error || current.error}</ErrorMessage>
      {current.error && <ActionButton secondary disabled={busy} onClick={current.reload}>Reload profile</ActionButton>}
      <div className="row">
        <ActionButton secondary disabled={busy} onClick={close}>Cancel</ActionButton>
        <button className="btn" disabled={busy || !current.available}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </form>
  </Modal>
}
