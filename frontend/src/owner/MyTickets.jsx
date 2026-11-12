import { Link } from 'react-router'
import { HomeShell } from '../home/Home.jsx'

// Stub: the store's tickets, nearest deadline first (US 4, 10).
export default function MyTickets() {
  return (
    <HomeShell title="Remediation tickets">
      <p className="lede">Remediation tickets are not available yet.</p>
      <Link className="text-button back-link" to="/my-store">Back to my store</Link>
    </HomeShell>
  )
}
