import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { hasGoogleClientId } from '../services/googleAuth'
import '../styles/LoginScreen.css'

export default function LoginScreen() {
  const navigate = useNavigate()
  const { login, loginWithGoogle } = useAuth()
  const [correo, setCorreo]         = useState('')
  const [contrasena, setContrasena] = useState('')
  const [verPass, setVerPass]       = useState(false)
  const [error, setError]           = useState('')
  const [cargando, setCargando]     = useState(false)

  async function handleLogin() {
    try {
      setCargando(true)
      setError('')
      await login({ email: correo, password: contrasena })
      navigate('/')
    } catch (err) {
      setError(err.message || 'Correo o contraseña incorrectos.')
    } finally {
      setCargando(false)
    }
  }

  async function handleGoogle() {
    try {
      setCargando(true)
      setError('')
      await loginWithGoogle()
      navigate('/')
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión con Google.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <div>
      <div className="login-hero">
        <h1 className="login-hero-titulo">Bienvenido<br />de vuelta.</h1>
        <p className="login-hero-sub">Inicia sesión para continuar explorando</p>
      </div>

      <div className="login-body">

        {/* Botones sociales con SVG reales */}
        <div className="login-sociales">
          <button
            className="btn-social btn-google"
            onClick={handleGoogle}
            disabled={cargando || !hasGoogleClientId()}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {hasGoogleClientId() ? 'Continuar con Google' : 'Google no configurado'}
          </button>

          <button className="btn-social btn-apple">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98l-.09.06c-.22.15-2.19 1.28-2.17 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            Continuar con Apple
          </button>

          <button className="btn-social btn-facebook">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Continuar con Facebook
          </button>
        </div>

        {/* Separador */}
        <div className="login-separador">
          <div className="login-separador-linea" />
          <span>o con correo</span>
          <div className="login-separador-linea" />
        </div>

        {/* Error */}
        {error && <div className="login-error">{error}</div>}

        {/* Campos */}
        <div className="login-campos">
          <div className="input-wrapper">
            <Mail size={16} />
            <input
              type="email"
              placeholder="Correo electrónico"
              value={correo}
              onChange={e => setCorreo(e.target.value)}
            />
          </div>

          <div className="input-wrapper">
            <Lock size={16} />
            <input
              type={verPass ? 'text' : 'password'}
              placeholder="Contraseña"
              value={contrasena}
              onChange={e => setContrasena(e.target.value)}
            />
            <button className="btn-ojo" onClick={() => setVerPass(!verPass)}>
              {verPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="login-olvide">
          <a href="#">¿Olvidaste tu contraseña?</a>
        </div>

        <button className="btn-login-principal" onClick={handleLogin} disabled={cargando}>
          {cargando ? 'Iniciando...' : 'Iniciar sesión'}
        </button>

        <p className="login-registro">
          ¿Sin cuenta? <Link to="/registro">Regístrate gratis</Link>
        </p>

      </div>
    </div>
  )
}
