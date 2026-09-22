import { useEffect, useRef, useState } from 'react'
import { Button, RecordCard } from '../design-system'
import { people, planIdeas, timeSlots, type PlanIdea, type TimeSlot } from '../features/meet-planning/demoPlans'
import '../features/meet-planning/meet-planning.css'

type Step = 'when' | 'what' | 'review' | 'done'
const steps = ['when', 'what', 'review'] as const
const stepLabels = { when: 'When', what: 'What', review: 'Review' }

function IdeaIcon({ kind }: { kind: PlanIdea['icon'] }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {kind === 'coffee' && <><path d="M6 12h16v10l-3 4H9l-3-4zm16 2h4v6h-4M5 29h20M11 4v4m6-4v4" /></>}
      {kind === 'walk' && <><path d="m10 4-6 8h3l-5 7h7v9m1-24 6 8h-3l5 7H9m14-4c-9 3 12 9-1 14" /></>}
      {kind === 'games' && <><path d="M12 5h14v21H12zM8 9H5v20h15m-1-17 4 4-4 4-4-4z" /></>}
    </svg>
  )
}

function PlanSummary({ slot, idea }: { slot: TimeSlot; idea: PlanIdea }) {
  return (
    <RecordCard className="meet-summary">
      <h3>{idea.title}</h3>
      <dl>
        <div><dt>When</dt><dd><strong>{slot.date}</strong><br /><strong>{slot.meetingTime}</strong> <span className="meet-support">· Eastern time</span></dd></div>
        <div><dt>Where</dt><dd><strong>{idea.place}</strong><span className="meet-detail">{idea.meetingPoint}</span></dd></div>
        <div><dt>Who</dt><dd><strong>You, Jamie and Aaron</strong><span className="meet-detail">3 people · demo group</span></dd></div>
        <div><dt>Details</dt><dd>45 minutes · {idea.cost}</dd></div>
      </dl>
    </RecordCard>
  )
}

