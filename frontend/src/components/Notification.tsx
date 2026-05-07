import { useEffect, useState } from 'react'
import { useNotificationStore, Notification } from '../store'

export function NotificationToast() {
  const { notifications, markAsRead } = useNotificationStore()
  const [visible, setVisible] = useState<Notification | null>(null)

  useEffect(() => {
    const unread = notifications.find(n => !n.read)
    if (unread && unread !== visible) {
      setVisible(unread)

      // Auto-hide after 5 seconds for non-critical notifications
      if (unread.type !== 'your_turn') {
        setTimeout(() => {
          markAsRead(unread.id)
          setVisible(null)
        }, 5000)
      }
    }
  }, [notifications, markAsRead, visible])

  if (!visible) return null

  const bgColor = {
    announcement: 'bg-blue-600',
    your_turn: 'bg-green-500',
    info: 'bg-gray-700',
    warning: 'bg-yellow-500',
    error: 'bg-red-500',
  }[visible.type]

  const icon = {
    announcement: '📢',
    your_turn: '🎉',
    info: 'ℹ️',
    warning: '⚠️',
    error: '❌',
  }[visible.type]

  return (
    <div className="fixed top-0 left-0 right-0 z-50 p-4 safe-top">
      <div
        className={`${bgColor} rounded-xl shadow-2xl p-4 mx-auto max-w-md animate-slide-in`}
        onClick={() => {
          markAsRead(visible.id)
          setVisible(null)
        }}
      >
        <div className="flex items-start gap-3">
          <span className="text-2xl">{icon}</span>
          <div className="flex-1">
            <p className="text-white font-semibold text-lg">
              {visible.type === 'your_turn' ? "It's Your Turn!" : 'Notification'}
            </p>
            <p className="text-white/90 mt-1">{visible.message}</p>
          </div>
          <button
            className="text-white/70 hover:text-white text-xl"
            onClick={(e) => {
              e.stopPropagation()
              markAsRead(visible.id)
              setVisible(null)
            }}
          >
            ×
          </button>
        </div>

        {visible.type === 'your_turn' && (
          <div className="mt-4 flex justify-center">
            <div className="relative">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                <span className="text-3xl">🎫</span>
              </div>
              <div className="absolute inset-0 rounded-full bg-white/30 animate-pulse-ring"></div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function NotificationBell() {
  const { unreadCount, notifications, markAllAsRead } = useNotificationStore()
  const [showList, setShowList] = useState(false)

  return (
    <div className="relative">
      <button
        className="relative p-2 text-gray-600 hover:text-gray-900"
        onClick={() => setShowList(!showList)}
      >
        <span className="text-xl">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showList && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl z-50 max-h-96 overflow-y-auto">
          <div className="p-3 border-b flex justify-between items-center">
            <span className="font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <button
                className="text-sm text-blue-600"
                onClick={() => markAllAsRead()}
              >
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="p-4 text-gray-500 text-center">No notifications</p>
          ) : (
            notifications.slice(0, 10).map((n) => (
              <div
                key={n.id}
                className={`p-3 border-b last:border-0 ${n.read ? 'bg-white' : 'bg-blue-50'}`}
              >
                <p className="text-sm">{n.message}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(n.timestamp).toLocaleTimeString()}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

