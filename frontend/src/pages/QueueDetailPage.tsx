import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useWebSocket } from '../hooks/useWebSocket'
import { Layout } from '../components/Layout'
import { apiHelpers } from '../services/api'
import { useWebSocketStore } from '../store'

interface Queue {
  id: number
  name: string
  max_bar_capacity: number
  current_waiting: number
  is_active: boolean
  business_id: number
}

interface QueueEntry {
  id: number
  position: number
  status: 'WAITING' | 'AT_BAR'
  joined_at: string
  called_at: string | null
}

interface DayStats {
  total_joined: number
  served: number
  abandoned: number
}

export function QueueDetailPage() {
  const { businessId, queueId } = useParams<{ businessId: string; queueId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { sendAnnouncement } = useWebSocket(undefined, true)
  const { queueCounts, queueStatuses, queueEntriesVersion, queuePatches } = useWebSocketStore()

  const [queue, setQueue] = useState<Queue | null>(null)
  const [entries, setEntries] = useState<QueueEntry[]>([])
  const [todayStats, setTodayStats] = useState<DayStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [announcement, setAnnouncement] = useState('')
  const [announcementSent, setAnnouncementSent] = useState(false)
  const announcementTimer = useRef<number | null>(null)

  const liveName = queue ? (queuePatches[queue.id]?.name ?? queue.name) : ''
  const liveMaxBar = queue ? (queuePatches[queue.id]?.max_bar_capacity ?? queue.max_bar_capacity) : 0
  const isActive = queue ? (queueStatuses[queue.id] ?? queue.is_active) : false
  const liveWaiting = queue ? (queueCounts[queue.id] ?? queue.current_waiting) : 0

  const atBarEntries = entries.filter(e => e.status === 'AT_BAR')
  const waitingEntries = entries.filter(e => e.status === 'WAITING')
  const atTableEntries = waitingEntries.filter((_, i) => i >= liveMaxBar - atBarEntries.length)

  useEffect(() => {
    loadQueue()
    loadTodayStats()
  }, [queueId])

  useEffect(() => {
    if (queue && isActive) loadEntries()
    else setEntries([])
  }, [queue?.id, isActive])

  const entriesVersion = queue ? (queueEntriesVersion[queue.id] ?? 0) : 0
  useEffect(() => {
    if (entriesVersion > 0 && queue && isActive) loadEntries()
  }, [entriesVersion])

  const loadQueue = async () => {
    try {
      const queues: Queue[] = await apiHelpers.get(`/api/businesses/${businessId}/queues`)
      const found = queues.find(q => q.id === Number(queueId))
      if (found) setQueue(found)
    } catch (e) {
      console.error('Error loading queue:', e)
    } finally {
      setIsLoading(false)
    }
  }

  const loadEntries = async () => {
    try {
      const data = await apiHelpers.get(`/api/businesses/${businessId}/queues/${queueId}/entries`)
      setEntries(data)
    } catch (e) {
      console.error('Error loading entries:', e)
    }
  }

  const loadTodayStats = async () => {
    try {
      const data = await apiHelpers.get(`/api/businesses/${businessId}/queues/${queueId}/analytics`)
      const today = new Date().toISOString().slice(0, 10)
      const todaySession = data.sessions?.find((s: any) => s.date === today)
      if (todaySession) {
        setTodayStats({
          total_joined: todaySession.total_joined,
          served: todaySession.served,
          abandoned: todaySession.abandoned,
        })
      }
    } catch (e) {
      console.error('Error loading stats:', e)
    }
  }

  const handleToggleStatus = async () => {
    if (!queue) return
    try {
      const updated = await apiHelpers.patch(`/api/businesses/${businessId}/queues/${queueId}/status`, {})
      setQueue(updated)
    } catch (e) {
      console.error('Error toggling status:', e)
      alert('Failed to update queue status')
    }
  }

  const handleAction = async (action: 'call' | 'serve', entryId: number) => {
    try {
      await apiHelpers.patch(`/api/businesses/${businessId}/queues/${queueId}/waiting`, { action, entry_id: entryId })
      await loadEntries()
      await loadTodayStats()
    } catch (e) {
      console.error('Error performing action:', e)
      alert('Action failed')
    }
  }

  const handleSendAnnouncement = () => {
    if (!announcement.trim() || !queue) return
    sendAnnouncement(String(queue.id), announcement.trim())
    setAnnouncement('')
    setAnnouncementSent(true)
    if (announcementTimer.current) clearTimeout(announcementTimer.current)
    announcementTimer.current = window.setTimeout(() => setAnnouncementSent(false), 3000)
  }

  const isStaff = user?.role === 'STAFF'
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER' || isStaff

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent" />
        </div>
      </Layout>
    )
  }

  if (!queue) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-lg">Queue not found.</div>
          <button onClick={() => navigate(-1)} className="mt-4 text-blue-600 hover:underline">← Back</button>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* Back + header */}
        <div>
          {!isStaff && (
            <button
              onClick={() => navigate(`/dashboard/business/${businessId}`)}
              className="mb-3 text-blue-600 hover:underline flex items-center gap-1 text-sm"
            >
              ← Back to Business
            </button>
          )}

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{liveName}</h1>
                <p className="text-sm text-gray-500 mt-1">Max {liveMaxBar} customers at bar simultaneously</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 text-sm rounded-full font-medium ${
                  isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {isActive ? 'Active' : 'Inactive'}
                </span>
                {canManage && (
                  <button
                    onClick={handleToggleStatus}
                    className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
                      isActive
                        ? 'bg-red-50 text-red-600 hover:bg-red-100'
                        : 'bg-green-50 text-green-700 hover:bg-green-100'
                    }`}
                  >
                    {isActive ? 'Deactivate' : 'Activate'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="At bar"
            value={atBarEntries.length}
            sub={`of ${liveMaxBar} max`}
            color="green"
          />
          <StatCard
            label="Waiting"
            value={liveWaiting}
            sub={atTableEntries.length > 0 ? `${atTableEntries.length} at table` : 'in queue'}
            color="blue"
          />
          <StatCard
            label="Served today"
            value={todayStats?.served ?? '—'}
            sub={todayStats ? `of ${todayStats.total_joined} total` : 'no session yet'}
            color="purple"
          />
          <StatCard
            label="Left early"
            value={todayStats?.abandoned ?? '—'}
            sub={todayStats && todayStats.total_joined > 0
              ? `${Math.round(todayStats.abandoned / todayStats.total_joined * 100)}% rate`
              : ''}
            color="orange"
          />
        </div>

        {/* Queue management */}
        {isActive ? (
          <div className="bg-white rounded-xl shadow-sm p-6 space-y-6">
            <h2 className="text-lg font-bold text-gray-900">Queue Management</h2>

            {/* At bar */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                At bar ({atBarEntries.length}/{liveMaxBar})
              </h3>
              {atBarEntries.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">No one at the bar yet.</p>
              ) : (
                <div className="space-y-2">
                  {atBarEntries.map(e => (
                    <div key={e.id} className="flex items-center justify-between bg-green-50 border border-green-100 rounded-lg px-4 py-3">
                      <div>
                        <span className="font-semibold text-green-700">#{e.position}</span>
                        <span className="text-xs text-gray-400 ml-3">
                          called {e.called_at ? new Date(e.called_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                      {canManage && (
                        <button
                          onClick={() => handleAction('serve', e.id)}
                          className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                        >
                          Mark Served
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Waiting */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">
                  Waiting ({waitingEntries.length})
                </h3>
                {canManage && waitingEntries.length > 0 && atBarEntries.length < liveMaxBar && (
                  <button
                    onClick={() => handleAction('call', waitingEntries[0].id)}
                    className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    Call Next →
                  </button>
                )}
              </div>
              {waitingEntries.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">No customers waiting.</p>
              ) : (
                <div className="space-y-1.5">
                  {waitingEntries.map((e, i) => {
                    const isAtTable = i >= (liveMaxBar - atBarEntries.length)
                    return (
                      <div
                        key={e.id}
                        className={`flex items-center justify-between rounded-lg px-4 py-2.5 ${
                          isAtTable ? 'bg-orange-50 border border-orange-100' : 'bg-blue-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`font-semibold text-sm ${isAtTable ? 'text-orange-600' : 'text-blue-700'}`}>
                            #{e.position}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            isAtTable
                              ? 'bg-orange-100 text-orange-600'
                              : 'bg-blue-100 text-blue-600'
                          }`}>
                            {isAtTable ? 'at table' : 'next up'}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400">
                          joined {new Date(e.joined_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <p className="text-gray-400 text-lg font-medium">Queue is inactive</p>
            <p className="text-gray-400 text-sm mt-2">Activate the queue to start managing customers.</p>
          </div>
        )}

        {/* Broadcast announcement */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-1">Broadcast Message</h2>
          <p className="text-sm text-gray-500 mb-4">
            Send an instant message to all customers currently waiting in this queue.
          </p>

          <div className="space-y-3">
            {/* Quick presets */}
            <div className="flex flex-wrap gap-2">
              {QUICK_MESSAGES.map(msg => (
                <button
                  key={msg}
                  onClick={() => setAnnouncement(msg)}
                  className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  {msg}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <input
                type="text"
                value={announcement}
                onChange={e => setAnnouncement(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendAnnouncement()}
                placeholder="Type a message to all waiting customers…"
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
              />
              <button
                onClick={handleSendAnnouncement}
                disabled={!announcement.trim()}
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium"
              >
                Send
              </button>
            </div>

            {announcementSent && (
              <p className="text-sm text-green-600 font-medium">Message sent to all waiting customers.</p>
            )}
          </div>
        </div>

      </div>
    </Layout>
  )
}

const QUICK_MESSAGES = [
  'Cash only — no card payments',
  'Temporary delay, please wait',
  'Last orders in 15 minutes',
  'No more beer available',
  'Please evacuate the building',
]

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: number | string
  sub: string
  color: 'green' | 'blue' | 'purple' | 'orange'
}) {
  const bg = { green: 'bg-green-50', blue: 'bg-blue-50', purple: 'bg-purple-50', orange: 'bg-orange-50' }
  const text = { green: 'text-green-600', blue: 'text-blue-600', purple: 'text-purple-600', orange: 'text-orange-600' }

  return (
    <div className={`${bg[color]} rounded-xl p-4`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${text[color]}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}
