import { Link } from 'react-router-dom'
import '../styles/LoginScreen.css'

export default function NotFoundScreen() {
  return (
    <div className="login-body" style={{ textAlign: 'center' }}>
      <h1>Esta página no existe</h1>
      <p>La dirección puede haber cambiado.</p>
      <Link className="btn-login-principal" to="/">Volver al inicio</Link>
    </div>
  )
}
