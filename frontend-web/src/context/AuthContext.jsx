import { useEffect, useMemo, useState } from 'react'
import { get, post } from '../services/api'
import { AuthContext } from './useAuth'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    get('/auth/me')
      .then((data) => {
        if (mounted) setUser(data.user)
      })
      .catch(() => {
        if (mounted) setUser(null)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  async function login({ email, password }) {
    const data = await post('/auth/login', { email, password })
    setUser(data.user)
    window.dispatchEvent(new Event('authActualizado'))
    return data.user
  }

  async function register({ full_name, email, password, phone }) {
    const data = await post('/auth/register', { full_name, email, password, phone })
    setUser(data.user)
    window.dispatchEvent(new Event('authActualizado'))
    return data.user
  }

  async function logout() {
    await post('/auth/logout', {})
    setUser(null)
    window.dispatchEvent(new Event('authActualizado'))
    window.dispatchEvent(new Event('carritoActualizado'))
  }

  async function loginWithGoogleToken(idToken) {
    const data = await post('/auth/google', { id_token: idToken })
    setUser(data.user)
    window.dispatchEvent(new Event('authActualizado'))
    return data.user
  }

  const value = useMemo(() => ({
    user,
    loading,
    login,
    register,
    logout,
    loginWithGoogleToken,
  }), [user, loading])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
