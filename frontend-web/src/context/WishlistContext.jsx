import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './useAuth'
import { WishlistContext } from './useWishlist'
import {
  deleteWishlistItem,
  getWishlist,
  saveWishlistItem,
} from '../services/wishlist'

export function WishlistProvider({ children }) {
  const { user, loading: authLoading } = useAuth()
  const [wishlistedIds, setWishlistedIds] = useState(() => new Set())
  const [pendingIds, setPendingIds] = useState(() => new Set())
  const [ready, setReady] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const accountRevisionRef = useRef(0)
  const pendingRef = useRef(new Set())
  const feedbackTimerRef = useRef(null)

  const showFeedback = useCallback((message, tone = 'success') => {
    window.clearTimeout(feedbackTimerRef.current)
    setFeedback({ message, tone })
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(null), 2600)
  }, [])

  useEffect(() => () => window.clearTimeout(feedbackTimerRef.current), [])

  useEffect(() => {
    accountRevisionRef.current += 1
    const revision = accountRevisionRef.current
    pendingRef.current = new Set()
    queueMicrotask(() => {
      if (accountRevisionRef.current !== revision) return
      setPendingIds(new Set())
      setWishlistedIds(new Set())
      setReady(false)
    })

    if (authLoading) return undefined
    if (!user || user.role === 'admin') {
      queueMicrotask(() => {
        if (accountRevisionRef.current === revision) setReady(true)
      })
      return undefined
    }

    let active = true
    async function loadAll() {
      try {
        const ids = new Set()
        let offset = 0
        let total = 0
        do {
          const page = await getWishlist({ limit: 100, offset })
          page.products.forEach((product) => ids.add(product.id))
          if (page.products.length === 0) break
          offset += page.products.length
          total = page.total
        } while (offset < total && active && accountRevisionRef.current === revision)

        if (active && accountRevisionRef.current === revision) {
          setWishlistedIds(ids)
        }
      } catch {
        if (active && accountRevisionRef.current === revision) {
          showFeedback('No pudimos actualizar tu lista. Inténtalo de nuevo.', 'error')
        }
      } finally {
        if (active && accountRevisionRef.current === revision) setReady(true)
      }
    }
    loadAll()
    return () => {
      active = false
    }
  }, [authLoading, showFeedback, user])

  const toggleWishlist = useCallback(async (productId) => {
    if (authLoading || !user || user.role === 'admin') {
      return { authenticationRequired: !user, changed: false }
    }
    if (pendingRef.current.has(productId)) return { changed: false }

    const revision = accountRevisionRef.current
    const accountId = user.id
    const wasWishlisted = wishlistedIds.has(productId)
    pendingRef.current = new Set(pendingRef.current).add(productId)
    setPendingIds(new Set(pendingRef.current))
    setWishlistedIds((current) => {
      const next = new Set(current)
      if (wasWishlisted) next.delete(productId)
      else next.add(productId)
      return next
    })

    try {
      if (wasWishlisted) await deleteWishlistItem(productId)
      else await saveWishlistItem(productId)
      if (accountRevisionRef.current !== revision || user.id !== accountId) {
        return { changed: false }
      }
      showFeedback(wasWishlisted ? 'Eliminado de tu lista' : 'Guardado en tu lista')
      return { changed: true, isWishlisted: !wasWishlisted }
    } catch {
      if (accountRevisionRef.current === revision && user.id === accountId) {
        setWishlistedIds((current) => {
          const next = new Set(current)
          if (wasWishlisted) next.add(productId)
          else next.delete(productId)
          return next
        })
        showFeedback('No pudimos actualizar tu lista. Inténtalo de nuevo.', 'error')
      }
      return { changed: false }
    } finally {
      if (accountRevisionRef.current === revision) {
        pendingRef.current = new Set(pendingRef.current)
        pendingRef.current.delete(productId)
        setPendingIds(new Set(pendingRef.current))
      }
    }
  }, [authLoading, showFeedback, user, wishlistedIds])

  const hidePurchased = useCallback((productIds) => {
    setWishlistedIds((current) => {
      const next = new Set(current)
      productIds.forEach((id) => next.delete(id))
      return next
    })
  }, [])

  const value = useMemo(() => ({
    count: wishlistedIds.size,
    hidePurchased,
    isPending: (productId) => pendingIds.has(productId),
    isWishlisted: (productId) => wishlistedIds.has(productId),
    ready,
    toggleWishlist,
  }), [hidePurchased, pendingIds, ready, toggleWishlist, wishlistedIds])

  return (
    <WishlistContext.Provider value={value}>
      {children}
      {feedback && (
        <div
          className={`wishlist-feedback wishlist-feedback--${feedback.tone}`}
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {feedback.message}
        </div>
      )}
    </WishlistContext.Provider>
  )
}
