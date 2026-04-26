import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface User {
  id: number
  name: string
  lastname: string
  username: string
  email: string
  role: 'ADMIN' | 'OWNER' | 'STAFF'
  is_active: boolean
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
  setConnected: (connected: boolean, connectionId?: string) => void
  setQueueId: (queueId: string | null) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      setToken: (token) => set({ token, isAuthenticated: true }),
      setUser: (user) => set({ user }),
      logout: () => set({ token: null, user: null, isAuthenticated: false }),
    }),
    {
      name: 'auth-storage',
    }
  )
)

export const useNotificationStore = create<NotificationState>((set, get) => ({
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
  setConnected: (connected, connectionId) => set({ isConnected: connected, connectionId: connectionId || null }),
  setQueueId: (queueId) => set({ queueId }),
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

