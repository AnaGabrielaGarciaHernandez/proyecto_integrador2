import { createContext, useContext } from 'react'

export const WishlistContext = createContext(null)

export function useWishlist() {
  const context = useContext(WishlistContext)
  if (!context) throw new Error('useWishlist must be used inside WishlistProvider')
  return context
}
