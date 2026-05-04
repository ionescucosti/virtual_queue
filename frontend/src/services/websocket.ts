import { useAuthStore, useWebSocketStore, useNotificationStore } from '../store'

const WS_BASE_URL = import.meta.env.VITE_WS_URL ||
  `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`

class WebSocketService {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private pingInterval: number | null = null
  private isStaff = false

  connect(queueId?: string, asStaff = false) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    const token = useAuthStore.getState().token
    if (!token) {
      console.error('No auth token available')
      return
    }

    this.isStaff = asStaff
    const endpoint = asStaff ? '/ws/staff' : '/ws/notify'
    const params = new URLSearchParams({ token })
    if (queueId) params.append('queue_id', queueId)

    const wsUrl = `${WS_BASE_URL}${endpoint}?${params}`

    try {
      this.ws = new WebSocket(wsUrl)
      this.setupEventHandlers()
    } catch (error) {
      console.error('WebSocket connection error:', error)
      this.handleReconnect()
    }
  }

  private setupEventHandlers() {
    if (!this.ws) return

    this.ws.onopen = () => {
      console.log('WebSocket connected')
      this.reconnectAttempts = 0
      useWebSocketStore.getState().setConnected(true)
      this.startPingInterval()
    }

    this.ws.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason)
      useWebSocketStore.getState().setConnected(false)
      this.stopPingInterval()

      if (event.code !== 1000) {
        this.handleReconnect()
      }
    }

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error)
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
    const { addNotification } = useNotificationStore.getState()
    const { setConnected, setQueueId, setQueueCount, setQueueStatus } = useWebSocketStore.getState()

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

      case 'pong':
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
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

    setTimeout(() => {
      const queueId = useWebSocketStore.getState().queueId
      this.connect(queueId || undefined, this.isStaff)
    }, delay)
  }

  private startPingInterval() {
    this.pingInterval = window.setInterval(() => {
      this.send({ type: 'ping' })
    }, 30000)
  }

  private stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  subscribeToQueue(queueId: string) {
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
}

export const wsService = new WebSocketService()

