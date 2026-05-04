import { useEffect, useRef } from 'react'

const TIMEOUT_MS = 30 * 60 * 1000

export function useActivityTimeout(onTimeout: () => void) {
  const callbackRef = useRef(onTimeout)
  callbackRef.current = onTimeout

  useEffect(() => {
    let timer: number

    const reset = () => {
      clearTimeout(timer)
      timer = window.setTimeout(() => callbackRef.current(), TIMEOUT_MS)
    }

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset()

    return () => {
      clearTimeout(timer)
      events.forEach(e => window.removeEventListener(e, reset))
    }
  }, [])
}
