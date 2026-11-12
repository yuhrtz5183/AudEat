import { Link } from 'react-router'
import { HomeShell } from '../home/Home.jsx'

// Stub: one ticket's details and the evidence form (AC 4.2, US 5).
export default function MyTicket() {
  return (
    <HomeShell title="Remediation ticket">
      <p className="lede">Ticket details are not available yet.</p>
      <Link className="text-button back-link" to="/my-store/tickets">Back to my tickets</Link>
    </HomeShell>
  )
}
