import { Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthContext.jsx'
import AuthPage from './auth/AuthPage.jsx'
import { Fallback, GuestOnly, RequireRole } from './auth/guards.jsx'
import { InspectorHome, OwnerHome } from './home/Home.jsx'

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
        </Route>
        <Route element={<RequireRole role="owner" />}>
          <Route path="/my-store" element={<OwnerHome />} />
        </Route>
        <Route path="*" element={<Fallback />} />
      </Routes>
    </AuthProvider>
  )
}
