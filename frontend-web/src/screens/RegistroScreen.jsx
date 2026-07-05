import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { User, Mail, Lock, Eye, EyeOff, ChevronRight } from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { hasGoogleClientId } from '../services/googleAuth'
import '../styles/RegistroScreen.css'

const EMOJIS = [
  '🌿', '🌱', '🌾', '🍃', '🌲', '🌵',
  '🌸', '🌺', '🍀', '🦋', '🌙', '⭐',
  '🔥', '💎', '🎯', '🎨', '🎸', '🚀',
  '🦊', '🦝', '🦫', '🌊', '⛰️', '🎭',
]

export default function RegistroScreen() {
  const navigate = useNavigate()
  const { register, loginWithGoogle } = useAuth()
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

  async function handleGoogle() {
    try {
      setCargando(true)
      setError('')
      await loginWithGoogle()
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

        {/* Botones sociales */}
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
            {hasGoogleClientId() ? 'Registrarse con Google' : 'Google no configurado'}
          </button>
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
