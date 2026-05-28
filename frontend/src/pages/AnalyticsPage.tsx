import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { apiHelpers } from '../services/api'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'

// ── Types ────────────────────────────────────────────────────────────────────

interface Business { id: number; name: string }
interface Queue    { id: number; name: string }

interface HourBucket { hour: number; count: number }
interface DaySession {
  date: string
  total_joined: number
  served: number
  skipped: number
  abandoned: number
  abandonment_rate: number
  avg_wait_minutes: number | null
  peak_hour: number | null
  hours_breakdown: HourBucket[]
}
interface AnalyticsData {
  queue_id: number
  queue_name: string
  repeat_visitors_last_90_days: number
  sessions: DaySession[]
}

const RANGES = [
  { label: 'Today',   days: 1  },
  { label: '7 days',  days: 7  },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatHour(h: number) {
  if (h === 0)  return '12 AM'
  if (h < 12)  return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }: {
  label: string; value: string | number; sub?: string; color: string
}) {
  const colors: Record<string, string> = {
    blue:   'bg-blue-50 text-blue-600',
    green:  'bg-green-50 text-green-600',
    red:    'bg-red-50 text-red-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
    yellow: 'bg-yellow-50 text-yellow-600',
  }
  return (
    <div className={`rounded-xl p-5 ${colors[color]}`}>
      <p className="text-sm font-medium opacity-80 mb-1">{label}</p>
      <p className="text-3xl font-bold">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center h-48 bg-gray-50 rounded-xl text-gray-400 text-sm">
      {message}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function AnalyticsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [businesses, setBusinesses]   = useState<Business[]>([])
  const [queues, setQueues]           = useState<Queue[]>([])
  const [data, setData]               = useState<AnalyticsData | null>(null)
  const [isLoading, setIsLoading]     = useState(false)
  const [error, setError]             = useState('')

  const selectedBusiness = searchParams.get('business_id') ? Number(searchParams.get('business_id')) : null
  const selectedQueue    = searchParams.get('queue_id')    ? Number(searchParams.get('queue_id'))    : null
  const selectedRange    = Number(searchParams.get('range') ?? '30')

  // Load businesses on mount
  useEffect(() => {
    apiHelpers.get('/api/businesses').then(setBusinesses).catch(() => {})
  }, [])

  // Load queues when business changes
  useEffect(() => {
    if (!selectedBusiness) { setQueues([]); return }
    apiHelpers.get(`/api/businesses/${selectedBusiness}/queues`).then(setQueues).catch(() => setQueues([]))
  }, [selectedBusiness])

  // Load analytics when queue changes
  useEffect(() => {
    if (!selectedBusiness || !selectedQueue) { setData(null); return }
    setIsLoading(true)
    setError('')
    apiHelpers
      .get(`/api/businesses/${selectedBusiness}/queues/${selectedQueue}/analytics`)
      .then(setData)
      .catch(() => setError('Failed to load analytics'))
      .finally(() => setIsLoading(false))
  }, [selectedBusiness, selectedQueue])

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    next.set(key, value)
    if (key === 'business_id') next.delete('queue_id')
    setSearchParams(next)
  }

  // Filter sessions to selected range
  const sessions = useMemo(() => {
    if (!data) return []
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - selectedRange)
    return data.sessions.filter(s => new Date(s.date) >= cutoff)
  }, [data, selectedRange])

  // KPIs
  const kpis = useMemo(() => {
    if (!sessions.length) return null
    const total    = sessions.reduce((s, d) => s + d.total_joined, 0)
    const served   = sessions.reduce((s, d) => s + d.served, 0)
    const skipped  = sessions.reduce((s, d) => s + d.skipped, 0)
    const abandoned = sessions.reduce((s, d) => s + d.abandoned, 0)
    const waitTimes = sessions.filter(d => d.avg_wait_minutes !== null).map(d => d.avg_wait_minutes!)
    const avgWait  = waitTimes.length ? Math.round(waitTimes.reduce((a, b) => a + b) / waitTimes.length) : null
    const abandonRate = total > 0 ? Math.round((abandoned / total) * 100) : 0
    return { total, served, skipped, abandoned, avgWait, abandonRate }
  }, [sessions])

  // Daily trend data
  const dailyData = useMemo(() =>
    [...sessions].reverse().map(s => ({
      date: formatDate(s.date),
      Joined: s.total_joined,
      Served: s.served,
      Skipped: s.skipped,
      Abandoned: s.abandoned,
    })),
  [sessions])

  // Aggregate hourly distribution across selected period
  const hourlyData = useMemo(() => {
    const map: Record<number, number> = {}
    sessions.forEach(s => s.hours_breakdown.forEach(({ hour, count }) => {
      map[hour] = (map[hour] ?? 0) + count
    }))
    return Array.from({ length: 24 }, (_, h) => ({
      hour: formatHour(h),
      Customers: map[h] ?? 0,
    }))
  }, [sessions])

  const peakHour = useMemo(() => {
    const best = hourlyData.reduce((a, b) => b.Customers > a.Customers ? b : a, hourlyData[0])
    return best?.Customers > 0 ? best.hour : null
  }, [hourlyData])

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-500 text-sm mt-1">
            Customer behaviour, peak hours, and queue performance insights.
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-4 items-center">
          {/* Business selector */}
          <select
            value={selectedBusiness ?? ''}
            onChange={e => setParam('business_id', e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none min-w-44"
          >
            <option value="">Select business…</option>
            {businesses.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          {/* Queue selector */}
          <select
            value={selectedQueue ?? ''}
            onChange={e => setParam('queue_id', e.target.value)}
            disabled={!selectedBusiness}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none min-w-44 disabled:opacity-50"
          >
            <option value="">Select queue…</option>
            {queues.map(q => (
              <option key={q.id} value={q.id}>{q.name}</option>
            ))}
          </select>

          {/* Time range */}
          <div className="flex gap-1 ml-auto">
            {RANGES.map(r => (
              <button
                key={r.days}
                onClick={() => setParam('range', String(r.days))}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  selectedRange === r.days
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {/* States */}
        {!selectedBusiness && (
          <EmptyState message="Select a business and queue to view analytics." />
        )}
        {selectedBusiness && !selectedQueue && (
          <EmptyState message="Select a queue to view analytics." />
        )}
        {isLoading && (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent" />
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl text-sm">{error}</div>
        )}

        {/* Content */}
        {!isLoading && data && (
          <>
            {sessions.length === 0 ? (
              <EmptyState message="No data for the selected period. Activate the queue to start collecting data." />
            ) : (
              <>
                {/* KPI cards */}
                {kpis && (
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                    <KpiCard label="Total customers"   value={kpis.total}                              color="blue"   />
                    <KpiCard label="Served"            value={kpis.served}                             color="green"  />
                    <KpiCard label="Skipped"           value={kpis.skipped}                            color="yellow" />
                    <KpiCard label="Left early"        value={kpis.abandoned}                          color="red"    />
                    <KpiCard label="Abandonment rate"  value={`${kpis.abandonRate}%`}                  color="orange" />
                    <KpiCard
                      label="Avg wait to bar"
                      value={kpis.avgWait !== null ? `${kpis.avgWait} min` : '—'}
                      sub={peakHour ? `Peak: ${peakHour}` : undefined}
                      color="purple"
                    />
                  </div>
                )}

                {/* Repeat visitors */}
                {data.repeat_visitors_last_90_days > 0 && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-3 flex items-center gap-3">
                    <span className="text-2xl font-bold text-blue-600">{data.repeat_visitors_last_90_days}</span>
                    <p className="text-sm text-blue-700">
                      returning visitors identified in the last 90 days
                      <span className="block text-xs text-blue-500 font-normal">
                        Anonymous device fingerprint only — no personal data stored.
                      </span>
                    </p>
                  </div>
                )}

                {/* Daily trend */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-base font-semibold text-gray-800 mb-4">Daily customer volume</h2>
                  {dailyData.length < 2 ? (
                    <EmptyState message="Not enough data yet for a trend chart." />
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={dailyData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="Joined"    stroke="#3b82f6" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="Served"    stroke="#22c55e" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="Skipped"   stroke="#eab308" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="Abandoned" stroke="#ef4444" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Hourly distribution */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-base font-semibold text-gray-800 mb-1">Peak hours</h2>
                  <p className="text-xs text-gray-500 mb-4">
                    Aggregated customer arrivals by hour of day for the selected period.
                    {peakHour && <span className="ml-1 font-medium text-blue-600">Busiest: {peakHour}</span>}
                  </p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={hourlyData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={1} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="Customers" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Daily breakdown table */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h2 className="text-base font-semibold text-gray-800 mb-4">Day-by-day breakdown</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-4 py-2 text-left font-medium text-gray-600">Date</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-600">Joined</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-600">Served</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-600">Skipped</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-600">Left early</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-600">Abandon %</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-600">Avg wait</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-600">Peak hour</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {[...sessions].reverse().map(s => (
                          <tr key={s.date} className="hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-900 font-medium">{formatDate(s.date)}</td>
                            <td className="px-4 py-2 text-right text-gray-700">{s.total_joined}</td>
                            <td className="px-4 py-2 text-right text-green-600">{s.served}</td>
                            <td className="px-4 py-2 text-right text-yellow-600">{s.skipped}</td>
                            <td className="px-4 py-2 text-right text-red-500">{s.abandoned}</td>
                            <td className="px-4 py-2 text-right">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                s.abandonment_rate > 30 ? 'bg-red-100 text-red-700' :
                                s.abandonment_rate > 10 ? 'bg-orange-100 text-orange-700' :
                                'bg-green-100 text-green-700'
                              }`}>
                                {s.abandonment_rate}%
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right text-gray-600">
                              {s.avg_wait_minutes !== null ? `${s.avg_wait_minutes} min` : '—'}
                            </td>
                            <td className="px-4 py-2 text-right text-gray-600">
                              {s.peak_hour !== null ? formatHour(s.peak_hour) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