function MeetPlanning() {
  const [step, setStep] = useState<Step>('when')
  const [slotId, setSlotId] = useState<string | null>(null)
  const [ideaId, setIdeaId] = useState<string | null>(null)
  const stepHeading = useRef<HTMLHeadingElement>(null)
  const slot = timeSlots.find((item) => item.id === slotId)
  const idea = planIdeas.find((item) => item.id === ideaId)

  useEffect(() => {
    stepHeading.current?.focus()
  }, [step])

  return (
    <div className="meet-planning">
      <header className="meet-header">
        <h1>Make a plan</h1>
        <p className="meet-support">Demo people & availability · nothing sent or saved.</p>
      </header>

      {step !== 'done' && <>
        <section aria-label="People making this plan" className="meet-people">
          {people.map((person) => (
            <div className="meet-person" key={person.name}>
              <span aria-hidden="true" className="meet-avatar">{person.initial}</span>
              <strong>{person.name}</strong>
            </div>
          ))}
        </section>
        <ol aria-label="Planning progress" className="meet-progress">
          {steps.map((item, index) => (
            <li aria-current={step === item ? 'step' : undefined} key={item}>
              <span aria-hidden="true">{steps.indexOf(step) > index ? '✓' : index + 1}</span>
              {stepLabels[item]}
            </li>
          ))}
        </ol>
      </>}

      {step === 'when' && <section aria-labelledby="meet-step-title">
        <h2 id="meet-step-title" ref={stepHeading} tabIndex={-1}>Choose a shared time</h2>
        <p className="meet-intro">2 times work for everyone · Eastern time</p>
        <fieldset className="meet-choices">
          <legend className="meet-sr-only">Choose a time</legend>
          {timeSlots.map((item) => (
            <label className={`meet-time-choice ${!item.available ? 'meet-unavailable' : ''}`} key={item.id}>
              <div className="meet-choice-top">
                <input type="radio" name="meeting-time" value={item.id} checked={slotId === item.id} disabled={!item.available} onChange={() => setSlotId(item.id)} aria-label={`${item.day}, ${item.time}${!item.available ? ', Jamie is in class' : ''}`} />
                <div><strong>{item.day}</strong><strong className="meet-detail">{item.time}</strong></div>
                <span className="meet-availability-label">{item.available ? 'All 3 free' : 'Time conflict'}</span>
              </div>
              <div className="meet-availability">
                {people.map((person, index) => (
                  <span key={person.name}><strong>{person.name}</strong><span>{item.availability[index] === 'Free' ? '✓ Free' : item.availability[index]}</span></span>
                ))}
              </div>
            </label>
          ))}
        </fieldset>
        <p className="meet-support meet-time-note">Example availability · Sep 29–Oct 1, 2026</p>
        <div className="meet-action-bar">
          <p className="meet-selection" role="status">{slot ? `${slot.day} · ${slot.time}` : 'Select a time to continue.'}</p>
          <div className="meet-actions">
            <Button className="meet-next" variant="secondary" disabled={!slot?.available} onClick={() => { if (slot?.available) setStep('what') }}>Choose an activity</Button>
          </div>
        </div>
      </section>}

      {step === 'what' && slot && <section aria-labelledby="meet-step-title">
        <h2 id="meet-step-title" ref={stepHeading} tabIndex={-1}>Choose an activity</h2>
        <p className="meet-intro"><strong>{slot.day} · {slot.meetingTime}</strong><span className="meet-detail meet-support">45 minutes · Eastern time</span></p>
        <fieldset className="meet-choices">
          <legend className="meet-sr-only">Choose an activity</legend>
          {planIdeas.map((item) => (
            <label className="meet-idea-choice" key={item.id}>
              <input type="radio" name="meeting-activity" value={item.id} checked={ideaId === item.id} onChange={() => setIdeaId(item.id)} aria-label={item.title} />
              <span className="meet-idea-content">
                <span className="meet-idea-title"><strong>{item.title}</strong><span className="meet-idea-icon"><IdeaIcon kind={item.icon} /></span></span>
                <span className="meet-place">{item.place}</span>
                <span className="meet-support">{item.cost}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="meet-support meet-time-note">Example places and ideas · not registered events</p>
        <div className="meet-action-bar">
          <p className="meet-selection" role="status">{idea ? `Selected: ${idea.title}` : 'Select an activity to continue.'}</p>
          <div className="meet-actions">
            <Button variant="secondary" onClick={() => setStep('when')}>Back</Button>
            <Button className="meet-next" variant="secondary" disabled={!idea} onClick={() => { if (idea) setStep('review') }}>Review plan</Button>
          </div>
        </div>
      </section>}

      {step === 'review' && slot && idea && <section aria-labelledby="meet-step-title">
        <h2 id="meet-step-title" ref={stepHeading} tabIndex={-1}>Review your plan</h2>
        <PlanSummary slot={slot} idea={idea} />
        <div className="meet-edit-actions">
          <Button variant="secondary" onClick={() => setStep('when')}>Change time</Button>
          <Button variant="secondary" onClick={() => setStep('what')}>Change activity</Button>
        </div>
        <p className="meet-support">Demo assumes group agreement. No invites or reservations.</p>
        <div className="meet-action-bar">
          <div className="meet-actions">
            <Button onClick={() => setStep('done')}>Make plan</Button>
          </div>
        </div>
      </section>}

      {step === 'done' && slot && idea && <section aria-labelledby="meet-step-title" className="meet-done">
        <div className="meet-done-heading"><span aria-hidden="true" className="meet-check">✓</span><h2 id="meet-step-title" ref={stepHeading} tabIndex={-1}>Your plan is ready</h2></div>
        <PlanSummary slot={slot} idea={idea} />
        <p className="meet-confirmation-note">Demo confirmation · clears on refresh or when you leave.</p>
        <div className="meet-action-bar">
          <div className="meet-actions">
            <Button className="meet-next" variant="secondary" onClick={() => setStep('review')}>Edit plan</Button>
          </div>
        </div>
      </section>}
    </div>
  )
}

export default MeetPlanning
