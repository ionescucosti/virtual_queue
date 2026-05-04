import { useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store'
import { authApi } from '../services/api'
import { wsService } from '../services/websocket'

export function useAuth() {
  const navigate = useNavigate()
  const { token, user, isAuthenticated, setToken, setUser, logout } = useAuthStore()

  const login = useCallback(async (username: string, password: string) => {
    try {
      const data = await authApi.login(username, password)
      setToken(data.access_token)

      // Fetch user info
      const userData = await authApi.getMe()
      setUser(userData)

      navigate('/dashboard')
      return { success: true }
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.detail || 'Login failed',
      }
    }
  }, [setToken, setUser, navigate])

  const register = useCallback(async (data: {
    name: string
    lastname: string
    username: string
    email: string
  }) => {
    try {
      await authApi.register(data)
      return { success: true }
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.detail || 'Registration failed',
      }
    }
  }, [])

  const handleLogout = useCallback(() => {
    wsService.disconnect()
    logout()
    navigate('/login')
  }, [logout, navigate])

  const fetchUser = useCallback(async () => {
    if (token && !user) {
      try {
        const userData = await authApi.getMe()
        setUser(userData)
      } catch (error) {
        logout()
      }
    }
  }, [token, user, setUser, logout])

  useEffect(() => {
    fetchUser()
  }, [fetchUser])

  return {
    token,
    user,
    isAuthenticated,
    login,
    register,
    logout: handleLogout,
  }
}

