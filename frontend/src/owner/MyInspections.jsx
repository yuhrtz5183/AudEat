import { Link } from 'react-router'
import { HomeShell } from '../home/Home.jsx'

// Stub: the store's inspection history, newest first (US 9).
export default function MyInspections() {
  return (
    <HomeShell title="Inspection history">
      <p className="lede">Inspection history is not available yet.</p>
      <Link className="text-button back-link" to="/my-store">Back to my store</Link>
    </HomeShell>
  )
}
