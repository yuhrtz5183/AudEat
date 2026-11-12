import { Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthContext.jsx'
import AuthPage from './auth/AuthPage.jsx'
import { Fallback, GuestOnly, RequireRole } from './auth/guards.jsx'
import { InspectionWithoutStore, InspectorHome, StoreDetails } from './home/Home.jsx'
import InspectionHistory from './inspector/InspectionHistory.jsx'
import InspectionPage from './inspector/InspectionPage.jsx'
import ReviewQueue from './inspector/ReviewQueue.jsx'
import StartInspection from './inspector/StartInspection.jsx'
import TicketPage from './inspector/TicketPage.jsx'
import MyInspections from './owner/MyInspections.jsx'
import MyTicket from './owner/MyTicket.jsx'
import MyTickets from './owner/MyTickets.jsx'
import OwnerHome from './owner/OwnerHome.jsx'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<GuestOnly />}>
          {/* AuthPage renders both modes itself, so the leaves have no element. */}
          <Route element={<AuthPage />}>
            <Route path="/login" element={null} />
            <Route path="/register" element={null} />
          </Route>
        </Route>
        <Route element={<RequireRole role="inspector" />}>
          <Route path="/stores" element={<InspectorHome />} />
          <Route path="/stores/:storeId" element={<StoreDetails />} />
          <Route path="/stores/:storeId/inspections/new" element={<StartInspection />} />
          <Route path="/stores/:storeId/inspections" element={<InspectionHistory />} />
          {/* Keep next to :inspectionId so "new" is never fetched as an inspection id (AC 14.4). */}
          <Route path="/inspections/new" element={<InspectionWithoutStore />} />
          <Route path="/inspections/:inspectionId" element={<InspectionPage />} />
          <Route path="/tickets" element={<ReviewQueue />} />
          <Route path="/tickets/:ticketId" element={<TicketPage />} />
        </Route>
        <Route element={<RequireRole role="owner" />}>
          <Route path="/my-store" element={<OwnerHome />} />
          <Route path="/my-store/tickets" element={<MyTickets />} />
          <Route path="/my-store/tickets/:ticketId" element={<MyTicket />} />
          <Route path="/my-store/inspections" element={<MyInspections />} />
        </Route>
        <Route path="*" element={<Fallback />} />
      </Routes>
    </AuthProvider>
  )
}
