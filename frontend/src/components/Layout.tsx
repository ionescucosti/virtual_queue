import { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useWebSocketStore } from '../store'
import { NotificationBell, NotificationToast } from './Notification'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  const { user, logout } = useAuth()
  const { isConnected } = useWebSocketStore()

  const roleColors = {
    ADMIN: 'bg-red-500',
    OWNER: 'bg-blue-500',
    STAFF: 'bg-green-500',
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <NotificationToast />

      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40 safe-top">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="text-2xl">🎫</span>
            <span className="font-bold text-gray-900 hidden sm:inline">Virtual Queue</span>
          </Link>

          <div className="flex items-center gap-4">
            {/* Connection status */}
            <div className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-xs text-gray-500 hidden sm:inline">
                {isConnected ? 'Connected' : 'Offline'}
              </span>
            </div>

            <NotificationBell />

            {user && (
              <div className="flex items-center gap-3">
                <div className="hidden sm:block text-right">
                  <p className="text-sm font-medium text-gray-900">
                    {user.name} {user.lastname}
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded-full text-white ${roleColors[user.role]}`}>
                    {user.role}
                  </span>
                </div>

                <button
                  onClick={logout}
                  className="p-2 text-gray-500 hover:text-red-500 transition-colors"
                  title="Logout"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H3zm11 4.414l-4.293 4.293a1 1 0 01-1.414-1.414L11.586 7H6a1 1 0 110-2h5.586L8.293 1.707a1 1 0 011.414-1.414L14 4.586V3z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer for mobile */}
      <footer className="bg-white border-t safe-bottom sm:hidden">
        <nav className="flex justify-around py-2">
          <Link to="/dashboard" className="flex flex-col items-center p-2 text-gray-600">
            <span className="text-xl">🏠</span>
            <span className="text-xs mt-1">Home</span>
          </Link>
          <Link to="/queue" className="flex flex-col items-center p-2 text-gray-600">
            <span className="text-xl">📋</span>
            <span className="text-xs mt-1">Queue</span>
          </Link>
          <Link to="/profile" className="flex flex-col items-center p-2 text-gray-600">
            <span className="text-xl">👤</span>
            <span className="text-xs mt-1">Profile</span>
          </Link>
        </nav>
      </footer>
    </div>
  )
}

export function AuthLayout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <span className="text-6xl">🎫</span>
          <h1 className="text-3xl font-bold text-white mt-4">Virtual Queue</h1>
          <p className="text-blue-200 mt-2">Queue management made simple</p>
        </div>
        {children}
      </div>
    </div>
  )
}

