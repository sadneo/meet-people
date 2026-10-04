import { useEffect, useReducer, useRef, useState } from 'react'
import { activities, demoReducer, emptyAttendance, initialState, stages, type RoofColor } from '../features/community/demo'
import { ActivityRewards } from '../features/community/ActivityRewards'
import { PouchIntro } from '../features/community/PouchIntro'
import { RewardFeedback } from '../features/community/RewardFeedback'
import { Icon } from '../features/community/Icon'
import { World } from '../features/community/World'
import '../features/community/community.css'
import '../features/community/motion.css'

function CommunityExperience() {
  const [state, dispatch] = useReducer(demoReducer, initialState)
  const [view, setView] = useState<'community' | 'activities'>('community')
  const [selected, setSelected] = useState<string | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const activity = activities.find((item) => item.id === selected)
  const current = stages[state.stage]
  const next = stages[state.stage + 1]
  const canGrow = next && state.balance >= next.cost

  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])

  useEffect(() => {
    if (!state.feedback) return
    const timer = window.setTimeout(() => dispatch({ type: 'clear-feedback' }), 2300)
    return () => window.clearTimeout(timer)
  }, [state.feedback])

  useEffect(() => {
    if (selected || resetOpen) dialog.current?.showModal()
    else dialog.current?.close()
  }, [selected, resetOpen])

  function navigate(destination: typeof view) {
    setView(destination)
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true })
      window.scrollTo({ top: 0, behavior: 'instant' })
    })
  }

  function growWorld() {
    dispatch({ type: 'grow' })
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }

  function closeDialog() { setSelected(null); setResetOpen(false) }

  return <div className="pebble-app">
    <header className="pebble-header">
      <button className="pebble-brand" onClick={() => navigate('community')} aria-label="Pebble community home">pebble<span><Icon name="leaf" size={23} /></span><span className="pebble-brand-dot">.</span></button>
      <nav className="pebble-nav" aria-label="Prototype navigation">
        <button className={view === 'community' ? 'active' : ''} aria-current={view === 'community' ? 'page' : undefined} onClick={() => navigate('community')}><Icon name="leaf" />Community</button>
        <button className={view === 'activities' ? 'active' : ''} aria-current={view === 'activities' ? 'page' : undefined} onClick={() => navigate('activities')}><Icon name="people" />Activities</button>
      </nav>
      <div className="pebble-balance" aria-label={`${state.balance} Pebbles available`}><span className="pebble-coin"><Icon name="pebble" size={23} /></span><strong key={state.balance} className={state.feedback ? 'pebble-balance-pop' : ''}>{state.balance}</strong><span>Pebbles</span>{state.feedback && <RewardFeedback key={state.feedback.serial} feedback={state.feedback} />}</div>
    </header>

    <main className="pebble-main">
      <div className="pebble-intro">
        <div><p className="pebble-eyebrow"><span /> LITTLE CONNECTIONS. BIG POSSIBILITIES.</p><h1 ref={heading} tabIndex={-1}>{view === 'community' ? 'Good things grow together.' : 'A little time. A little togetherness.'}</h1><p className="pebble-subtitle">{view === 'community' ? 'Meet your people. Make memories. Build a little world of your own.' : 'Find a small adventure. Every shared moment helps your world grow.'}</p></div>
        <span className="pebble-demo-tag">M2 · Interactive prototype</span>
      </div>

      {view === 'community' ? <>
        <section className="pebble-world-frame" aria-label="Your community world">
          <World stage={state.stage} roof={state.roof} flowers={state.flowers} />
          {state.feedback?.kind === 'spend' && <RewardFeedback key={state.feedback.serial} feedback={state.feedback} world />}
          <div className="pebble-world-label"><span className="pebble-world-icon"><Icon name="leaf" /></span><div><strong>Pebble Grove</strong><span>A little place of your own</span></div></div>
          <div className="pebble-weather"><Icon name="sun" size={18} /><span>Always a little sunny</span></div>
          <div className="pebble-stage-caption" key={state.stage}><span>STAGE {state.stage + 1} OF {stages.length}</span><strong>{current.name}</strong></div>
        </section>

        <section className="pebble-growth" aria-label="Community progression">
          <div className="pebble-journey"><p className="pebble-eyebrow">SMALL STEPS, SOMETHING SPECIAL</p><h2>Your little world, growing.</h2><ol className="pebble-stages">{stages.map((stage, index) => <li key={stage.short} className={index <= state.stage ? 'reached' : ''} aria-current={index === state.stage ? 'step' : undefined}><span className="pebble-step-number">{index < state.stage ? <Icon name="check" size={15} /> : `0${index + 1}`}</span><span>{stage.short}</span></li>)}</ol></div>
          <div className="pebble-next">
            <div className="pebble-next-title"><span>{next ? 'NEXT LITTLE CHAPTER' : 'LOOK WHAT YOU GREW'}</span><Icon name={next ? 'spark' : 'leaf'} size={18} /></div>
            <h3>{next ? next.short : 'A place for everyone'}</h3>
            {next ? <><div className="pebble-progress-label"><span>{canGrow ? 'Ready when you are' : `${next.cost - state.balance} more Pebbles to grow`}</span><strong>{state.balance} / {next.cost}<Icon name="pebble" size={15} /></strong></div><div className="pebble-progress" role="progressbar" aria-label={`Pebbles toward ${next.short}`} aria-valuenow={Math.min(state.balance, next.cost)} aria-valuemin={0} aria-valuemax={next.cost}><span style={{ width: `${Math.min(100, state.balance / next.cost * 100)}%` }} /></div><button className={`pebble-primary ${canGrow ? 'coral' : ''}`} onClick={() => canGrow ? growWorld() : navigate('activities')}>{canGrow ? `Grow your world · ${next.cost}` : 'Find an activity'}<Icon name={canGrow ? 'pebble' : 'arrow'} /></button></> : <><p className="pebble-finish-copy">From one little pebble to a place to belong.<br />This is just the beginning.</p><button className="pebble-primary" onClick={() => setResetOpen(true)}>Start a fresh story<Icon name="reset" size={17} /></button></>}
          </div>
        </section>

        <section className={`pebble-customize ${state.stage < 2 ? 'locked' : ''}`} aria-label="Cottage customization">
          <div className="pebble-customize-intro"><span className="pebble-customize-icon"><Icon name={state.stage < 2 ? 'lock' : 'spark'} /></span><div><h3>Make it feel like you</h3><p>{state.stage < 2 ? 'Cottage colors & little details unlock at Stage 3.' : 'A fresh color. A few flowers. Your kind of cozy.'}</p></div></div>
          <fieldset disabled={state.stage < 2}><legend className="pebble-sr-only">Cottage roof color</legend>{(['terracotta', 'sage', 'blue'] as RoofColor[]).map((color) => <button key={color} className={`pebble-swatch ${color}`} aria-label={`${color === 'blue' ? 'Dusty blue' : color === 'sage' ? 'Sage' : 'Terracotta'} roof`} aria-pressed={state.roof === color} onClick={() => dispatch({ type: 'roof', color })}>{state.roof === color && <Icon name="check" size={16} />}</button>)}</fieldset>
          <button className="pebble-flower-toggle" disabled={state.stage < 2} aria-pressed={state.flowers} onClick={() => dispatch({ type: 'flowers' })}><span aria-hidden="true">✿</span> Wildflowers <span className={`pebble-switch ${state.flowers ? 'on' : ''}`} /></button>
        </section>
      </> : <section className="pebble-activities" aria-label="Mock activities">
        <div className="pebble-activity-note"><Icon name="sun" /><span>A few ways to spend a lovely day</span><small>3 demo activities · no sign-up needed</small></div>
        <div className="pebble-activity-grid">{activities.map((item) => {
          const attendance = state.attendance[item.id] ?? emptyAttendance
          const completed = attendance.collected === item.reward
          return <article key={item.id} className={`pebble-activity-card ${completed ? 'completed' : ''}`}>
            <div className={`pebble-activity-art ${item.art}`} aria-hidden="true"><div className="pebble-art-sun" /><div className="pebble-art-cloud" />{item.art === 'walk' ? <><div className="pebble-art-hill one" /><div className="pebble-art-hill two" /><div className="pebble-art-path" /><span className="pebble-art-tree a">♠</span><span className="pebble-art-tree b">♠</span></> : item.art === 'coffee' ? <><div className="pebble-art-table" /><div className="pebble-art-mug one" /><div className="pebble-art-mug two" /><span className="pebble-art-steam">∿ ∿</span></> : <><div className="pebble-art-planter one"><span>✿</span></div><div className="pebble-art-planter two"><span>✿</span></div><div className="pebble-art-planter three"><span>✿</span></div></>}<span className="pebble-reward"><Icon name={completed ? 'check' : 'pebble'} size={16} />{completed ? 'Pebbles collected' : `Up to ${item.reward} Pebbles`}</span></div>
            <div className="pebble-activity-body"><p className="pebble-eyebrow">{item.category}</p><h2>{item.title}</h2><p>{item.detail}</p><div className="pebble-activity-meta"><span><Icon name="pin" size={15} />{item.location}</span><span><Icon name="clock" size={15} />{item.time}</span></div><div className="pebble-activity-bottom"><span className="pebble-attendees"><span className="pebble-avatar">J</span><span className="pebble-avatar">A</span><span>+{item.people - 2} going</span></span><button className="pebble-activity-button" onClick={() => setSelected(item.id)}>{completed ? 'View rewards' : attendance.proof ? 'Continue' : 'Join in'}<Icon name={completed ? 'check' : 'arrow'} size={17} /></button></div></div>
          </article>
        })}</div>
        <div className="pebble-activity-footer"><Icon name="leaf" /><p>Good moments out there. A growing world right here.</p><button className="pebble-text-button" onClick={() => navigate('community')}>Visit your community<Icon name="arrow" size={17} /></button></div>
      </section>}

      <div className="pebble-status" role="status" aria-live="polite">{state.message && <><Icon name="spark" size={16} /><span>{state.message}</span></>}</div>
      <footer className="pebble-footer"><span><span className="pebble-demo-dot" /> A little preview of what’s possible. All activities & Pebbles are simulated.</span><button className="pebble-text-button" onClick={() => setResetOpen(true)}><Icon name="reset" size={14} />Reset demo</button></footer>
    </main>

    <dialog ref={dialog} className="pebble-dialog" aria-labelledby="pebble-dialog-title" onCancel={closeDialog} onClick={(event) => { if (event.target === event.currentTarget) closeDialog() }}>
      <div className="pebble-dialog-content"><button className="pebble-dialog-close" aria-label="Close dialog" onClick={closeDialog}><Icon name="close" /></button>
        {resetOpen ? <><span className="pebble-dialog-icon"><Icon name="leaf" size={32} /></span><p className="pebble-eyebrow">A FRESH LITTLE START</p><h2 id="pebble-dialog-title">Back to your first pebble?</h2><p>This resets your demo balance, activities, and world. You can grow it all over again.</p><button className="pebble-primary" onClick={() => { dispatch({ type: 'reset' }); closeDialog(); navigate('community') }}>Reset & start fresh<Icon name="reset" size={17} /></button><button className="pebble-text-button" onClick={closeDialog}>Keep my little world</button></> : activity && <ActivityRewards
          activity={activity}
          attendance={state.attendance[activity.id] ?? emptyAttendance}
          onProof={() => dispatch({ type: 'proof', id: activity.id })}
          onConfirm={() => dispatch({ type: 'confirm', id: activity.id })}
          onConfirmAll={() => dispatch({ type: 'confirm-all', id: activity.id })}
          onCollect={() => { dispatch({ type: 'collect', id: activity.id }); closeDialog(); navigate('community') }}
        />}
      </div>
    </dialog>
  </div>
}

function Community() {
  const [entered, setEntered] = useState(false)
  return entered ? <CommunityExperience /> : <div className="pebble-app"><PouchIntro onFinish={() => setEntered(true)} /></div>
}

export default Community
