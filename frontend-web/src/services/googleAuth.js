const GOOGLE_SCRIPT_ID = 'google-identity-services'

let initializedClientId = null
let activeOnCredential = null
let activeOnError = null

export function hasGoogleClientId() {
  return Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID)
}

export async function renderGoogleButton(container, { text = 'signin_with', onCredential, onError }) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

  if (!clientId) {
    onError?.(new Error('Google login no está configurado'))
    return
  }

  try {
    await loadGoogleScript()

    if (!window.google?.accounts?.id) {
      throw new Error('Google Identity Services no está disponible')
    }

    initializeGoogleIdentity(clientId, { onCredential, onError })

    container.innerHTML = ''
    window.google.accounts.id.renderButton(container, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text,
      shape: 'rectangular',
      logo_alignment: 'left',
      locale: 'es',
    })
  } catch (error) {
    onError?.(error)
  }
}

export function requestGoogleIdToken() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

  if (!clientId) {
    return Promise.reject(new Error('Google login no está configurado'))
  }

  return loadGoogleScript().then(() => new Promise((resolve, reject) => {
    if (!window.google?.accounts?.id) {
      reject(new Error('Google Identity Services no está disponible'))
      return
    }

    initializeGoogleIdentity(clientId, {
      onCredential: resolve,
      onError: reject,
    })

    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        reject(new Error('No se pudo abrir Google login'))
      }
    })
  }))
}

function loadGoogleScript() {
  if (window.google?.accounts?.id) {
    return Promise.resolve()
  }

  const existing = document.getElementById(GOOGLE_SCRIPT_ID)
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', resolve, { once: true })
      existing.addEventListener('error', reject, { once: true })
    })
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.id = GOOGLE_SCRIPT_ID
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = resolve
    script.onerror = () => reject(new Error('No se pudo cargar Google Identity Services'))
    document.head.appendChild(script)
  })
}

function initializeGoogleIdentity(clientId, { onCredential, onError }) {
  activeOnCredential = onCredential
  activeOnError = onError

  if (initializedClientId === clientId) {
    return
  }

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: handleCredentialResponse,
  })
  initializedClientId = clientId
}

function handleCredentialResponse(response) {
  if (response.credential) {
    activeOnCredential?.(response.credential)
    return
  }

  activeOnError?.(new Error('Google no devolvió credenciales'))
}
