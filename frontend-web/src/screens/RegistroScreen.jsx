import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ChevronRight,
  ImagePlus,
} from 'lucide-react'
import { useAuth } from '../context/useAuth'
import { hasGoogleClientId } from '../services/googleAuth'
import GoogleLoginButton from '../components/GoogleLoginButton'
import { createAvatarPreview, validateAvatarFile } from '../services/avatar'
import '../styles/RegistroScreen.css'

export default function RegistroScreen() {
  const navigate = useNavigate()
  const { register, loginWithGoogleToken, updateProfile } = useAuth()
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [verPass, setVerPass] = useState(false)
  const [mostrarAvatarModal, setMostrarAvatarModal] = useState(false)
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState('')
  const [avatarError, setAvatarError] = useState('')
  const [avatarCargando, setAvatarCargando] = useState(false)
  const [toast, setToast] = useState(false)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const avatarInputRef = useRef(null)
  const avatarPreviewRef = useRef(null)
  const modalRef = useRef(null)
  const toastTimerRef = useRef(null)

  useEffect(() => () => {
    if (avatarPreviewRef.current) URL.revokeObjectURL(avatarPreviewRef.current)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
  }, [])

  useEffect(() => {
    if (mostrarAvatarModal) modalRef.current?.focus()
  }, [mostrarAvatarModal])

  function releaseAvatarPreview() {
    if (avatarPreviewRef.current) {
      URL.revokeObjectURL(avatarPreviewRef.current)
      avatarPreviewRef.current = null
    }
  }

  function resetAvatarSelection() {
    releaseAvatarPreview()
    setAvatarFile(null)
    setAvatarPreviewUrl('')
    setAvatarError('')
    if (avatarInputRef.current) avatarInputRef.current.value = ''
  }

  function finishRegistration() {
    setMostrarAvatarModal(false)
    resetAvatarSelection()
    setToast(true)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => {
      setToast(false)
      navigate('/')
    }, 1200)
  }

  async function handleRegistrar() {
    if (!nombre.trim() || !correo.trim() || !contrasena) {
      setError('Por favor completa todos los campos.')
      return
    }

    try {
      setCargando(true)
      setError('')
      await register({
        full_name: nombre.trim(),
        email: correo.trim(),
        password: contrasena,
      })
      setMostrarAvatarModal(true)
    } catch (err) {
      setError(err.message || 'No se pudo crear la cuenta.')
    } finally {
      setCargando(false)
    }
  }

  function handleOpenAvatarPicker() {
    if (!avatarCargando) avatarInputRef.current?.click()
  }

  function handleAvatarFileSelected(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const validatedFile = validateAvatarFile(file)
      const previewUrl = createAvatarPreview(validatedFile)
      releaseAvatarPreview()
      avatarPreviewRef.current = previewUrl
      setAvatarFile(validatedFile)
      setAvatarPreviewUrl(previewUrl)
      setAvatarError('')
    } catch (err) {
      setAvatarError(err.message || 'No se pudo leer la foto seleccionada.')
    }
  }

  async function handleAvatarContinue() {
    if (!avatarFile) {
      handleOpenAvatarPicker()
      return
    }

    try {
      setAvatarCargando(true)
      setAvatarError('')
      await updateProfile({
        full_name: nombre.trim(),
        avatar: avatarFile,
      })
      finishRegistration()
    } catch (err) {
      setAvatarError(err.message || 'No se pudo guardar tu foto de perfil.')
    } finally {
      setAvatarCargando(false)
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

        {error && <div className="login-error" role="alert">{error}</div>}

        <div className="login-campos">
          <div className="input-wrapper">
            <User size={16} />
            <input
              type="text"
              placeholder="Nombre completo"
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
            />
          </div>
          <div className="input-wrapper">
            <Mail size={16} />
            <input
              type="email"
              placeholder="Correo electrónico"
              value={correo}
              onChange={(event) => setCorreo(event.target.value)}
            />
          </div>
          <div className="input-wrapper">
            <Lock size={16} />
            <input
              type={verPass ? 'text' : 'password'}
              placeholder="Contraseña"
              value={contrasena}
              onChange={(event) => setContrasena(event.target.value)}
            />
            <button
              className="btn-ojo"
              type="button"
              onClick={() => setVerPass(!verPass)}
              aria-label={verPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {verPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <p className="registro-terminos">
          Al registrarte aceptas nuestros{' '}
          <a href="#">Términos</a> y{' '}
          <Link to="/privacidad">Política de privacidad</Link>.
        </p>

        <button
          className="btn-login-principal"
          type="button"
          onClick={handleRegistrar}
          disabled={cargando}
        >
          {cargando ? 'Creando cuenta...' : 'Crear cuenta'} <ChevronRight size={16} />
        </button>

        <p className="registro-login">
          ¿Ya tienes cuenta? <Link to="/login">Iniciar sesión</Link>
        </p>

      </div>

      {mostrarAvatarModal && (
        <div className="registro-avatar-modal-overlay">
          <div
            ref={modalRef}
            className="registro-avatar-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="registro-avatar-modal-title"
            tabIndex="-1"
          >
            <h2 id="registro-avatar-modal-title">¿Quieres agregar una foto de perfil?</h2>
            <p className="registro-avatar-modal-subtitle">
              Personaliza tu cuenta ahora o puedes hacerlo más tarde.
            </p>

            <div className={`registro-avatar-preview ${avatarPreviewUrl ? 'con-foto' : ''}`}>
              {avatarPreviewUrl ? (
                <img src={avatarPreviewUrl} alt="Vista previa de tu foto de perfil" />
              ) : (
                <div className="registro-avatar-preview-vacia">
                  <ImagePlus size={34} aria-hidden="true" />
                  <span>Sin foto seleccionada</span>
                </div>
              )}
            </div>

            <input
              ref={avatarInputRef}
              className="registro-avatar-file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarFileSelected}
              aria-label="Seleccionar foto de perfil"
            />

            {avatarFile && (
              <button
                className="registro-avatar-cambiar"
                type="button"
                onClick={handleOpenAvatarPicker}
                disabled={avatarCargando}
              >
                Cambiar imagen
              </button>
            )}

            {avatarError && <div className="login-error" role="alert">{avatarError}</div>}

            <div className="registro-avatar-modal-actions">
              <button
                className="registro-avatar-omitir"
                type="button"
                onClick={finishRegistration}
                disabled={avatarCargando}
              >
                Omitir
              </button>
              <button
                className="registro-avatar-continuar"
                type="button"
                onClick={avatarFile ? handleAvatarContinue : handleOpenAvatarPicker}
                disabled={avatarCargando}
              >
                {avatarCargando
                  ? 'Guardando...'
                  : avatarFile
                    ? 'Continuar'
                    : 'Escoger imagen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast-bienvenida">
          ¡Bienvenido a EcoBazar, {nombre}!
        </div>
      )}
    </div>
  )
}
