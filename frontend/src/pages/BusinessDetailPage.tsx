import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link, Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useWebSocket } from '../hooks/useWebSocket'
import { Layout } from '../components/Layout'
import { apiHelpers } from '../services/api'
import { useWebSocketStore } from '../store'

interface Business {
  id: number
  name: string
  address: string
  phone: string
}

interface Queue {
  id: number
  name: string
  max_bar_capacity: number
  current_waiting: number
  is_active: boolean
  business_id: number
}

interface BusinessUser {
  id: number
  name: string
  lastname: string
  username: string
  email: string
  role: string
  is_active: boolean
  assigned_queue_id?: number | null
}


type EditUserForm = {
  name: string
  lastname: string
  username: string
  email: string
  role: string
}

export function BusinessDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [business, setBusiness] = useState<Business | null>(null)
  const [users, setUsers] = useState<BusinessUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showUserForm, setShowUserForm] = useState(false)
  const [userFormData, setUserFormData] = useState({
    name: '',
    lastname: '',
    username: '',
    email: '',
    role: 'STAFF'
  })
  const [error, setError] = useState('')
  const [userFormError, setUserFormError] = useState('')
  const [userFormSuccess, setUserFormSuccess] = useState('')

  // Edit business modal state
  const [showEditBusiness, setShowEditBusiness] = useState(false)
  const [businessForm, setBusinessForm] = useState({ name: '', address: '', phone: '' })
  const [originalBusinessForm, setOriginalBusinessForm] = useState({ name: '', address: '', phone: '' })
  const [editBusinessError, setEditBusinessError] = useState('')

  // Queues state
  const [queues, setQueues] = useState<Queue[]>([])
  const [showQueueForm, setShowQueueForm] = useState(false)
  const [queueFormData, setQueueFormData] = useState({ name: '', max_bar_capacity: 5 })
  const [queueFormError, setQueueFormError] = useState('')
  const [hoveredQueueId, setHoveredQueueId] = useState<number | null>(null)
  const [editingQueue, setEditingQueue] = useState<Queue | null>(null)
  const [editQueueForm, setEditQueueForm] = useState({ name: '', max_bar_capacity: 5 })
  const [originalEditQueueForm, setOriginalEditQueueForm] = useState({ name: '', max_bar_capacity: 5 })
  const [editQueueError, setEditQueueError] = useState('')

  // Edit user modal state
  const [editingUser, setEditingUser] = useState<BusinessUser | null>(null)
  const [editUserForm, setEditUserForm] = useState<EditUserForm>({
    name: '', lastname: '', username: '', email: '', role: 'STAFF'
  })
  const [originalEditForm, setOriginalEditForm] = useState<EditUserForm>({
    name: '', lastname: '', username: '', email: '', role: 'STAFF'
  })
  const [editUserError, setEditUserError] = useState('')
  const [hoveredUserId, setHoveredUserId] = useState<number | null>(null)

  useWebSocket(undefined, true)

  const isAdmin = user?.role === 'ADMIN'
  const isManager = user?.role === 'MANAGER'
  const isStaff = user?.role === 'STAFF'
  const canManageQueues = isAdmin || isManager
  const { queueCounts, queueStatuses, queuePatches } = useWebSocketStore()

  const isEditUserDirty =
    editUserForm.name !== originalEditForm.name ||
    editUserForm.lastname !== originalEditForm.lastname ||
    editUserForm.username !== originalEditForm.username ||
    editUserForm.email !== originalEditForm.email ||
    editUserForm.role !== originalEditForm.role

  useEffect(() => {
    loadBusiness()
    loadUsers()
    loadQueues()
  }, [id])

  const loadBusiness = async () => {
    try {
      const data = await apiHelpers.get(`/api/businesses/${id}`)
      setBusiness(data)
    } catch (error) {
      console.error('Error loading business:', error)
      setError('Business not found')
    } finally {
      setIsLoading(false)
    }
  }

  const openEditBusiness = () => {
    if (!business) return
    const form = { name: business.name, address: business.address, phone: business.phone }
    setBusinessForm(form)
    setOriginalBusinessForm(form)
    setEditBusinessError('')
    setShowEditBusiness(true)
  }

  const closeEditBusiness = () => {
    setShowEditBusiness(false)
    setEditBusinessError('')
  }

  const isBusinessDirty = isAdmin
    ? (businessForm.name !== originalBusinessForm.name ||
       businessForm.address !== originalBusinessForm.address ||
       businessForm.phone !== originalBusinessForm.phone)
    : (businessForm.address !== originalBusinessForm.address ||
       businessForm.phone !== originalBusinessForm.phone)

  const handleSaveBusiness = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const updated = await apiHelpers.put(`/api/businesses/${id}`, businessForm)
      setBusiness(updated)
      closeEditBusiness()
    } catch (error) {
      console.error('Error saving business:', error)
      setEditBusinessError('Error saving business')
    }
  }

  const loadQueues = async () => {
    try {
      const data = await apiHelpers.get(`/api/businesses/${id}/queues`)
      setQueues(data)
    } catch (error) {
      console.error('Error loading queues:', error)
    }
  }

  const handleCreateQueue = async (e: React.FormEvent) => {
    e.preventDefault()
    setQueueFormError('')
    try {
      const created = await apiHelpers.post(`/api/businesses/${id}/queues`, queueFormData)
      setQueues(prev => [...prev, created])
      setQueueFormData({ name: '', max_bar_capacity: 5 })
      setShowQueueForm(false)
    } catch (error: any) {
      setQueueFormError(error.response?.data?.detail || 'Error creating queue')
    }
  }

  const openEditQueue = (q: Queue) => {
    const form = { name: q.name, max_bar_capacity: q.max_bar_capacity }
    setEditingQueue(q)
    setEditQueueForm(form)
    setOriginalEditQueueForm(form)
    setEditQueueError('')
  }

  const closeEditQueue = () => {
    setEditingQueue(null)
    setEditQueueError('')
  }

  const isEditQueueDirty =
    editQueueForm.name !== originalEditQueueForm.name ||
    editQueueForm.max_bar_capacity !== originalEditQueueForm.max_bar_capacity

  const handleSaveEditQueue = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingQueue) return
    setEditQueueError('')
    try {
      const updated = await apiHelpers.put(
        `/api/businesses/${id}/queues/${editingQueue.id}`,
        editQueueForm
      )
      setQueues(prev => prev.map(q => q.id === editingQueue.id ? updated : q))
      closeEditQueue()
    } catch (error: any) {
      setEditQueueError(error.response?.data?.detail || 'Error saving queue')
    }
  }

  const handleDeleteQueue = async (queueId: number) => {
    if (!confirm('Delete this queue? This action cannot be undone.')) return
    try {
      await apiHelpers.delete(`/api/businesses/${id}/queues/${queueId}`)
      setQueues(prev => prev.filter(q => q.id !== queueId))
    } catch (error) {
      console.error('Error deleting queue:', error)
      alert('Error deleting queue')
    }
  }

  const handleToggleQueueStatus = async (queueId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const updated = await apiHelpers.patch(`/api/businesses/${id}/queues/${queueId}/status`, {})
      setQueues(prev => prev.map(q => q.id === queueId ? updated : q))
    } catch (error) {
      console.error('Error toggling queue status:', error)
      alert('Error updating queue status')
    }
  }

  const loadUsers = async () => {
    try {
      const data = await apiHelpers.get(`/api/businesses/${id}/users`)
      setUsers(data)
    } catch (error) {
      console.error('Error loading users:', error)
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setUserFormError('')
    setUserFormSuccess('')

    try {
      await apiHelpers.post(`/api/businesses/${id}/users`, userFormData)
      setUserFormSuccess(`User created! Activation email sent to ${userFormData.email}`)
      setUserFormData({ name: '', lastname: '', username: '', email: '', role: 'STAFF' })
      loadUsers()
      setTimeout(() => {
        setShowUserForm(false)
        setUserFormSuccess('')
      }, 3000)
    } catch (error: any) {
      console.error('Error creating user:', error)
      setUserFormError(error.response?.data?.detail || 'Error creating user')
    }
  }

  const handleCancelUserForm = () => {
    setShowUserForm(false)
    setUserFormData({ name: '', lastname: '', username: '', email: '', role: 'STAFF' })
    setUserFormError('')
    setUserFormSuccess('')
  }

  const openEditUser = (u: BusinessUser) => {
    const form: EditUserForm = {
      name: u.name,
      lastname: u.lastname,
      username: u.username,
      email: u.email,
      role: u.role,
    }
    setEditingUser(u)
    setEditUserForm(form)
    setOriginalEditForm(form)
    setEditUserError('')
  }

  const closeEditUser = () => {
    setEditingUser(null)
    setEditUserError('')
  }

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    setEditUserError('')
    try {
      const updated = await apiHelpers.put(
        `/api/businesses/${id}/users/${editingUser.id}`,
        editUserForm
      )
      setUsers(prev => prev.map(u => u.id === editingUser.id ? updated : u))
      closeEditUser()
    } catch (error: any) {
      setEditUserError(error.response?.data?.detail || 'Error saving user')
    }
  }

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Delete this user? This action cannot be undone.')) return
    try {
      await apiHelpers.delete(`/api/businesses/${id}/users/${userId}`)
      setUsers(prev => prev.filter(u => u.id !== userId))
    } catch (error) {
      console.error('Error deleting user:', error)
      alert('Error deleting user')
    }
  }

  const handleAssignQueue = async (userId: number, queueId: number | null) => {
    try {
      const updated = await apiHelpers.patch(
        `/api/businesses/${id}/users/${userId}/queue-assignment`,
        { queue_id: queueId }
      )
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, assigned_queue_id: updated.assigned_queue_id } : u))
    } catch (error) {
      console.error('Error assigning queue:', error)
      alert('Error assigning queue')
    }
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent"></div>
        </div>
      </Layout>
    )
  }

  if (error || !business) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-lg">
            {error || 'Business not found'}
          </div>
          {isAdmin && (
            <button
              onClick={() => navigate('/dashboard')}
              className="mt-4 text-blue-600 hover:underline"
            >
              ← Back to Dashboard
            </button>
          )}
        </div>
      </Layout>
    )
  }

  if (isStaff) {
    if (user?.assigned_queue_id) {
      return <Navigate to={`/dashboard/business/${id}/queue/${user.assigned_queue_id}`} replace />
    }
    return (
      <Layout>
        <div className="max-w-md mx-auto px-4 py-24 text-center">
          <div className="bg-white rounded-xl shadow-sm p-10">
            <p className="text-4xl mb-4">⏳</p>
            <h2 className="text-xl font-bold text-gray-800 mb-2">No queue assigned yet</h2>
            <p className="text-gray-500 text-sm">Contact your manager to get assigned to a queue.</p>
          </div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Back button */}
        {isAdmin && (
          <button
            onClick={() => navigate('/dashboard')}
            className="mb-4 text-blue-600 hover:underline flex items-center gap-1"
          >
            ← Back to Dashboard
          </button>
        )}

        {/* Business Details + QR Code — single card, two columns */}
        <div
          className={`bg-white rounded-xl shadow-sm p-6 ${(isAdmin || isManager) ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
          onClick={() => (isAdmin || isManager) && openEditBusiness()}
        >
          <div className="flex flex-col sm:flex-row gap-6">
            {/* Left: name + detail fields */}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 mb-4">{business.name}</h1>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-14 shrink-0">Name</span>
                  <span className="text-sm font-medium text-gray-800 truncate">{business.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-14 shrink-0">Phone</span>
                  <span className="text-sm font-medium text-gray-800">{business.phone}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-xs text-gray-400 w-14 shrink-0 pt-0.5">Address</span>
                  <span className="text-sm font-medium text-gray-800">{business.address}</span>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px bg-gray-100 self-stretch" />

            {/* Right: QR code */}
            <div onClick={(e) => e.stopPropagation()}>
              <QRCodeCard businessId={id!} businessName={business.name} />
            </div>
          </div>
        </div>

        {/* Users Section */}
        <div className="bg-white rounded-xl shadow-sm p-6 mt-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Users</h2>
              <p className="text-gray-500 text-sm">Managers and staff assigned to this business.</p>
            </div>
            {(isAdmin || isManager) && !showUserForm && (
              <button
                onClick={() => setShowUserForm(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                + Create User
              </button>
            )}
          </div>

          {/* Create User Form */}
          {showUserForm && (isAdmin || isManager) && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-bold mb-4">Create New User</h4>

              {userFormError && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg mb-4">
                  {userFormError}
                </div>
              )}

              {userFormSuccess && (
                <div className="bg-green-50 border border-green-200 text-green-600 p-3 rounded-lg mb-4">
                  {userFormSuccess}
                </div>
              )}

              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                    <input
                      type="text"
                      value={userFormData.name}
                      onChange={(e) => setUserFormData({ ...userFormData, name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                    <input
                      type="text"
                      value={userFormData.lastname}
                      onChange={(e) => setUserFormData({ ...userFormData, lastname: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                  <input
                    type="text"
                    value={userFormData.username}
                    onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={userFormData.email}
                    onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    required
                  />
                </div>
                {isAdmin && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                    <select
                      value={userFormData.role}
                      onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      required
                    >
                      <option value="MANAGER">Manager</option>
                      <option value="STAFF">Staff</option>
                    </select>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Create User
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelUserForm}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Users List */}
          {users.length === 0 ? (
            <div className="text-gray-500 text-center py-8 bg-gray-50 rounded-lg">
              <p>No users assigned to this business yet.</p>
              {(isAdmin || isManager) && (
                <p className="text-sm mt-2">Click "Create User" to add {isAdmin ? 'managers or ' : ''}staff.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Name</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Username</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Email</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Role</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Assigned Queue</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Status</th>
                    {isAdmin && <th className="px-4 py-3"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onMouseEnter={() => setHoveredUserId(u.id)}
                      onMouseLeave={() => setHoveredUserId(null)}
                      onClick={() => isAdmin && openEditUser(u)}
                    >
                      <td className="px-4 py-3 text-sm text-gray-900">{u.name} {u.lastname}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{u.username}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          u.role === 'MANAGER' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                        {u.role === 'STAFF' ? (
                          canManageQueues ? (
                            <select
                              value={u.assigned_queue_id ?? ''}
                              onChange={(e) => handleAssignQueue(u.id, e.target.value ? Number(e.target.value) : null)}
                              className="px-2 py-1 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none bg-white"
                            >
                              <option value="">Unassigned</option>
                              {queues.map(q => (
                                <option key={q.id} value={q.id}>{q.name}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-gray-500 text-xs">
                              {queues.find(q => q.id === u.assigned_queue_id)?.name ?? 'Unassigned'}
                            </span>
                          )
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          u.is_active ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {u.is_active ? 'Active' : 'Pending'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteUser(u.id) }}
                            className={`px-3 py-1 text-xs bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-all ${
                              hoveredUserId === u.id ? 'opacity-100' : 'opacity-0'
                            }`}
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Queues Section */}
        <div className="bg-white rounded-xl shadow-sm p-6 mt-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Queues</h2>
              <p className="text-gray-500 text-sm">Queues configured for this business.</p>
            </div>
            {canManageQueues && !showQueueForm && (
              <button
                onClick={() => setShowQueueForm(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                + Create Queue
              </button>
            )}
          </div>

          {/* Create Queue Form */}
          {showQueueForm && canManageQueues && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h4 className="font-bold mb-4">Create New Queue</h4>
              {queueFormError && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg mb-4 text-sm">
                  {queueFormError}
                </div>
              )}
              <form onSubmit={handleCreateQueue} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={queueFormData.name}
                    onChange={(e) => setQueueFormData({ ...queueFormData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max customers at bar
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    Customers beyond this number wait at their table and are notified when a spot opens.
                  </p>
                  <input
                    type="number"
                    min={1}
                    value={queueFormData.max_bar_capacity}
                    onChange={(e) => setQueueFormData({ ...queueFormData, max_bar_capacity: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    required
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Create Queue
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowQueueForm(false); setQueueFormData({ name: '', max_bar_capacity: 5 }); setQueueFormError('') }}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Queues List */}
          {queues.length === 0 ? (
            <div className="text-gray-500 text-center py-8 bg-gray-50 rounded-lg">
              <p>No queues configured for this business yet.</p>
              {canManageQueues && <p className="text-sm mt-2">Click "Create Queue" to add one.</p>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Name</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Max at bar</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-600">Waiting now</th>
                    <th className="px-4 py-3 text-center text-sm font-medium text-gray-600 w-28">Status</th>
                    {canManageQueues && <th className="px-4 py-3"></th>}
                    {canManageQueues && <th className="px-4 py-3"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {queues.map((q) => (
                    <tr
                      key={q.id}
                      className="hover:bg-blue-50 cursor-pointer transition-colors"
                      onMouseEnter={() => setHoveredQueueId(q.id)}
                      onMouseLeave={() => setHoveredQueueId(null)}
                      onClick={() => canManageQueues && navigate(`/dashboard/business/${id}/queue/${q.id}`)}
                    >
                      <td className="px-4 py-3 text-sm text-gray-900 font-medium">{queuePatches[q.id]?.name ?? q.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <span className="inline-flex items-center gap-1">
                          <span className="font-medium">{queuePatches[q.id]?.max_bar_capacity ?? q.max_bar_capacity}</span>
                          <span className="text-gray-400 text-xs">customers</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {(() => {
                          const maxBar = queuePatches[q.id]?.max_bar_capacity ?? q.max_bar_capacity
                          const count = queueCounts[q.id] ?? q.current_waiting
                          const atBar = Math.min(count, maxBar)
                          const atTable = Math.max(0, count - maxBar)
                          return (
                            <span className="inline-flex items-center gap-2">
                              <span className={`font-semibold text-base ${count > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                                {count}
                              </span>
                              {count > 0 && (
                                <span className="text-xs text-gray-500">
                                  ({atBar} at bar{atTable > 0 ? `, ${atTable} at table` : ''})
                                </span>
                              )}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        {(() => {
                          const active = queueStatuses[q.id] ?? q.is_active
                          return canManageQueues ? (
                            <button
                              onClick={(e) => handleToggleQueueStatus(q.id, e)}
                              className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                                active
                                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                              }`}
                            >
                              {active ? 'Active' : 'Inactive'}
                            </button>
                          ) : (
                            <span className={`px-3 py-1 text-xs rounded-full font-medium ${active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {active ? 'Active' : 'Inactive'}
                            </span>
                          )
                        })()}
                      </td>
                      {canManageQueues && (
                        <td className="px-4 py-3 text-right">
                          <Link
                            to={`/dashboard/analytics?business_id=${id}&queue_id=${q.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="px-3 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            Analytics
                          </Link>
                        </td>
                      )}
                      {canManageQueues && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); openEditQueue(q) }}
                              className={`px-3 py-1 text-xs bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-all ${
                                hoveredQueueId === q.id ? 'opacity-100' : 'opacity-0'
                              }`}
                            >
                              Edit
                            </button>
                            {isAdmin && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteQueue(q.id) }}
                                className={`px-3 py-1 text-xs bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition-all ${
                                  hoveredQueueId === q.id ? 'opacity-100' : 'opacity-0'
                                }`}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit Business Modal */}
      {showEditBusiness && business && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={closeEditBusiness}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-900">Edit Business</h3>
              <button onClick={closeEditBusiness} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            {editBusinessError && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg mb-4 text-sm">
                {editBusinessError}
              </div>
            )}

            <form onSubmit={handleSaveBusiness} className="space-y-4">
              {isAdmin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={businessForm.name}
                    onChange={(e) => setBusinessForm({ ...businessForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                    required
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input
                  type="text"
                  value={businessForm.address}
                  onChange={(e) => setBusinessForm({ ...businessForm, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="text"
                  value={businessForm.phone}
                  onChange={(e) => setBusinessForm({ ...businessForm, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                  required
                />
              </div>
              <div className="flex gap-2 pt-2">
                {isBusinessDirty && (
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    Save
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeEditBusiness}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={closeEditUser}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-900">Edit User</h3>
              <button
                onClick={closeEditUser}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ✕
              </button>
            </div>

            {editUserError && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg mb-4 text-sm">
                {editUserError}
              </div>
            )}

            <form onSubmit={handleSaveEditUser} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input
                    type="text"
                    value={editUserForm.name}
                    onChange={(e) => setEditUserForm({ ...editUserForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={editUserForm.lastname}
                    onChange={(e) => setEditUserForm({ ...editUserForm, lastname: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  value={editUserForm.username}
                  onChange={(e) => setEditUserForm({ ...editUserForm, username: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={editUserForm.email}
                  onChange={(e) => setEditUserForm({ ...editUserForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={editUserForm.role}
                  onChange={(e) => setEditUserForm({ ...editUserForm, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                >
                  <option value="MANAGER">Manager</option>
                  <option value="STAFF">Staff</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                {isEditUserDirty && (
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    Save
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeEditUser}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Queue Modal */}
      {editingQueue && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={closeEditQueue}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-900">Edit Queue</h3>
              <button onClick={closeEditQueue} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
            </div>

            {editQueueError && (
              <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-lg mb-4 text-sm">
                {editQueueError}
              </div>
            )}

            <form onSubmit={handleSaveEditQueue} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={editQueueForm.name}
                  onChange={(e) => setEditQueueForm({ ...editQueueForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max customers at bar</label>
                <p className="text-xs text-gray-500 mb-2">
                  Customers beyond this number wait at their table and are notified when a spot opens.
                </p>
                <input
                  type="number"
                  min={1}
                  value={editQueueForm.max_bar_capacity}
                  onChange={(e) => setEditQueueForm({ ...editQueueForm, max_bar_capacity: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                  required
                />
              </div>
              <div className="flex gap-2 pt-2">
                {isEditQueueDirty && (
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    Save
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeEditQueue}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  )
}

// ── QR Code Card ──────────────────────────────────────────────────────────────

function QRCodeCard({ businessId, businessName }: { businessId: string; businessName: string }) {
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [publicBase, setPublicBase] = useState<string | null>(null)
  const copiedTimer = useRef<number | null>(null)

  useEffect(() => {
    fetch('/api/public/config')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.public_url) setPublicBase(data.public_url) })
      .catch(() => {})
  }, [])

  const baseUrl = publicBase ?? window.location.origin
  const joinUrl = `${baseUrl}/join/${businessId}`
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=10&data=${encodeURIComponent(joinUrl)}`

  const handleDownload = useCallback(async () => {
    setDownloading(true)
    try {
      const res = await fetch(qrImageUrl)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = `${businessName.replace(/\s+/g, '-').toLowerCase()}-qr.png`
      link.click()
      URL.revokeObjectURL(objectUrl)
    } catch {
      window.open(qrImageUrl, '_blank')
    } finally {
      setDownloading(false)
    }
  }, [qrImageUrl, businessName])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(joinUrl)
    } catch {
      prompt('Copy this link:', joinUrl)
      return
    }
    setCopied(true)
    if (copiedTimer.current) clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => setCopied(false), 2000)
  }, [joinUrl])

  return (
    <div className="flex flex-col items-center gap-3 w-52 shrink-0">
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-700">Customer QR Code</p>
        <p className="text-xs text-gray-400 mt-0.5">Scan to join the queue</p>
      </div>

      <div className="p-2 bg-gray-50 rounded-xl border border-gray-100">
        <img src={qrImageUrl} alt="QR code" width={160} height={160} className="rounded" />
      </div>

      <div className="flex gap-2 w-full">
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors font-medium"
        >
          {downloading ? '…' : 'Download'}
        </button>
        <button
          onClick={handleCopy}
          className={`flex-1 px-3 py-1.5 text-xs rounded-lg transition-colors font-medium border ${
            copied
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
      </div>
    </div>
  )
}
