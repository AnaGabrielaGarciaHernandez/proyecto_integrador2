import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { User, Mail, Lock, Eye, EyeOff, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { hasGoogleClientId } from '../services/googleAuth'
import GoogleLoginButton from '../components/GoogleLoginButton'
import '../styles/RegistroScreen.css'

const EMOJIS = [
  '🌿', '🌱', '🌾', '🍃', '🌲', '🌵',
  '🌸', '🌺', '🍀', '🦋', '🌙', '⭐',
  '🔥', '💎', '🎯', '🎨', '🎸', '🚀',
  '🦊', '🦝', '🦫', '🌊', '⛰️', '🎭',
]

export default function RegistroScreen() {
  const navigate = useNavigate()
  const { register, loginWithGoogleToken } = useAuth()
  const [paso, setPaso]             = useState(1)
  const [nombre, setNombre]         = useState('')
  const [correo, setCorreo]         = useState('')
  const [contrasena, setContrasena] = useState('')
  const [verPass, setVerPass]       = useState(false)
  const [emoji, setEmoji]           = useState('🌿')
  const [toast, setToast]           = useState(false)
  const [error, setError]           = useState('')
  const [cargando, setCargando]     = useState(false)

  function handleContinuar() {
    if (!nombre || !correo || !contrasena) {
      setError('Por favor completa todos los campos.')
      return
    }
    setError('')
    setPaso(2)
  }

  async function handleConfirmar() {
    try {
      setCargando(true)
      setError('')
      await register({
        full_name: nombre,
        email: correo,
        password: contrasena,
      })
      setToast(true)
      setTimeout(() => {
        setToast(false)
        navigate('/')
      }, 1200)
    } catch (err) {
      setError(err.message || 'No se pudo crear la cuenta.')
      setPaso(1)
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
      setError(err.message || 'No se pudo continuar con Google.')
    } finally {
      setCargando(false)
    }
  }

  if (paso === 2) {
    return (
      <div>
        <div className="emoji-hero">
          <h1>Elige tu emoji</h1>
          <p>Este será tu avatar en EcoBazar</p>
        </div>

        <div className="emoji-body">
          <div className="emoji-grid">
            {EMOJIS.map(e => (
              <button
                key={e}
                className={`emoji-item ${e === emoji ? 'seleccionado' : ''}`}
                onClick={() => setEmoji(e)}
              >
                {e}
              </button>
            ))}
          </div>

          <div className="emoji-preview">
            <div className="emoji-preview-avatar">{emoji}</div>
            <div className="emoji-preview-info">
              <p>{nombre || 'Tu nombre'}</p>
              <span>Vista previa de tu perfil</span>
            </div>
          </div>

          {error && <div className="login-error">{error}</div>}

          <button className="btn-confirmar" onClick={handleConfirmar} disabled={cargando}>
            {cargando ? 'Creando cuenta...' : 'Confirmar y crear cuenta'} <ChevronRight size={18} />
          </button>
        </div>

        {toast && (
          <div className="toast-bienvenida">
            {emoji} ¡Bienvenido a EcoBazar, {nombre}!
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="registro-hero">
        <h1 className="registro-hero-titulo">Crea tu<br />cuenta.</h1>
        <p className="registro-hero-sub">Únete a la comunidad</p>
      </div>

      <div className="registro-body">

        {/* Botón social */}
        <div className="login-sociales">
          {hasGoogleClientId() ? (
            <GoogleLoginButton
              text="signup_with"
              onCredential={handleGoogleCredential}
              onError={(err) => setError(err.message || 'No se pudo cargar Google login.')}
            />
          ) : (
            <button className="btn-social btn-google" disabled>
              Google no configurado
            </button>
          )}
        </div>

        <div className="login-separador">
          <div className="login-separador-linea" />
          <span>o con correo</span>
          <div className="login-separador-linea" />
        </div>

        {error && <div className="login-error">{error}</div>}

        <div className="login-campos">
          <div className="input-wrapper">
            <User size={16} />
            <input
              type="text"
              placeholder="Nombre completo"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
            />
          </div>
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

        <p className="registro-terminos">
          Al registrarte aceptas nuestros{' '}
          <a href="#">Términos</a> y{' '}
          <a href="#">Política de privacidad</a>.
        </p>

        <button className="btn-login-principal" onClick={handleContinuar}>
          Continuar — elegir emoji <ChevronRight size={16} />
        </button>

        <p className="registro-login">
          ¿Ya tienes cuenta? <Link to="/login">Iniciar sesión</Link>
        </p>

      </div>
    </div>
  )
}
