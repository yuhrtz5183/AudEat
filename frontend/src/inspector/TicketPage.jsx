import { Link } from 'react-router'
import { HomeShell } from '../home/Home.jsx'

// Stub: a ticket's evidence, the review decision and the follow-up date (US 6, 7).
export default function TicketPage() {
  return (
    <HomeShell title="Remediation ticket">
      <p className="lede">Ticket review is not available yet.</p>
      <Link className="text-button back-link" to="/tickets">Back to remediation tickets</Link>
    </HomeShell>
  )
}
