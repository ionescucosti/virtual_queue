import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuthStore } from './store'
import { wsService } from './services/websocket'
import { useActivityTimeout } from './hooks/useActivityTimeout'
import { authApi } from './services/api'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { ActivatePage } from './pages/ActivatePage'
import { DashboardPage } from './pages/DashboardPage'
import { BusinessDetailPage } from './pages/BusinessDetailPage'
import { QueueDetailPage } from './pages/QueueDetailPage'
import { AnalyticsPage } from './pages/AnalyticsPage'
import { JoinQueuePage } from './pages/JoinQueuePage'

const SESSION_KEY = 'vq_active_session'

function WebSocketManager() {
  const { isAuthenticated, logout } = useAuthStore()

  useEffect(() => {
    if (isAuthenticated) {
      wsService.connect()
    } else {
      wsService.disconnect()
    }
  }, [isAuthenticated])

  // Sync logout across tabs + respond to session requests from new tabs
  useEffect(() => {
    const bc = new BroadcastChannel('vq_session')
    bc.onmessage = (e) => {
      if (e.data?.type === 'logout') {
        wsService.disconnect()
        logout()
      } else if (e.data?.type === 'request_session' && isAuthenticated) {
        bc.postMessage({ type: 'session_response', token: useAuthStore.getState().token })
      }
    }
    return () => bc.close()
  }, [logout, isAuthenticated])

  useActivityTimeout(() => {
    if (isAuthenticated) {
      wsService.disconnect()
      logout()
    }
  })

  return null
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, setToken, setUser } = useAuthStore()
  const sessionActive = localStorage.getItem(SESSION_KEY) === 'true'
  const [syncing, setSyncing] = useState(sessionActive && !isAuthenticated)
  const navigate = useNavigate()

  useEffect(() => {
    if (!sessionActive || isAuthenticated) return

    const bc = new BroadcastChannel('vq_session')

    // If no active tab responds in 600ms the session flag is stale — clear it
    const timer = setTimeout(() => {
      localStorage.removeItem(SESSION_KEY)
      setSyncing(false)
      bc.close()
    }, 600)

    bc.onmessage = async (e) => {
      if (e.data?.type === 'session_response' && e.data.token) {
        clearTimeout(timer)
        setToken(e.data.token)
        try {
          const userData = await authApi.getMe()
          setUser(userData)
        } catch { /* token may have expired */ }
        bc.close()
        navigate('/dashboard', { replace: true })
      }
    }

    bc.postMessage({ type: 'request_session' })
    return () => { clearTimeout(timer); bc.close() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  if (syncing) return null  // brief loading while waiting for token from other tab

  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <WebSocketManager />
      <Routes>
        {/* Public routes */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <RegisterPage />
            </PublicRoute>
          }
        />
        <Route
          path="/activate"
          element={
            <PublicRoute>
              <ActivatePage />
            </PublicRoute>
          }
        />

        {/* Protected routes */}
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <DashboardPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/dashboard/business/:id"
          element={
            <PrivateRoute>
              <BusinessDetailPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/dashboard/business/:businessId/queue/:queueId"
          element={
            <PrivateRoute>
              <QueueDetailPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/dashboard/analytics"
          element={
            <PrivateRoute>
              <AnalyticsPage />
            </PrivateRoute>
          }
        />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />}  />

        {/* Customer-facing routes (no auth required) */}
        <Route path="/join/:businessId" element={<JoinQueuePage />} />
        <Route path="/:slug" element={<JoinQueuePage />} />
      </Routes>
    </BrowserRouter>
  )
}

