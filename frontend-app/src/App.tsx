import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from '@/components/shell/RequireAuth'
import { AppShell } from '@/components/shell/AppShell'
import { LoginPage } from '@/features/login/LoginPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { PanelsPage } from '@/features/panels/PanelsPage'
import { KioskPage } from '@/features/kiosk/KioskPage'
import { AutomatePage } from '@/features/automate/AutomatePage'
import { Toaster } from '@/components/ui/toast'

function HubShell({ flush = false }: { flush?: boolean }) {
  return (
    <RequireAuth>
      <AppShell flush={flush} />
    </RequireAuth>
  )
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/panel/:panelId" element={<RequireAuth><KioskPage /></RequireAuth>} />

        <Route element={<HubShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/panels" element={<PanelsPage />} />
        </Route>

        <Route element={<HubShell flush />}>
          <Route path="/automate" element={<AutomatePage />} />
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <Toaster />
    </>
  )
}
