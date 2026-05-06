import { useState, useEffect } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useWebSocket } from '../hooks/useWebSocket'
import { Layout } from '../components/Layout'
import { apiHelpers } from '../services/api'

interface Business {
  id: number
  name: string
  address: string
  phone: string
}

export function DashboardPage() {
  const { user } = useAuth()
  const { sendAnnouncement, callCustomer } = useWebSocket(undefined, true)

  if (!user) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
        </div>
      </Layout>
    )
  }

  if (user.role === 'MANAGER') {
    if (user.business_id) {
      return <Navigate to={`/dashboard/business/${user.business_id}`} replace />
    }
    return (
      <Layout>
        <div className="max-w-md mx-auto px-4 py-24 text-center">
          <div className="bg-white rounded-xl shadow-sm p-10">
            <p className="text-4xl mb-4">🏢</p>
            <h2 className="text-xl font-bold text-gray-800 mb-2">No business assigned</h2>
            <p className="text-gray-500 text-sm">Contact the administrator to get assigned to a business.</p>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {user.role === 'ADMIN' && <AdminDashboard />}
        {user.role === 'STAFF' && <StaffDashboard sendAnnouncement={sendAnnouncement} callCustomer={callCustomer} />}
      </div>
    </Layout>
  )
}


function AdminDashboard() {
  const navigate = useNavigate()
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ name: '', address: '', phone: '' })
  const [hoveredBusinessId, setHoveredBusinessId] = useState<number | null>(null)

  useEffect(() => {
    loadBusinesses()
  }, [])

  const loadBusinesses = async () => {
    try {
      const data = await apiHelpers.get('/api/businesses')
      setBusinesses(data)
    } catch (error) {
      console.error('Error loading businesses:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await apiHelpers.post('/api/businesses', formData)
      setShowForm(false)
      setFormData({ name: '', address: '', phone: '' })
      loadBusinesses()
    } catch (error) {
      console.error('Error creating business:', error)
      alert('Error creating business')
    }
  }

  const handleCancel = () => {
    setShowForm(false)
    setFormData({ name: '', address: '', phone: '' })
  }

  const handleDeleteBusiness = async (businessId: number) => {
    if (!confirm('Delete this business? This action cannot be undone.')) return
    try {
      await apiHelpers.delete(`/api/businesses/${businessId}`)
      setBusinesses(prev => prev.filter(b => b.id !== businessId))
    } catch (error) {
      console.error('Error deleting business:', error)
      alert('Error deleting business')
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Business Management</h3>
          <p className="text-gray-500 text-sm">Click on a business to view details and manage users.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          + Create Business
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-bold mb-4">Create New Business</h4>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                required
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Business List */}
      {isLoading ? (
        <p className="text-gray-500">Loading businesses...</p>
      ) : businesses.length === 0 ? (
        <p className="text-gray-500">No businesses yet. Click "Create Business" to add one.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Name</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Address</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Phone</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {businesses.map((business) => (
                <tr
                  key={business.id}
                  className="hover:bg-blue-50 cursor-pointer transition-colors"
                  onMouseEnter={() => setHoveredBusinessId(business.id)}
                  onMouseLeave={() => setHoveredBusinessId(null)}
                  onClick={() => navigate(`/dashboard/business/${business.id}`)}
                >
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">{business.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{business.address}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{business.phone}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteBusiness(business.id) }}
                      className={`px-3 py-1 text-xs bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-all ${
                        hoveredBusinessId === business.id ? 'opacity-100' : 'opacity-0'
                      }`}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ManagerDashboard({ sendAnnouncement }: { sendAnnouncement: (queueId: string, message: string) => void }) {
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

