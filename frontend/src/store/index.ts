import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface User {
  id: number
  name: string
  lastname: string
  username: string
  email: string
  role: 'ADMIN' | 'MANAGER' | 'STAFF'
  is_active: boolean
  business_id: number | null
  assigned_queue_id: number | null
}

export interface Notification {
  id: string
  type: 'announcement' | 'your_turn' | 'info' | 'warning' | 'error'
  message: string
  timestamp: Date
  read: boolean
  sound?: boolean
  vibrate?: boolean
}

interface AuthState {
  token: string | null
  user: User | null
  isAuthenticated: boolean
  setToken: (token: string) => void
  setUser: (user: User) => void
  logout: () => void
}

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clearNotifications: () => void
}

interface WebSocketState {
  isConnected: boolean
  connectionId: string | null
  queueId: string | null
  queueCounts: Record<number, number>
  queueStatuses: Record<number, boolean>
  queueEntriesVersion: Record<number, number>
  setConnected: (connected: boolean, connectionId?: string) => void
  setQueueId: (queueId: string | null) => void
  setQueueCount: (queueId: number, count: number) => void
  setQueueStatus: (queueId: number, isActive: boolean) => void
  incrementEntriesVersion: (queueId: number) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      setToken: (token) => {
        localStorage.setItem('vq_active_session', 'true')
        set({ token, isAuthenticated: true })
      },
      setUser: (user) => set({ user }),
      logout: () => {
        localStorage.removeItem('vq_active_session')
        new BroadcastChannel('vq_session').postMessage({ type: 'logout' })
        set({ token: null, user: null, isAuthenticated: false })
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
)

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  addNotification: (notification) => {
    const newNotification: Notification = {
      ...notification,
      id: Date.now().toString(),
      timestamp: new Date(),
      read: false,
    }
    set((state) => ({
      notifications: [newNotification, ...state.notifications].slice(0, 50),
      unreadCount: state.unreadCount + 1,
    }))

    // Play sound if requested
    if (notification.sound) {
      playNotificationSound()
    }

    // Vibrate if requested and supported
    if (notification.vibrate && 'vibrate' in navigator) {
      navigator.vibrate([200, 100, 200])
    }
  },
  markAsRead: (id) => set((state) => ({
    notifications: state.notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    ),
    unreadCount: Math.max(0, state.unreadCount - 1),
  })),
  markAllAsRead: () => set((state) => ({
    notifications: state.notifications.map((n) => ({ ...n, read: true })),
    unreadCount: 0,
  })),
  clearNotifications: () => set({ notifications: [], unreadCount: 0 }),
}))

export const useWebSocketStore = create<WebSocketState>((set) => ({
  isConnected: false,
  connectionId: null,
  queueId: null,
  queueCounts: {},
  queueStatuses: {},
  queueEntriesVersion: {},
  setConnected: (connected, connectionId) => set({ isConnected: connected, connectionId: connectionId || null }),
  setQueueId: (queueId) => set({ queueId }),
  setQueueCount: (queueId, count) => set((state) => ({
    queueCounts: { ...state.queueCounts, [queueId]: count }
  })),
  setQueueStatus: (queueId, isActive) => set((state) => ({
    queueStatuses: { ...state.queueStatuses, [queueId]: isActive }
  })),
  incrementEntriesVersion: (queueId) => set((state) => ({
    queueEntriesVersion: { ...state.queueEntriesVersion, [queueId]: (state.queueEntriesVersion[queueId] ?? 0) + 1 }
  })),
}))

// Helper function to play notification sound
function playNotificationSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.frequency.value = 800
    oscillator.type = 'sine'
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.5)
  } catch (e) {
    console.log('Could not play notification sound:', e)
  }
}

