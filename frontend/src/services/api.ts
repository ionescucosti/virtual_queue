import axios from 'axios'
import { useAuthStore } from '../store'

const API_BASE_URL = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Don't redirect on 401 for login endpoint (user entered wrong credentials)
    const isLoginRequest = error.config?.url?.includes('/auth/login')

    if (error.response?.status === 401 && !isLoginRequest) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Auth API
export const authApi = {
  login: async (username: string, password: string) => {
    const formData = new URLSearchParams()
    formData.append('username', username)
    formData.append('password', password)

    const response = await api.post('/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    return response.data
  },

  register: async (data: {
    name: string
    lastname: string
    username: string
    email: string
  }) => {
    const formData = new URLSearchParams()
    Object.entries(data).forEach(([key, value]) => {
      formData.append(key, value)
    })

    const response = await api.post('/auth/register', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    return response.data
  },

  getMe: async () => {
    const response = await api.get('/auth/me')
    return response.data
  },
}

// Health API
export const healthApi = {
  check: async () => {
    const response = await api.get('/api/health')
    return response.data
  },
}

// Generic API helpers
export const apiHelpers = {
  get: async (url: string) => {
    const response = await api.get(url)
    return response.data
  },
  post: async (url: string, data: any) => {
    const response = await api.post(url, data)
    return response.data
  },
  put: async (url: string, data: any) => {
    const response = await api.put(url, data)
    return response.data
  },
  delete: async (url: string) => {
    const response = await api.delete(url)
    return response.data
  },
  patch: async (url: string, data: any) => {
    const response = await api.patch(url, data)
    return response.data
  },
}

export default api

