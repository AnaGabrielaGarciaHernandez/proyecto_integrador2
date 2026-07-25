const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api'
const EXPECTED_UNAUTHENTICATED_PATHS = new Set([
  '/auth/me',
  '/auth/login',
  '/auth/google',
])

class ApiError extends Error {
  constructor(message, status, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

const PUBLIC_ERROR_MESSAGES = {
  STOCK_UNAVAILABLE: 'No hay suficientes unidades disponibles para completar esta acción.',
  PRODUCT_UNAVAILABLE: 'Este producto ya no está disponible.',
  CART_ITEM_NOT_FOUND: 'Este producto ya no está en tu carrito.',
  CHECKOUT_CART_CHANGED: 'Tu carrito cambió mientras preparábamos el pago. Inténtalo nuevamente.',
  CHECKOUT_IN_PROGRESS: 'Tu pago sigue en proceso. Espera un momento e inténtalo nuevamente.',
  AUTHENTICATION_REQUIRED: 'Tu sesión expiró. Inicia sesión de nuevo.',
  FORBIDDEN: 'No tienes permiso para realizar esta acción.',
  CATALOG_UNAVAILABLE: 'No pudimos verificar la disponibilidad. Inténtalo de nuevo.',
  SERVICE_UNAVAILABLE: 'El servicio no está disponible por el momento.',
  NETWORK_ERROR: 'No pudimos conectarnos con EcoBazar. Inténtalo de nuevo.',
  INTERNAL_ERROR: 'Ocurrió un problema. Inténtalo de nuevo.',
  RATE_LIMITED: 'Has realizado demasiadas solicitudes. Inténtalo más tarde.',
  AVATAR_RATE_LIMITED: 'Has alcanzado el límite de cambios de foto. Inténtalo más tarde.',
  AVATAR_STORAGE_UNAVAILABLE: 'No pudimos guardar la foto por el momento. Inténtalo de nuevo.',
  PRIVACY_CONFIRMATION_REQUIRED: 'Escribe ELIMINAR para confirmar esta acción.',
  PRIVACY_EXPORT_UNAVAILABLE: 'La exportación no está disponible por el momento.',
  PRIVACY_DELETION_UNAVAILABLE: 'La eliminación no está disponible por el momento.',
  PRIVACY_SERVICE_UNAVAILABLE: 'No pudimos consultar todos tus datos por el momento.',
}

async function request(path, options = {}) {
  let response
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  }
  try {
    response = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
      ...options,
      headers,
    })
  } catch {
    throw new ApiError(PUBLIC_ERROR_MESSAGES.NETWORK_ERROR, 0, {
      code: 'NETWORK_ERROR',
    })
  }

  if (response.status === 204) {
    return null
  }

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const details = data?.error?.details
    if (response.status === 401 && !EXPECTED_UNAUTHENTICATED_PATHS.has(path)) {
      window.dispatchEvent(new Event('sesionExpirada'))
    }
    throw new ApiError(
      getPublicErrorMessage(response.status, data?.error?.message, details?.code),
      response.status,
      details,
    )
  }

  return data
}

function getPublicErrorMessage(status, remoteMessage, code) {
  if (PUBLIC_ERROR_MESSAGES[code]) return PUBLIC_ERROR_MESSAGES[code]
  if (status === 401) return PUBLIC_ERROR_MESSAGES.AUTHENTICATION_REQUIRED
  if (status === 403) return PUBLIC_ERROR_MESSAGES.FORBIDDEN
  if (status >= 500) return PUBLIC_ERROR_MESSAGES.INTERNAL_ERROR
  return remoteMessage || 'Error de conexión con EcoBazar'
}

export function get(path) {
  return request(path)
}

export function post(path, body) {
  return request(path, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function patch(path, body) {
  return request(path, {
    method: 'PATCH',
    body: isFormData(body) ? body : JSON.stringify(body),
  })
}

function isFormData(value) {
  return typeof FormData !== 'undefined' && value instanceof FormData
}

export function put(path, body) {
  return request(path, {
    method: 'PUT',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function del(path) {
  return request(path, {
    method: 'DELETE',
  })
}
