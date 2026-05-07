import { useState, useEffect } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
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

  if (user.role === 'STAFF') {
    if (user.business_id && user.assigned_queue_id) {
      return <Navigate to={`/dashboard/business/${user.business_id}/queue/${user.assigned_queue_id}`} replace />
    }
    return (
      <Layout>
        <div className="max-w-md mx-auto px-4 py-24 text-center">
          <div className="bg-white rounded-xl shadow-sm p-10">
            <p className="text-4xl mb-4">📋</p>
            <h2 className="text-xl font-bold text-gray-800 mb-2">No queue assigned</h2>
            <p className="text-gray-500 text-sm">Contact your manager to get assigned to a queue.</p>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {user.role === 'ADMIN' && <AdminDashboard />}
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
