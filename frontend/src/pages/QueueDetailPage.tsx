import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
  slug: string | null
}

interface Queue {
  id: number
  name: string
  max_bar_capacity: number
  current_waiting: number
  is_active: boolean
  pinned_message: string | null
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
  skipped: number
  abandoned: number
}

export function QueueDetailPage() {
  const { businessId, queueId } = useParams<{ businessId: string; queueId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  useWebSocket(undefined, true)
  const { queueCounts, queueStatuses, queueEntriesVersion } = useWebSocketStore()

  const [business, setBusiness] = useState<Business | null>(null)
  const [queue, setQueue] = useState<Queue | null>(null)
  const [entries, setEntries] = useState<QueueEntry[]>([])
  const [todayStats, setTodayStats] = useState<DayStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [editingMaxBar, setEditingMaxBar] = useState(false)
  const [maxBarInput, setMaxBarInput] = useState('')
  const [pinnedSelection, setPinnedSelection] = useState<string>('')
  const [pinnedCustomInput, setPinnedCustomInput] = useState('')
  const [pinnedSelection2, setPinnedSelection2] = useState<string>('')
  const [pinnedCustomInput2, setPinnedCustomInput2] = useState('')
  const [pinnedSaving, setPinnedSaving] = useState(false)
  const [templates, setTemplates] = useState<{ id: number; message: string }[]>([])

  const liveName = queue ? queue.name : ''
  const liveMaxBar = queue ? queue.max_bar_capacity : 0
  const isActive = queue ? (queueStatuses[queue.id] ?? queue.is_active) : false
  const liveWaiting = queue ? (queueCounts[queue.id] ?? queue.current_waiting) : 0

  const atBarEntries = entries.filter(e => e.status === 'AT_BAR')
  const waitingEntries = entries.filter(e => e.status === 'WAITING')
  const atTableEntries = waitingEntries.filter((_, i) => i >= liveMaxBar - atBarEntries.length)

  useEffect(() => {
    loadBusiness()
    loadQueue()
    loadTodayStats()
    loadTemplates()
  }, [queueId])

  const loadBusiness = async () => {
    try {
      const data = await apiHelpers.get(`/api/businesses/${businessId}`)
      setBusiness(data)
    } catch (e) {
      console.error('Error loading business:', e)
    }
  }

  useEffect(() => {
    if (queue) loadEntries()
    else setEntries([])
  }, [queue?.id, isActive])

  const entriesVersion = queue ? (queueEntriesVersion[queue.id] ?? 0) : 0
  useEffect(() => {
    if (entriesVersion > 0 && queue) loadEntries()
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
          skipped: todaySession.skipped,
          abandoned: todaySession.abandoned,
        })
      }
    } catch (e) {
      console.error('Error loading stats:', e)
    }
  }

  const loadTemplates = async () => {
    try {
      const data = await apiHelpers.get(`/api/businesses/${businessId}/pinned-message-templates`)
      setTemplates(data)
    } catch (e) {
      console.error('Error loading templates:', e)
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

  const handleAction = async (action: 'call' | 'serve' | 'skip', entryId: number) => {
    try {
      await apiHelpers.patch(`/api/businesses/${businessId}/queues/${queueId}/waiting`, { action, entry_id: entryId })
      await loadEntries()
      await loadTodayStats()
    } catch (e) {
      console.error('Error performing action:', e)
      alert('Action failed')
    }
  }

  const resolveMessage = (selection: string, customInput: string) =>
    selection === 'custom' ? customInput.trim() : selection

  const handleNotify = async (selection: string, customInput: string) => {
    if (!queue) return
    const message = resolveMessage(selection, customInput)
    if (!message) return
    try {
      await apiHelpers.post(`/api/businesses/${businessId}/queues/${queueId}/notify`, { message })
    } catch (e) {
      console.error('Error sending notification:', e)
    }
  }

  const handlePinMessage = async (selection: string, customInput: string) => {
    if (!queue) return
    const message = resolveMessage(selection, customInput)
    if (!message) return
    setPinnedSaving(true)
    try {
      const updated = await apiHelpers.put(
        `/api/businesses/${businessId}/queues/${queueId}/pinned-message`,
        { message }
      )
      setQueue(updated)
      setPinnedSelection('')
      setPinnedCustomInput('')
      setPinnedSelection2('')
      setPinnedCustomInput2('')
    } catch (e) {
      console.error('Error pinning message:', e)
      alert('Failed to pin message')
    } finally {
      setPinnedSaving(false)
    }
  }

  const handleClearPinnedMessage = async () => {
    if (!queue) return
    setPinnedSaving(true)
    try {
      const updated = await apiHelpers.delete(`/api/businesses/${businessId}/queues/${queueId}/pinned-message`)
      setQueue(updated)
    } catch (e) {
      console.error('Error clearing pinned message:', e)
      alert('Failed to remove pinned message')
    } finally {
      setPinnedSaving(false)
    }
  }


  const handleSaveMaxBar = async () => {
    const val = parseInt(maxBarInput, 10)
    if (!queue || isNaN(val) || val < 1) return
    try {
      const updated = await apiHelpers.put(`/api/businesses/${businessId}/queues/${queueId}`, { max_bar_capacity: val })
      setQueue(updated)
      setEditingMaxBar(false)
    } catch (e) {
      console.error('Error updating max bar capacity:', e)
      alert('Failed to update capacity')
    }
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

        {/* Business details */}
        {business && (
          <div className="bg-white rounded-xl shadow-sm p-5">
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1">
                <h2 className="text-lg font-bold text-gray-900">{business.name}</h2>
                <p className="text-sm text-gray-500 mt-1">{business.address}</p>
                <p className="text-sm text-gray-500">{business.phone}</p>
              </div>
              <QRCodeCard businessId={String(business.id)} businessName={business.name} businessSlug={business.slug} />
            </div>
          </div>
        )}

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
                <div className="flex items-center gap-2 mt-1">
                  {editingMaxBar ? (
                    <>
                      <input
                        type="number"
                        min={1}
                        value={maxBarInput}
                        onChange={e => setMaxBarInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveMaxBar(); if (e.key === 'Escape') setEditingMaxBar(false) }}
                        autoFocus
                        className="w-16 px-2 py-0.5 text-sm border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button onClick={handleSaveMaxBar} className="text-xs text-white bg-blue-600 hover:bg-blue-700 px-2 py-0.5 rounded">Save</button>
                      <button onClick={() => setEditingMaxBar(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-gray-500">Max {liveMaxBar} customers at bar simultaneously</p>
                      {canManage && (
                        <button
                          onClick={() => { setMaxBarInput(String(liveMaxBar)); setEditingMaxBar(true) }}
                          className="text-xs text-blue-500 hover:text-blue-700 underline"
                        >
                          Edit
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
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

        {(isActive || entries.length > 0) && (<>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
              label="Skipped"
              value={todayStats?.skipped ?? '—'}
              sub="no-shows"
              color="orange"
            />
            <StatCard
              label="Left early"
              value={todayStats?.abandoned ?? '—'}
              sub={todayStats && todayStats.total_joined > 0
                ? `${Math.round(todayStats.abandoned / todayStats.total_joined * 100)}% rate`
                : ''}
              color="red"
            />
          </div>

          {/* Pinned message — persistent banner shown to all waiting customers */}
          <div className="bg-white rounded-xl shadow-sm p-6 space-y-3">
            <h2 className="text-lg font-bold text-gray-900">Message</h2>

            {/* Row 1 — Announce only */}
            <div className="flex gap-3 items-center">
              {queue?.pinned_message ? (
                <div className="flex-1 bg-amber-50 border border-amber-300 rounded-lg px-4 py-2.5 flex gap-2 items-center">
                  <span className="flex-shrink-0">📌</span>
                  <p className="text-amber-900 text-sm font-medium truncate">{queue.pinned_message}</p>
                </div>
              ) : (
                <select
                  value={pinnedSelection2}
                  onChange={e => { setPinnedSelection2(e.target.value); setPinnedCustomInput2('') }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none text-sm bg-white"
                >
                  <option value="">— Select a message —</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.message}>{t.message}</option>
                  ))}
                  <option value="custom">Custom message…</option>
                </select>
              )}
              <button
                onClick={queue?.pinned_message ? handleClearPinnedMessage : () => handlePinMessage(pinnedSelection2, pinnedCustomInput2)}
                disabled={pinnedSaving || (!queue?.pinned_message && (!pinnedSelection2 || (pinnedSelection2 === 'custom' && !pinnedCustomInput2.trim())))}
                className="px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium flex-shrink-0"
              >
                {pinnedSaving ? '…' : queue?.pinned_message ? 'Remove' : 'Announce'}
              </button>
            </div>
            {!queue?.pinned_message && pinnedSelection2 === 'custom' && (
              <input
                type="text"
                value={pinnedCustomInput2}
                onChange={e => setPinnedCustomInput2(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handlePinMessage(pinnedSelection2, pinnedCustomInput2)}
                placeholder="Type your custom message…"
                maxLength={500}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none text-sm"
              />
            )}

            {/* Row 2 — Notify only */}
            <div className="flex gap-3 items-center">
              <select
                value={pinnedSelection}
                onChange={e => { setPinnedSelection(e.target.value); setPinnedCustomInput('') }}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm bg-white"
              >
                <option value="">— Select a message —</option>
                {templates.map(t => (
                  <option key={t.id} value={t.message}>{t.message}</option>
                ))}
                <option value="custom">Custom message…</option>
              </select>
              <button
                onClick={() => handleNotify(pinnedSelection, pinnedCustomInput)}
                disabled={!pinnedSelection || (pinnedSelection === 'custom' && !pinnedCustomInput.trim())}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium flex-shrink-0"
              >
                Notify
              </button>
            </div>
            {pinnedSelection === 'custom' && (
              <input
                type="text"
                value={pinnedCustomInput}
                onChange={e => setPinnedCustomInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleNotify(pinnedSelection, pinnedCustomInput)}
                placeholder="Type your custom message…"
                maxLength={500}
                autoFocus
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
              />
            )}
          </div>

          {/* Queue management */}
          <div className="bg-white rounded-xl shadow-sm p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Queue Management</h2>
              
              {/* Action buttons - always visible */}
              {canManage && (
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      if (atBarEntries.length > 0) {
                        handleAction('serve', atBarEntries[0].id)
                      } else if (waitingEntries.length > 0) {
                        handleAction('call', waitingEntries[0].id)
                      }
                    }}
                    disabled={atBarEntries.length === 0 && waitingEntries.length === 0}
                    className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    Call Next →
                  </button>
                  <button
                    onClick={() => atBarEntries[0] && handleAction('skip', atBarEntries[0].id)}
                    disabled={atBarEntries.length === 0}
                    className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    Skip
                  </button>
                </div>
              )}
            </div>

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
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-green-700">#{e.position}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-600">
                          being served
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">
                        called {e.called_at ? new Date(e.called_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Waiting */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Waiting ({waitingEntries.length})
              </h3>
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

        </>)}


      </div>

    </Layout>
  )
}

function QRCodeCard({ businessId, businessName, businessSlug }: { businessId: string; businessName: string; businessSlug: string | null }) {
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

  const baseUrl = (() => {
    if (!publicBase) return window.location.origin
    try {
      const host = new URL(publicBase).hostname
      const isPrivate = /^(localhost$|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/i.test(host)
      if (isPrivate) return window.location.origin
    } catch { /* malformed URL */ }
    return publicBase
  })()
  // Use slug for friendly URL if available, fall back to ID-based URL
  const joinUrl = businessSlug
    ? `${baseUrl}/${businessSlug}`
    : `${baseUrl}/join/${businessId}`
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

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: number | string
  sub: string
  color: 'green' | 'blue' | 'purple' | 'orange' | 'red'
}) {
  const bg = { green: 'bg-green-50', blue: 'bg-blue-50', purple: 'bg-purple-50', orange: 'bg-orange-50', red: 'bg-red-50' }
  const text = { green: 'text-green-600', blue: 'text-blue-600', purple: 'text-purple-600', orange: 'text-orange-600', red: 'text-red-600' }

  return (
    <div className={`${bg[color]} rounded-xl p-4`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${text[color]}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}
