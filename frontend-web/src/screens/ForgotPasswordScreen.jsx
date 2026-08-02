import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { post } from '../services/api'
import '../styles/RegistroScreen.css'

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const data = await post('/auth/forgot-password', { email })
      setMessage(data.message || 'Si la cuenta existe, recibirás un correo con instrucciones.')
    } catch (err) {
      setError(err.message || 'No se pudo procesar la solicitud.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="login-hero">
        <h1 className="login-hero-titulo">Recupera tu<br />contraseña.</h1>
        <p className="login-hero-sub">Te enviaremos un enlace seguro a tu correo</p>
      </div>
      <form className="login-body" onSubmit={handleSubmit}>
        <div className="input-wrapper">
          <Mail size={16} />
          <input
            type="email"
            placeholder="Correo electrónico"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </div>
        {error && <div className="login-error" role="alert">{error}</div>}
        {message && <div className="registro-verificacion" role="status">{message}</div>}
        <button className="btn-login-principal" type="submit" disabled={loading}>
          {loading ? 'Enviando...' : 'Enviar enlace'}
        </button>
        <p className="login-registro"><Link to="/login">Volver a iniciar sesión</Link></p>
      </form>
    </div>
  )
}
