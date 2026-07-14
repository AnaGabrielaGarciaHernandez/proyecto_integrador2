import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { get, patch, post } from '../services/api'
import { AuthContext } from './useAuth'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const userRef = useRef(null)
  const sessionRevisionRef = useRef(0)
  const preferenceRequestRef = useRef(0)

  const invalidatePendingPreferences = useCallback(() => {
    preferenceRequestRef.current += 1
  }, [])

  const commitSessionUser = useCallback((nextUser) => {
    sessionRevisionRef.current += 1
    preferenceRequestRef.current += 1
    userRef.current = nextUser
    setUser(nextUser)
  }, [])

  useEffect(() => {
    let mounted = true
    const sessionRevision = sessionRevisionRef.current

    get('/auth/me')
      .then((data) => {
        if (mounted && sessionRevisionRef.current === sessionRevision) {
          commitSessionUser(data.user)
        }
      })
      .catch(() => {
        if (mounted && sessionRevisionRef.current === sessionRevision) {
          commitSessionUser(null)
        }
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [commitSessionUser])

  const login = useCallback(async ({ email, password }) => {
    invalidatePendingPreferences()
    const data = await post('/auth/login', { email, password })
    commitSessionUser(data.user)
    window.dispatchEvent(new Event('authActualizado'))
    return data.user
  }, [commitSessionUser, invalidatePendingPreferences])

  const register = useCallback(async ({ full_name, email, password, phone }) => {
    invalidatePendingPreferences()
    const data = await post('/auth/register', { full_name, email, password, phone })
    commitSessionUser(data.user)
    window.dispatchEvent(new Event('authActualizado'))
    return data.user
  }, [commitSessionUser, invalidatePendingPreferences])

  const logout = useCallback(async () => {
    invalidatePendingPreferences()
    await post('/auth/logout', {})
    commitSessionUser(null)
    window.dispatchEvent(new Event('authActualizado'))
    window.dispatchEvent(new Event('carritoActualizado'))
  }, [commitSessionUser, invalidatePendingPreferences])

  const loginWithGoogleToken = useCallback(async (idToken) => {
    invalidatePendingPreferences()
    const data = await post('/auth/google', { id_token: idToken })
    commitSessionUser(data.user)
    window.dispatchEvent(new Event('authActualizado'))
    return data.user
  }, [commitSessionUser, invalidatePendingPreferences])

  const updatePreferences = useCallback(async (preferences) => {
    const currentUser = userRef.current
    if (!currentUser) {
      throw new Error('Debes iniciar sesión para cambiar tus preferencias.')
    }

    const sessionRevision = sessionRevisionRef.current
    const requestRevision = preferenceRequestRef.current + 1
    preferenceRequestRef.current = requestRevision

    const data = await patch('/auth/preferences', preferences)
    const isCurrentResponse = (
      sessionRevisionRef.current === sessionRevision
      && preferenceRequestRef.current === requestRevision
      && userRef.current?.id === currentUser.id
    )

    if (!isCurrentResponse) return null

    userRef.current = data.user
    setUser(data.user)
    return data.user
  }, [])

  const value = useMemo(() => ({
    user,
    loading,
    login,
    register,
    logout,
    loginWithGoogleToken,
    updatePreferences,
  }), [
    user,
    loading,
    login,
    register,
    logout,
    loginWithGoogleToken,
    updatePreferences,
  ])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
