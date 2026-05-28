import { useAuthStore, useWebSocketStore, useNotificationStore } from '../store'

const WS_BASE_URL = import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`

class WebSocketService {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 1000
  private pingInterval: number | null = null
  private pongTimeout: number | null = null
  private isStaff = false
  private lastQueueId: string | undefined = undefined
  private lastPongTime = 0
  private visibilityHandler: (() => void) | null = null
  private onlineHandler: (() => void) | null = null
  private offlineHandler: (() => void) | null = null

  constructor() {
    this.setupGlobalEventListeners()
  }

  private setupGlobalEventListeners() {
    // Page Visibility API - reconnect when page becomes visible
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        console.log('[WS Service] Page became visible, checking connection...')
        this.checkAndReconnect()
      }
    }
    document.addEventListener('visibilitychange', this.visibilityHandler)

    // Network change detection
    this.onlineHandler = () => {
      console.log('[WS Service] Network online, reconnecting...')
      setTimeout(() => this.checkAndReconnect(), 1000)
    }
    this.offlineHandler = () => {
      console.log('[WS Service] Network offline')
      useWebSocketStore.getState().setConnected(false)
    }
    window.addEventListener('online', this.onlineHandler)
    window.addEventListener('offline', this.offlineHandler)

    // iOS Safari: handle page show (back-forward cache)
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        console.log('[WS Service] Page restored from bfcache, reconnecting...')
        this.forceReconnect()
      }
    })

    // iOS Safari: handle focus (app switching)
    window.addEventListener('focus', () => {
      console.log('[WS Service] Window focused, checking connection...')
      setTimeout(() => this.checkAndReconnect(), 500)
    })
  }

  private checkAndReconnect() {
    const isConnected = this.ws && this.ws.readyState === WebSocket.OPEN
    const timeSinceLastPong = Date.now() - this.lastPongTime

    // If no pong received in last 45 seconds, connection is probably dead
    if (!isConnected || (this.lastPongTime > 0 && timeSinceLastPong > 45000)) {
      console.log('[WS Service] Connection stale or dead, forcing reconnect')
      this.forceReconnect()
    } else {
      // Send immediate ping to verify connection
      this.send({ type: 'ping' })
    }
  }

  private forceReconnect() {
    this.stopPingInterval()
    if (this.ws) {
      try {
        this.ws.close()
      } catch (e) {
        // Ignore
      }
      this.ws = null
    }
    this.reconnectAttempts = 0
    const token = useAuthStore.getState().token
    if (token) {
      this.connect(this.lastQueueId, this.isStaff)
    }
  }

  connect(queueId?: string, asStaff = false) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      console.log('[WS Service] Already connected/connecting')
      return
    }

    const token = useAuthStore.getState().token
    if (!token) {
      console.error('[WS Service] No auth token available')
      return
    }

    this.isStaff = asStaff
    this.lastQueueId = queueId
    const endpoint = asStaff ? '/ws/staff' : '/ws/notify'
    const params = new URLSearchParams({ token })
    if (queueId) params.append('queue_id', queueId)

    const wsUrl = `${WS_BASE_URL}${endpoint}?${params}`
    console.log('[WS Service] Connecting to:', endpoint, 'asStaff:', asStaff)

    try {
      this.ws = new WebSocket(wsUrl)
      this.setupEventHandlers()
    } catch (error) {
      console.error('[WS Service] WebSocket connection error:', error)
      this.handleReconnect()
    }
  }

  private setupEventHandlers() {
    if (!this.ws) return

    this.ws.onopen = () => {
      console.log('[WS Service] WebSocket connected, isStaff:', this.isStaff)
      this.reconnectAttempts = 0
      this.lastPongTime = Date.now()
      useWebSocketStore.getState().setConnected(true)
      this.startPingInterval()
    }

    this.ws.onclose = (event) => {
      console.log('[WS Service] WebSocket closed:', event.code, event.reason)
      useWebSocketStore.getState().setConnected(false)
      this.stopPingInterval()

      if (event.code !== 1000) {
        this.handleReconnect()
      }
    }

    this.ws.onerror = (error) => {
      console.error('[WS Service] WebSocket error:', error)
    }

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        this.handleMessage(data)
      } catch (error) {
        console.error('Error parsing WebSocket message:', error)
      }
    }
  }

  private handleMessage(data: any) {
    console.log('[WS Service] Received message:', data)
    const { addNotification } = useNotificationStore.getState()
    const { setConnected, setQueueId, setQueueCount, setQueueStatus, incrementEntriesVersion } = useWebSocketStore.getState()

    switch (data.type) {
      case 'connected':
        setConnected(true, data.connection_id)
        if (data.queue_id) {
          setQueueId(data.queue_id)
        }
        break

      case 'subscribed':
        setQueueId(data.queue_id)
        break

      case 'announcement':
        addNotification({
          type: 'announcement',
          message: data.message,
          sound: true,
          vibrate: true,
        })
        break

      case 'your_turn':
        addNotification({
          type: 'your_turn',
          message: data.message || "It's your turn!",
          sound: true,
          vibrate: true,
        })
        break

      case 'position_update':
        addNotification({
          type: 'info',
          message: `Your position: #${data.position}`,
        })
        break

      case 'queue_count_update':
        setQueueCount(data.queue_id, data.current_waiting)
        break

      case 'queue_status_update':
        setQueueStatus(data.queue_id, data.is_active)
        break

      case 'queue_entries_changed':
        incrementEntriesVersion(data.queue_id)
        break

      case 'pong':
        this.lastPongTime = Date.now()
        this.clearPongTimeout()
        break

      case 'announce_sent':
        console.log(`Announcement sent to ${data.recipients} recipients`)
        break

      default:
        console.log('Unknown message type:', data.type, data)
    }
  }

  private handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached')
      // Reset after a longer delay to allow manual recovery
      setTimeout(() => {
        this.reconnectAttempts = 0
      }, 60000)
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000)

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

    setTimeout(() => {
      this.connect(this.lastQueueId, this.isStaff)
    }, delay)
  }

  private startPingInterval() {
    // Ping every 15 seconds (more frequent for mobile Safari)
    this.pingInterval = window.setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' })
        this.startPongTimeout()
      }
    }, 15000)
  }

  private startPongTimeout() {
    this.clearPongTimeout()
    // If no pong received within 10 seconds, assume connection is dead
    this.pongTimeout = window.setTimeout(() => {
      console.log('[WS Service] Pong timeout, connection appears dead')
      const timeSinceLastPong = Date.now() - this.lastPongTime
      if (timeSinceLastPong > 20000) {
        this.forceReconnect()
      }
    }, 10000)
  }

  private clearPongTimeout() {
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout)
      this.pongTimeout = null
    }
  }

  private stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
    this.clearPongTimeout()
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    } else {
      console.log('[WS Service] WebSocket not ready, state:', this.ws?.readyState)
    }
  }

  subscribeToQueue(queueId: string) {
    this.lastQueueId = queueId
    this.send({
      type: 'subscribe_queue',
      queue_id: queueId,
    })
  }

  sendAnnouncement(queueId: string, message: string) {
    this.send({
      type: 'announce',
      queue_id: queueId,
      message,
    })
  }

  sendNotify(queueId: string, message: string) {
    this.send({
      type: 'notify',
      queue_id: queueId,
      message,
    })
  }

  clearAnnouncement(queueId: string) {
    this.send({
      type: 'clear_announcement',
      queue_id: queueId,
    })
  }

  callCustomer(customerId: string | number, message?: string) {
    this.send({
      type: 'call_customer',
      customer_id: customerId,
      message: message || "It's your turn!",
    })
  }

  disconnect() {
    this.stopPingInterval()
    if (this.ws) {
      this.ws.close(1000, 'User disconnected')
      this.ws = null
    }
    useWebSocketStore.getState().setConnected(false)
  }

  // Cleanup method for when the service is no longer needed
  destroy() {
    this.disconnect()
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler)
    }
    if (this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler)
    }
    if (this.offlineHandler) {
      window.removeEventListener('offline', this.offlineHandler)
    }
  }
}

export const wsService = new WebSocketService()

