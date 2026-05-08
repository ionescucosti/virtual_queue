import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'

// ── Types ─────────────────────────────────────────────────────────────────────

interface QueueInfo {
  id: number
  name: string
  max_bar_capacity: number
  current_waiting: number
  is_active: boolean
}

interface BusinessInfo {
  id: number
  name: string
  address: string
  phone: string
  slug: string | null
  queues: QueueInfo[]
}

interface ActiveEntry {
  businessId: number
  queueId: number
  entryId: number
  joinedAt: string
}

interface PositionData {
  entry_id: number
  position: number
  status: 'WAITING' | 'AT_BAR' | 'SERVED' | 'SKIPPED' | 'LEFT'
  current_waiting: number
  place_in_line: number
  queue_name: string
  queue_is_active: boolean
  pinned_message: string | null
}

interface Announcement {
  id: string
  message: string
}

type ViewState = 'loading' | 'browsing' | 'joining' | 'waiting' | 'called' | 'served' | 'skipped' | 'error'

// ── localStorage helpers ──────────────────────────────────────────────────────

const DEVICE_TOKEN_KEY = 'vq_device_token'
const ACTIVE_ENTRY_KEY = 'vq_active_entry'

function generateUUID(): string {
  // crypto.randomUUID() isn't available in all mobile browsers (iOS < 15.4)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback: RFC 4122 v4 UUID using Math.random
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function getOrCreateDeviceToken(): string {
  let token = localStorage.getItem(DEVICE_TOKEN_KEY)
  if (!token) {
    token = generateUUID()
    localStorage.setItem(DEVICE_TOKEN_KEY, token)
  }
  return token
}

function loadActiveEntry(): ActiveEntry | null {
  try {
    const raw = localStorage.getItem(ACTIVE_ENTRY_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveActiveEntry(entry: ActiveEntry) {
  localStorage.setItem(ACTIVE_ENTRY_KEY, JSON.stringify(entry))
}

function clearActiveEntry() {
  localStorage.removeItem(ACTIVE_ENTRY_KEY)
}

const API = '/api/public'

// ── Component ─────────────────────────────────────────────────────────────────

export function JoinQueuePage() {
  const { businessId, slug } = useParams<{ businessId?: string; slug?: string }>()
  const [bizId, setBizId] = useState<number | null>(businessId ? Number(businessId) : null)
  
  // Use VITE_WS_URL env var if available, otherwise fall back to current host
  const WS_BASE = import.meta.env.VITE_WS_URL || 
    `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`

  const [view, setView] = useState<ViewState>('loading')
  const [business, setBusiness] = useState<BusinessInfo | null>(null)
  const [liveCounts, setLiveCounts] = useState<Record<number, number>>({})
  const [liveStatuses, setLiveStatuses] = useState<Record<number, boolean>>({})
  const [activeEntry, setActiveEntry] = useState<ActiveEntry | null>(null)
  const [positionData, setPositionData] = useState<PositionData | null>(null)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [pinnedMessage, setPinnedMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)

  // Refs for use inside WS closure
  const activeEntryRef = useRef<ActiveEntry | null>(null)
  const businessRef = useRef<BusinessInfo | null>(null)
  const deviceToken = useRef(getOrCreateDeviceToken())
  const wsRef = useRef<WebSocket | null>(null)
  const pingRef = useRef<number | null>(null)
  const pollRef = useRef<number | null>(null)

  // Keep refs in sync with state
  useEffect(() => { activeEntryRef.current = activeEntry }, [activeEntry])
  useEffect(() => { businessRef.current = business }, [business])

  // ── Fetch / refresh business info ──────────────────────────────────────────

  const fetchBusiness = useCallback(async () => {
    const current = businessRef.current
    if (!current) return
    try {
      const res = await fetch(`${API}/businesses/by-slug/${current.slug ?? current.id}`)
      if (!res.ok) return
      const biz: BusinessInfo = await res.json()
      setBusiness(biz)
      setLiveCounts(prev => {
        const next = { ...prev }
        biz.queues.forEach(q => { next[q.id] = q.current_waiting })
        return next
      })
      setLiveStatuses(prev => {
        const next = { ...prev }
        biz.queues.forEach(q => { next[q.id] = q.is_active })
        return next
      })
    } catch { /* silently ignore */ }
  }, [])

  // ── Fetch position ──────────────────────────────────────────────────────────

  const fetchPosition = useCallback(async (entry: ActiveEntry) => {
    try {
      const params = new URLSearchParams({
        entry_id: String(entry.entryId),
        customer_token: deviceToken.current,
      })
      const res = await fetch(`${API}/businesses/${entry.businessId}/queues/${entry.queueId}/position?${params}`)
      if (res.status === 404) {
        clearActiveEntry()
        activeEntryRef.current = null
        setActiveEntry(null)
        setView('browsing')
        return
      }
      if (!res.ok) return
      const data: PositionData = await res.json()
      setPositionData(data)
      setPinnedMessage(data.pinned_message ?? null)

      if (data.status === 'SERVED') {
        clearActiveEntry()
        activeEntryRef.current = null
        setActiveEntry(null)
        setView('served')
      } else if (data.status === 'SKIPPED') {
        clearActiveEntry()
        activeEntryRef.current = null
        setActiveEntry(null)
        setView('skipped')
      } else if (data.status === 'LEFT') {
        clearActiveEntry()
        activeEntryRef.current = null
        setActiveEntry(null)
        setView('browsing')
      } else if (data.status === 'AT_BAR') {
        setView('called')
      }
    } catch {
      // silently ignore polling errors
    }
  }, [])

  // ── WebSocket ───────────────────────────────────────────────────────────────

  const subscribeToQueue = useCallback((queueId: number) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: 'subscribe_queue', queue_id: String(queueId) }))
  }, [])

  useEffect(() => {
    let reconnectTimer: number | null = null
    let attempts = 0
    let destroyed = false

    const connect = () => {
      if (destroyed) return
      const wsUrl = `${WS_BASE}/ws/notify`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        attempts = 0
        pingRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
        }, 30_000)
        // Re-subscribe to queue on every (re)connect so server delivers announcements
        const entry = activeEntryRef.current
        if (entry) ws.send(JSON.stringify({ type: 'subscribe_queue', queue_id: String(entry.queueId) }))
      }

      ws.onerror = () => { /* handled by onclose */ }

      ws.onclose = (event) => {
        if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null }
        if (destroyed || event.code === 1000) return
        attempts++
        const delay = Math.min(500 * Math.pow(2, attempts - 1), 30_000)
        reconnectTimer = window.setTimeout(connect, delay)
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          const qid = Number(msg.queue_id)

          switch (msg.type) {
            case 'queue_count_update':
              setLiveCounts(prev => ({ ...prev, [qid]: msg.current_waiting }))
              setPositionData(prev =>
                prev && activeEntryRef.current?.queueId === qid
                  ? { ...prev, current_waiting: msg.current_waiting }
                  : prev
              )
              break

            case 'queue_status_update':
              setLiveStatuses(prev => ({ ...prev, [qid]: msg.is_active }))
              setPositionData(prev =>
                prev && activeEntryRef.current?.queueId === qid
                  ? { ...prev, queue_is_active: msg.is_active }
                  : prev
              )
              break

            case 'queue_entries_changed': {
              const entry = activeEntryRef.current
              if (entry && entry.queueId === qid) fetchPosition(entry)
              break
            }

            case 'business_queues_changed':
              if (msg.business_id === businessRef.current?.id) fetchBusiness()
              break

            case 'announcement': {
              const myQueueId = activeEntryRef.current?.queueId
              if (!msg.queue_id || Number(msg.queue_id) === myQueueId) {
                const id = Date.now().toString()
                setAnnouncements(prev => [{ id, message: msg.message }, ...prev].slice(0, 4))
                window.setTimeout(() => {
                  setAnnouncements(prev => prev.filter(a => a.id !== id))
                }, 30_000)
              }
              break
            }

            case 'notification': {
              const myQueueId = activeEntryRef.current?.queueId
              if (!msg.queue_id || Number(msg.queue_id) === myQueueId) {
                const id = Date.now().toString()
                setAnnouncements(prev => [{ id, message: msg.message }, ...prev].slice(0, 4))
                window.setTimeout(() => {
                  setAnnouncements(prev => prev.filter(a => a.id !== id))
                }, 5_000)
              }
              break
            }

            case 'announcement_cleared': {
              const myQueueId = activeEntryRef.current?.queueId
              if (!msg.queue_id || Number(msg.queue_id) === myQueueId) {
                setAnnouncements([])
              }
              break
            }

            case 'pinned_message_update': {
              const myQueueId = activeEntryRef.current?.queueId
              if (!msg.queue_id || Number(msg.queue_id) === myQueueId) {
                setPinnedMessage(msg.message ?? null)
              }
              break
            }

            case 'your_turn':
              setView(v => (v === 'waiting' || v === 'called' ? 'called' : v))
              if ('vibrate' in navigator) navigator.vibrate([300, 100, 300, 100, 300])
              break
          }
        } catch { /* ignore parse errors */ }
      }
    }

    connect()

    return () => {
      destroyed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null }
      wsRef.current?.close(1000)
      wsRef.current = null
    }
  }, [fetchPosition, fetchBusiness])

  // ── Periodic position poll (fallback for missed WS events) ─────────────────

  useEffect(() => {
    if (view !== 'waiting' && view !== 'called') {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }
    pollRef.current = window.setInterval(() => {
      if (activeEntryRef.current) fetchPosition(activeEntryRef.current)
    }, 30_000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [view, fetchPosition])

  // ── Initial load ────────────────────────────────────────────────────────────

  useEffect(() => {
    ;(async () => {
      try {
        // Fetch business by slug or by ID
        const endpoint = slug
          ? `${API}/businesses/by-slug/${encodeURIComponent(slug)}`
          : `${API}/businesses/${bizId}`
        const res = await fetch(endpoint)
        if (!res.ok) throw new Error()
        const biz: BusinessInfo = await res.json()
        setBusiness(biz)
        setBizId(biz.id)

        const counts: Record<number, number> = {}
        const statuses: Record<number, boolean> = {}
        biz.queues.forEach(q => { counts[q.id] = q.current_waiting; statuses[q.id] = q.is_active })
        setLiveCounts(counts)
        setLiveStatuses(statuses)

        // Restore active entry if any
        const stored = loadActiveEntry()
        if (stored && stored.businessId === biz.id) {
          setActiveEntry(stored)
          activeEntryRef.current = stored
          await fetchPosition(stored)
          subscribeToQueue(stored.queueId)
          setView(v => v === 'loading' ? 'waiting' : v)
        } else {
          setView('browsing')
        }
      } catch {
        setError('Could not load business information. Please scan the QR code again.')
        setView('error')
      }
    })()
  }, [slug, bizId, fetchPosition, subscribeToQueue])

  // ── Join queue ──────────────────────────────────────────────────────────────

  const joinQueue = async (queueId: number) => {
    if (!bizId) return
    setError(null)
    setView('joining')
    try {
      const res = await fetch(`${API}/businesses/${bizId}/queues/${queueId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_token: deviceToken.current }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(res.status === 409
          ? 'You are already in a queue at this location.'
          : body.detail || 'Failed to join. Please try again.')
        setView('browsing')
        return
      }
      const data = await res.json()
      const entry: ActiveEntry = {
        businessId: bizId,
        queueId,
        entryId: data.entry_id,
        joinedAt: new Date().toISOString(),
      }
      saveActiveEntry(entry)
      setActiveEntry(entry)
      activeEntryRef.current = entry
      subscribeToQueue(queueId)
      await fetchPosition(entry)
      setView('waiting')
    } catch {
      setError('Network error. Please try again.')
      setView('browsing')
    }
  }

  // ── Leave queue ─────────────────────────────────────────────────────────────

  const leaveQueue = async () => {
    if (!activeEntry || leaving) return
    if (!window.confirm('Leave the queue? You will lose your place.')) return
    setLeaving(true)
    try {
      await fetch(`${API}/businesses/${activeEntry.businessId}/queues/${activeEntry.queueId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_id: activeEntry.entryId, customer_token: deviceToken.current }),
      })
    } catch { /* ignore — still clear locally */ }
    clearActiveEntry()
    setActiveEntry(null)
    activeEntryRef.current = null
    setPositionData(null)
    setAnnouncements([])
    setPinnedMessage(null)
    setLeaving(false)
    setView('browsing')
  }

  // ── Computed values ─────────────────────────────────────────────────────────

  const queuesWithLive = (business?.queues ?? []).map(q => ({
    ...q,
    current_waiting: liveCounts[q.id] ?? q.current_waiting,
    is_active: liveStatuses[q.id] ?? q.is_active,
  }))
  const activeQueues = queuesWithLive.filter(q => q.is_active)

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex flex-col">
      {/* Header */}
      <div className="bg-white/10 backdrop-blur-sm px-4 py-4 text-white text-center">
        {business ? (
          <>
            <p className="text-xs uppercase tracking-widest text-blue-100 mb-0.5">Virtual Queue</p>
            <h1 className="text-xl font-bold">{business.name}</h1>
            <p className="text-xs text-blue-200 mt-0.5">{business.address}</p>
          </>
        ) : (
          <h1 className="text-xl font-bold">Virtual Queue</h1>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 flex items-start justify-center p-4 pt-6">
        <div className="w-full max-w-sm">

          {/* ── LOADING ─────────────────────────────────────────────────── */}
          {view === 'loading' && (
            <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-500 text-sm">Loading…</p>
            </div>
          )}

          {/* ── ERROR ───────────────────────────────────────────────────── */}
          {view === 'error' && (
            <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
              <div className="text-4xl mb-3">⚠️</div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Something went wrong</h2>
              <p className="text-gray-500 text-sm">{error}</p>
            </div>
          )}

          {/* ── JOINING spinner ─────────────────────────────────────────── */}
          {view === 'joining' && (
            <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-600 font-medium">Joining queue…</p>
            </div>
          )}

          {/* ── BROWSING — queue selection ───────────────────────────────── */}
          {view === 'browsing' && (
            <div className="space-y-3">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
                  {error}
                  <button className="ml-2 underline" onClick={() => setError(null)}>Dismiss</button>
                </div>
              )}

              {activeQueues.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
                  <div className="text-4xl mb-3">🚫</div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-1">No queues open</h2>
                  <p className="text-gray-500 text-sm">All queues are currently closed. Please check back soon or ask a staff member.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between px-1 mb-1">
                    <h2 className="text-white font-semibold text-base">
                      {activeQueues.length > 0
                        ? `${activeQueues.length} queue${activeQueues.length !== 1 ? 's' : ''} open`
                        : 'No queues open right now'}
                    </h2>
                    <span className="text-blue-200 text-xs">Live updates</span>
                  </div>

                  {activeQueues.map(queue => (
                    <div key={queue.id} className="bg-white rounded-2xl shadow-xl p-5">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-bold text-gray-900 text-base">{queue.name}</h3>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                            <span className="text-xs text-gray-500">Open</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-bold text-blue-600">{queue.current_waiting}</span>
                          <p className="text-xs text-gray-400 leading-tight">waiting</p>
                        </div>
                      </div>
                      <button
                        onClick={() => joinQueue(queue.id)}
                        className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
                      >
                        Join Queue
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* ── WAITING ─────────────────────────────────────────────────── */}
          {(view === 'waiting' || view === 'called') && positionData && (
            <div className="space-y-3">
              {/* Pinned message — persistent until staff removes it */}
              {pinnedMessage && (
                <div className="bg-amber-50 border border-amber-400 rounded-xl px-4 py-3 flex gap-2 items-start">
                  <span className="text-lg flex-shrink-0">📌</span>
                  <p className="text-amber-900 text-sm font-medium">{pinnedMessage}</p>
                </div>
              )}

              {/* Announcements */}
              {announcements.map(a => (
                <div
                  key={a.id}
                  className="bg-yellow-50 border border-yellow-300 rounded-xl px-4 py-3 flex gap-2 items-start"
                >
                  <span className="text-lg flex-shrink-0">📢</span>
                  <p className="text-yellow-900 text-sm font-medium">{a.message}</p>
                  <button
                    className="ml-auto text-yellow-500 hover:text-yellow-700 text-xs flex-shrink-0"
                    onClick={() => setAnnouncements(prev => prev.filter(x => x.id !== a.id))}
                  >
                    ✕
                  </button>
                </div>
              ))}

              {/* Your turn banner */}
              {view === 'called' && (
                <div className="bg-green-500 rounded-2xl shadow-xl p-5 text-center text-white">
                  <div className="text-4xl mb-2">🎉</div>
                  <h2 className="text-xl font-bold">It's your turn!</h2>
                  <p className="text-green-100 text-sm mt-1">Please proceed to the counter.</p>
                </div>
              )}


              {/* Main position card */}
              <div className="bg-white rounded-2xl shadow-xl p-6 text-center">
                <p className="text-xs uppercase tracking-widest text-gray-400 mb-1">{positionData.queue_name}</p>

                {view === 'waiting' ? (
                  <>
                    <p className="text-sm text-gray-500 mb-1">Your position</p>
                    <div className="text-7xl font-extrabold text-blue-600 leading-none my-3">
                      #{positionData.place_in_line}
                    </div>
                    <p className="text-sm text-gray-500">
                      {positionData.current_waiting > 1
                        ? `${positionData.current_waiting} people in queue`
                        : positionData.current_waiting === 1
                        ? '1 person in queue'
                        : 'Queue is empty'}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-500 mb-1">Queue number</p>
                    <div className="text-7xl font-extrabold text-green-500 leading-none my-3">
                      #{positionData.position}
                    </div>
                    <p className="text-sm text-gray-400">You've been called — go ahead!</p>
                  </>
                )}
              </div>

              {/* Ticket info */}
              <div className="bg-white/20 backdrop-blur-sm rounded-xl px-4 py-3 flex justify-between items-center">
                <span className="text-blue-100 text-xs">Ticket #</span>
                <span className="text-white font-mono font-bold text-sm">{positionData.position}</span>
              </div>

              {/* Leave button */}
              <button
                onClick={leaveQueue}
                disabled={leaving}
                className="w-full bg-white/10 hover:bg-white/20 active:bg-white/30 text-white border border-white/30 font-medium py-3 rounded-xl transition-colors text-sm disabled:opacity-50"
              >
                {leaving ? 'Leaving…' : 'Leave Queue'}
              </button>
            </div>
          )}

          {/* ── SERVED ──────────────────────────────────────────────────── */}
          {view === 'served' && (
            <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
              <div className="text-5xl mb-4">✅</div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">All done!</h2>
              <p className="text-gray-500 text-sm mb-6">Thank you for visiting {business?.name}.</p>
              <button
                onClick={() => {
                  setPositionData(null)
                  setAnnouncements([])
                  setPinnedMessage(null)
                  setView('browsing')
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
              >
                Back to Queues
              </button>
            </div>
          )}

          {/* ── SKIPPED ─────────────────────────────────────────────────── */}
          {view === 'skipped' && (
            <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
              <div className="text-5xl mb-4">⏭️</div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">You were skipped</h2>
              <p className="text-gray-500 text-sm mb-6">
                You weren't available when called. You can rejoin the queue if you'd like.
              </p>
              <button
                onClick={() => {
                  setPositionData(null)
                  setAnnouncements([])
                  setPinnedMessage(null)
                  setView('browsing')
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors text-sm"
              >
                Rejoin Queue
              </button>
            </div>
          )}

        </div>
      </div>

      {/* Footer */}
      <div className="text-center pb-6 pt-2">
        <p className="text-blue-200/60 text-xs">Powered by Virtual Queue</p>
      </div>
    </div>
  )
}
