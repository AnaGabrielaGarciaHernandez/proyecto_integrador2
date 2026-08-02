import { Link } from 'react-router-dom'
import { ArrowLeft, FileText } from 'lucide-react'
import '../styles/PrivacidadScreen.css'

export default function TerminosScreen() {
  return (
    <main className="privacidad-page">
      <div className="privacidad-page-topbar">
        <Link to="/" className="privacidad-back-link"><ArrowLeft size={16} /> Volver a EcoBazar</Link>
        <span className="privacidad-version">Vigentes desde 31/07/2026</span>
      </div>
      <header className="privacidad-hero">
        <div className="privacidad-hero-icon"><FileText size={28} /></div>
        <div>
          <p className="privacidad-kicker">Uso responsable</p>
          <h1>Términos de uso</h1>
          <p>Reglas claras para comprar, publicar y recoger productos en EcoBazar.</p>
        </div>
      </header>
      <section className="privacidad-card">
        <h2>Alcance del MVP</h2>
        <p>EcoBazar conecta compradores y vendedores para publicaciones de segunda mano y recogida presencial en los puntos disponibles.</p>
        <p>El pago se procesa mediante Stripe. En esta versión no ofrecemos pagos a vendedores, Stripe Connect, reembolsos automáticos ni devoluciones garantizadas. Cualquier incidencia debe reportarse a soporte y se revisará según la publicación y la legislación aplicable.</p>
      </section>
      <section className="privacidad-card">
        <h2>Responsabilidades</h2>
        <ul>
          <li>Proporcionar datos correctos y proteger las credenciales de la cuenta.</li>
          <li>Publicar artículos auténticos, permitidos y descritos con precisión.</li>
          <li>Coordinar la recogida únicamente en los puntos y horarios confirmados.</li>
          <li>No usar la plataforma para fraude, acoso, contenido ilegal o elusión de controles.</li>
        </ul>
      </section>
      <section className="privacidad-card">
        <h2>Moderación y cambios</h2>
        <p>Podemos retirar publicaciones, limitar cuentas o solicitar información adicional cuando detectemos abuso o incumplimiento. Actualizaremos estos términos en esta página y mostraremos su fecha de vigencia.</p>
        <p>Si tienes dudas, visita <Link to="/soporte">Soporte</Link> o consulta el <Link to="/privacidad">Aviso de privacidad</Link>.</p>
      </section>
    </main>
  )
}
