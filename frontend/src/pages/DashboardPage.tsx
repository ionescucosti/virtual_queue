import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useWebSocket } from '../hooks/useWebSocket'
import { Layout } from '../components/Layout'
import { useWebSocketStore } from '../store'

export function DashboardPage() {
  const { user } = useAuth()
  const { isConnected, sendAnnouncement, callCustomer } = useWebSocket(undefined, true)

  if (!user) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Welcome Section */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-white mb-6">
          <h1 className="text-2xl font-bold">
            Welcome back, {user.name}! 👋
          </h1>
          <p className="text-blue-100 mt-1">
            {getRoleDescription(user.role)}
          </p>
        </div>

        {/* Role-specific content */}
        {user.role === 'ADMIN' && <AdminDashboard sendAnnouncement={sendAnnouncement} />}
        {user.role === 'OWNER' && <OwnerDashboard sendAnnouncement={sendAnnouncement} />}
        {user.role === 'STAFF' && <StaffDashboard sendAnnouncement={sendAnnouncement} callCustomer={callCustomer} />}
      </div>
    </Layout>
  )
}

function getRoleDescription(role: string): string {
  switch (role) {
    case 'ADMIN':
      return 'You have full access to all system features.'
    case 'OWNER':
      return 'Manage your business queues and staff.'
    case 'STAFF':
      return 'Serve customers and manage your assigned queue.'
    default:
      return ''
  }
}

function AdminDashboard({ sendAnnouncement }: { sendAnnouncement: (queueId: string, message: string) => void }) {
  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon="👥" label="Total Users" value="--" color="blue" />
        <StatCard icon="✅" label="Active" value="--" color="green" />
        <StatCard icon="📋" label="Queues" value="--" color="purple" />
        <StatCard icon="🔌" label="Connections" value="--" color="orange" />
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card title="👥 User Management" description="Create, edit, and manage user accounts.">
          <a
            href="/register"
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Register New User
          </a>
        </Card>

        <Card title="📢 System Announcement" description="Send a message to all connected users.">
          <AnnouncementForm onSend={(msg) => sendAnnouncement('all', msg)} />
        </Card>

        <Card title="⚙️ System Settings" description="Configure system-wide settings.">
          <button className="text-blue-600 font-medium">Open Settings →</button>
        </Card>

        <Card title="📋 Audit Logs" description="View system activity logs.">
          <button className="text-blue-600 font-medium">View Logs →</button>
        </Card>
      </div>
    </div>
  )
}

function OwnerDashboard({ sendAnnouncement }: { sendAnnouncement: (queueId: string, message: string) => void }) {
  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon="📋" label="Active Queues" value="--" color="blue" />
        <StatCard icon="⏳" label="Waiting" value="--" color="orange" />
        <StatCard icon="⏱️" label="Avg Wait" value="-- min" color="purple" />
        <StatCard icon="✅" label="Served Today" value="--" color="green" />
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card title="📋 My Queues" description="View and manage your business queues.">
          <button className="text-blue-600 font-medium">Manage Queues →</button>
        </Card>

        <Card title="📢 Queue Announcement" description="Send a message to customers in queue.">
          <AnnouncementForm onSend={(msg) => sendAnnouncement('queue_1', msg)} placeholder="e.g., Bar closing in 10 minutes" />
        </Card>

        <Card title="👥 Staff Management" description="Manage your staff members.">
          <div className="flex gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">--</p>
              <p className="text-sm text-gray-500">Total Staff</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">--</p>
              <p className="text-sm text-gray-500">Online Now</p>
            </div>
          </div>
        </Card>

        <Card title="📊 Analytics" description="View business reports and analytics.">
          <button className="text-blue-600 font-medium">View Analytics →</button>
        </Card>
      </div>
    </div>
  )
}

function StaffDashboard({
  sendAnnouncement,
  callCustomer
}: {
  sendAnnouncement: (queueId: string, message: string) => void
  callCustomer: (customerId: string | number, message?: string) => void
}) {
  const [customMessage, setCustomMessage] = useState('')

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard icon="🎫" label="Next" value="#--" color="blue" />
        <StatCard icon="⏳" label="Waiting" value="--" color="orange" />
        <StatCard icon="✅" label="Served" value="--" color="green" />
      </div>

      {/* Call Next Customer - Primary Action */}
      <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-2xl p-6 text-white">
        <h3 className="text-xl font-bold mb-4">📞 Call Next Customer</h3>
        <div className="space-y-4">
          <input
            type="text"
            value={customMessage}
            onChange={(e) => setCustomMessage(e.target.value)}
            placeholder="Custom message (optional)"
            className="w-full px-4 py-3 rounded-xl bg-white/20 placeholder-white/70 text-white border border-white/30 focus:border-white focus:outline-none"
          />
          <button
            onClick={() => callCustomer(1, customMessage || "It's your turn! Please come to the counter.")}
            className="w-full py-4 bg-white text-green-600 rounded-xl font-bold text-lg hover:bg-green-50 transition-colors touch-manipulation"
          >
            🔔 Call Next Customer
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card title="📢 Quick Announcement" description="Send a message to waiting customers.">
          <AnnouncementForm
            onSend={(msg) => sendAnnouncement('queue_1', msg)}
            placeholder="e.g., Come to counter 3"
          />
        </Card>

        <Card title="📋 Queue Status" description="Current queue information.">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Currently serving:</span>
              <span className="font-bold">#--</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Next in line:</span>
              <span className="font-bold">#--</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Est. wait time:</span>
              <span className="font-bold">-- min</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}

// Reusable Components

function StatCard({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  const bgColors: Record<string, string> = {
    blue: 'bg-blue-50',
    green: 'bg-green-50',
    orange: 'bg-orange-50',
    purple: 'bg-purple-50',
    red: 'bg-red-50',
  }

  const textColors: Record<string, string> = {
    blue: 'text-blue-600',
    green: 'text-green-600',
    orange: 'text-orange-600',
    purple: 'text-purple-600',
    red: 'text-red-600',
  }

  return (
    <div className={`${bgColors[color]} rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <span className="text-sm text-gray-600">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${textColors[color]}`}>{value}</p>
    </div>
  )
}

function Card({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-1">{title}</h3>
      <p className="text-gray-500 text-sm mb-4">{description}</p>
      {children}
    </div>
  )
}

function AnnouncementForm({ onSend, placeholder = "Type your announcement..." }: { onSend: (message: string) => void; placeholder?: string }) {
  const [message, setMessage] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (message.trim()) {
      onSend(message)
      setMessage('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={placeholder}
        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
      />
      <button
        type="submit"
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        Send
      </button>
    </form>
  )
}

