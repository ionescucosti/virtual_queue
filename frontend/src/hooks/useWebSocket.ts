import { useEffect, useCallback } from 'react'
import { useWebSocketStore, useAuthStore } from '../store'
import { wsService } from '../services/websocket'

export function useWebSocket(queueId?: string, asStaff = false) {
  const { isConnected, connectionId } = useWebSocketStore()
  const { isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (isAuthenticated) {
      wsService.connect(queueId, asStaff)
    }
  }, [isAuthenticated, queueId, asStaff])

  const subscribeToQueue = useCallback((newQueueId: string) => {
    wsService.subscribeToQueue(newQueueId)
  }, [])

  const sendAnnouncement = useCallback((targetQueueId: string, message: string) => {
    wsService.sendAnnouncement(targetQueueId, message)
  }, [])

  const sendNotify = useCallback((targetQueueId: string, message: string) => {
    wsService.sendNotify(targetQueueId, message)
  }, [])

  const clearAnnouncement = useCallback((targetQueueId: string) => {
    wsService.clearAnnouncement(targetQueueId)
  }, [])

  const callCustomer = useCallback((customerId: string | number, message?: string) => {
    wsService.callCustomer(customerId, message)
  }, [])

  const disconnect = useCallback(() => {
    wsService.disconnect()
  }, [])

  return {
    isConnected,
    connectionId,
    subscribeToQueue,
    sendAnnouncement,
    sendNotify,
    clearAnnouncement,
    callCustomer,
    disconnect,
  }
}

