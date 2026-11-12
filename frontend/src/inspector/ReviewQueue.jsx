import { Link } from 'react-router'
import { HomeShell } from '../home/Home.jsx'

// Stub: tickets awaiting review (US 6) and follow-ups to complete (AC 7.3).
export default function ReviewQueue() {
  return (
    <HomeShell title="Remediation tickets">
      <section aria-labelledby="awaiting-review">
        <h2 id="awaiting-review">Awaiting review</h2>
        <p className="lede">The review queue is not available yet.</p>
      </section>
      <section aria-labelledby="follow-ups-scheduled">
        <h2 id="follow-ups-scheduled">Follow-ups scheduled</h2>
        <p className="lede">Scheduled follow-ups are not available yet.</p>
      </section>
      <Link className="text-button back-link" to="/stores">Back to stores</Link>
    </HomeShell>
  )
}
