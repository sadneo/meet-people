import { confirmationReward, earnedReward, proofReward, type Activity, type DemoAttendance } from './demo'
import { Icon } from './Icon'

type Props = {
  activity: Activity
  attendance: DemoAttendance
  onProof: () => void
  onConfirm: () => void
  onConfirmAll: () => void
  onCollect: () => void
}

export function ActivityRewards({ activity, attendance, onProof, onConfirm, onConfirmAll, onCollect }: Props) {
  const remaining = activity.people - 1 - attendance.confirmations
  const earned = earnedReward(attendance)
  const available = earned - attendance.collected

  return <>
    <p className="pebble-eyebrow">A SHARED MOMENT</p>
    <h2 id="pebble-dialog-title">{activity.title}</h2>
    <p className="pebble-verification-label">Demo attendance · nothing uploaded or verified</p>
    <div className="pebble-proof-step">
      <span className="pebble-proof-icon"><Icon name={attendance.proof ? 'check' : 'pebble'} size={24} /></span>
      <div><strong>{attendance.proof ? 'Demo proof submitted' : 'A little proof you were there'}</strong><p>{attendance.proof ? 'Sample attendance proof · no file attached' : 'Imagine adding a photo or attendance proof.'}</p></div>
      <button className="pebble-activity-button" disabled={attendance.proof} onClick={onProof}>{attendance.proof ? 'Added' : 'Add demo proof'}</button>
    </div>
    <section className="pebble-confirmations" aria-label="Mock attendee confirmations">
      <div className="pebble-confirmation-title"><strong>Seen by your people</strong><span>{attendance.confirmations} / {activity.people - 1} confirmed</span></div>
      <div className="pebble-confirmation-people" aria-hidden="true">{Array.from({ length: activity.people - 1 }, (_, index) => <span className={index < attendance.confirmations ? 'confirmed' : ''} key={index}>{index < attendance.confirmations ? <Icon name="check" size={13} /> : <Icon name="people" size={13} />}</span>)}</div>
      <p>{!attendance.proof ? 'Add demo proof first, then simulate your friends checking in.' : remaining ? 'Each simulated attendee confirmation adds 10 Pebbles.' : 'Everyone in this demo group has confirmed.'}</p>
      <button className="pebble-confirm-button" disabled={!attendance.proof || !remaining} onClick={onConfirm}><Icon name="people" size={16} />Simulate 1 confirmation<span>+10</span></button>
      <button className="pebble-text-button" disabled={!attendance.proof || !remaining} onClick={onConfirmAll}>Simulate remaining confirmations</button>
    </section>
    <div className="pebble-reward-receipt" aria-label="Demo reward breakdown">
      <div><span>Demo proof</span><strong>+{attendance.proof ? proofReward : 0}</strong></div>
      <div><span>{attendance.confirmations} attendee confirmations × {confirmationReward}</span><strong>+{attendance.confirmations * confirmationReward}</strong></div>
      <div><span>Already collected</span><span>{attendance.collected}</span></div>
      <div className="pebble-receipt-total" role="status" aria-live="polite"><strong>Ready to collect</strong><strong key={available} className="pebble-receipt-number">{available}<Icon name="pebble" size={17} /></strong></div>
    </div>
    <button className="pebble-primary coral" disabled={available <= 0} onClick={onCollect}>{available > 0 ? `Bring ${available} Pebbles home` : attendance.collected === activity.reward ? 'All rewards collected' : 'No Pebbles ready yet'}<Icon name={available > 0 ? 'arrow' : 'pebble'} /></button>
    <p className="pebble-reward-footnote">{attendance.collected === activity.reward ? 'A shared moment, a little world grown.' : 'Collect now. Come back for more confirmations later.'}</p>
  </>
}
