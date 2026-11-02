import { Link } from 'react-router'
import { HomeShell } from '../home/Home.jsx'

// Stub: the draft form, follow-up form and read-only detail (US 1, 2, AC 7.3, 8.2).
export default function InspectionPage() {
  return (
    <HomeShell title="Inspection">
      <p className="lede">Inspections are not available yet.</p>
      <Link className="text-button back-link" to="/stores">Back to stores</Link>
    </HomeShell>
  )
}
