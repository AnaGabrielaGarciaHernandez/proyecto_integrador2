import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { hasGoogleClientId } from '../services/googleAuth'
import GoogleLoginButton from '../components/GoogleLoginButton'
import '../styles/LoginScreen.css'

export default function LoginScreen() {
  const navigate = useNavigate()
  const { login, loginWithGoogleToken } = useAuth()
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

  async function handleGoogleCredential(idToken) {
    try {
      setCargando(true)
      setError('')
      await loginWithGoogleToken(idToken)
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

        {/* Botón social */}
        <div className="login-sociales">
          {hasGoogleClientId() ? (
            <GoogleLoginButton
              text="signin_with"
              onCredential={handleGoogleCredential}
              onError={(err) => setError(err.message || 'No se pudo cargar Google login.')}
            />
          ) : (
            <button className="btn-social btn-google" disabled>
              Google no configurado
            </button>
          )}
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
