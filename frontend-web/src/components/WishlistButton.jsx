import { Heart } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useWishlist } from '../context/useWishlist'

export default function WishlistButton({ productId, productName, className = '' }) {
  const navigate = useNavigate()
  const { user, loading: authLoading } = useAuth()
  const { isPending, isWishlisted, ready, toggleWishlist } = useWishlist()
  const saved = isWishlisted(productId)
  const pending = isPending(productId)

  if (user?.role === 'admin') return null

  async function handleClick(event) {
    event.preventDefault()
    event.stopPropagation()
    if (!user) {
      navigate('/login')
      return
    }
    await toggleWishlist(productId)
  }

  const label = saved
    ? `Eliminar ${productName} de tu lista de deseos`
    : `Guardar ${productName} en tu lista de deseos`

  return (
    <button
      type="button"
      className={`wishlist-button ${saved ? 'wishlist-button--saved' : ''} ${className}`}
      onClick={handleClick}
      disabled={authLoading || (Boolean(user) && !ready) || pending}
      aria-label={label}
      aria-pressed={saved}
      aria-busy={pending}
      title={saved ? 'Eliminar de mi lista' : 'Guardar en mi lista'}
    >
      <Heart size={20} fill={saved ? 'currentColor' : 'none'} aria-hidden="true" />
    </button>
  )
}
