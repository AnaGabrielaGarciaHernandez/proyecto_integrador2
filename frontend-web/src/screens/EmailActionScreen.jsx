import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { post } from '../services/api'
import '../styles/RegistroScreen.css'

function getTokenFromHash() {
  const value = window.location.hash.replace(/^#/, '')
  return new URLSearchParams(value).get('token') || ''
}

export default function EmailActionScreen({ mode }) {
  const isReset = mode === 'reset'
  const [token] = useState(getTokenFromHash)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [status, setStatus] = useState(() => (isReset ? 'form' : token ? 'loading' : 'error'))
  const [error, setError] = useState(() => (
    !isReset && !token ? 'El enlace de verificación no contiene un token.' : ''
  ))

  useEffect(() => {
    if (isReset || !token) return undefined

    post('/auth/verify-email', { token })
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error')
        setError(err.message || 'No se pudo verificar el correo.')
      })
    return undefined
  }, [isReset, token])

  async function handleReset(event) {
    event.preventDefault()
    if (!token) {
      setError('El enlace para cambiar la contraseña no contiene un token.')
      return
    }
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setError('')
    try {
      await post('/auth/reset-password', { token, password })
      setStatus('success')
    } catch (err) {
      setStatus('error')
      setError(err.message || 'No se pudo cambiar la contraseña.')
    }
  }

  return (
    <div>
      <div className="login-hero">
        <h1 className="login-hero-titulo">{isReset ? <>Cambia tu<br />contraseña.</> : <>Verifica tu<br />correo.</>}</h1>
        <p className="login-hero-sub">Seguridad para tu cuenta de EcoBazar</p>
      </div>
      {isReset && status === 'form' ? (
        <form className="login-body" onSubmit={handleReset}>
          <div className="input-wrapper">
            <Lock size={16} />
            <input type="password" placeholder="Nueva contraseña" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required minLength={8} />
          </div>
          <div className="input-wrapper">
            <Lock size={16} />
            <input type="password" placeholder="Repite la contraseña" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" required minLength={8} />
          </div>
          {error && <div className="login-error" role="alert">{error}</div>}
          <button className="btn-login-principal" type="submit">Cambiar contraseña</button>
        </form>
      ) : (
        <div className="login-body">
          {status === 'loading' && <p>Validando el enlace...</p>}
          {status === 'success' && (
            <div className="registro-verificacion" role="status">
              <strong>{isReset ? 'Contraseña actualizada.' : 'Correo verificado.'}</strong>
              <p>Ya puedes continuar usando EcoBazar.</p>
              <Link to="/login">Ir a iniciar sesión</Link>
            </div>
          )}
          {status === 'error' && <div className="login-error" role="alert">{error}</div>}
          {status === 'error' && <p className="login-registro"><Link to="/recuperar">Solicitar otro enlace</Link></p>}
        </div>
      )}
    </div>
  )
}
