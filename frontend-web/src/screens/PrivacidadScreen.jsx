import { Link } from 'react-router-dom'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import '../styles/PrivacidadScreen.css'

export default function PrivacidadScreen() {
  return (
    <main className="privacidad-page">
      <div className="privacidad-page-topbar">
        <Link to="/" className="privacidad-back-link">
          <ArrowLeft size={16} /> Volver a EcoBazar
        </Link>
        <span className="privacidad-version">Versión 1.0.0 · 25/07/2026</span>
      </div>

      <header className="privacidad-hero">
        <div className="privacidad-hero-icon"><ShieldCheck size={28} /></div>
        <div>
          <p className="privacidad-kicker">Transparencia y control</p>
          <h1>Aviso de privacidad</h1>
          <p>En EcoBazar te explicamos qué datos usamos, para qué los necesitamos y cómo puedes ejercer tus derechos.</p>
        </div>
      </header>

      <section className="privacidad-card privacidad-notice">
        <h2>Aviso simplificado</h2>
        <p>
          <strong>[RAZÓN SOCIAL]</strong>, con domicilio en <strong>[DOMICILIO]</strong>,
          es responsable del tratamiento de tus datos personales. Usamos tu nombre,
          correo, teléfono opcional, foto de perfil, información de compras y datos
          técnicos de sesión para crear y proteger tu cuenta, operar EcoBazar,
          procesar pedidos, atender solicitudes y prevenir abuso.
        </p>
        <p>
          Las finalidades necesarias son crear la cuenta, autenticarte, gestionar el
          carrito y pedidos, mostrar tu perfil, brindar soporte y cumplir obligaciones
          legales. Las finalidades opcionales solo se activarán con tu decisión y
          podrás limitar comunicaciones no esenciales.
        </p>
        <p>
          Para conocer el aviso integral, ejercer derechos ARCO o revocar tu consentimiento,
          escribe a <a href="mailto:[CORREO PRIVACIDAD]">[CORREO PRIVACIDAD]</a>.
          También puedes descargar una copia de tus datos o solicitar la eliminación
          desde <Link to="/cuenta">Cuenta</Link>.
        </p>
      </section>

      <section className="privacidad-card">
        <h2>Qué datos tratamos</h2>
        <ul>
          <li>Identificación y contacto: nombre, correo y teléfono opcional.</li>
          <li>Cuenta y preferencias: rol, foto de perfil y configuración.</li>
          <li>Operación: carrito, productos publicados, pedidos, reseñas y soporte.</li>
          <li>Pagos: referencias de transacción y estado; los datos completos de tarjeta no se almacenan en EcoBazar.</li>
          <li>Técnicos y seguridad: sesión, correlación de solicitudes, registros mínimos y controles contra abuso.</li>
        </ul>
        <p className="privacidad-muted">
          No solicitamos datos personales sensibles para usar la plataforma. No subas
          documentos, imágenes o información sensible en tu foto, publicaciones o mensajes.
        </p>
      </section>

      <section className="privacidad-card">
        <h2>Proveedores y transferencias</h2>
        <p>
          Podemos usar encargados tecnológicos para prestar el servicio: Supabase Storage
          para alojar avatares, Stripe para procesar pagos y Google cuando eliges iniciar
          sesión con Google. Compartimos únicamente lo necesario para la finalidad
          correspondiente y exigimos obligaciones de seguridad y confidencialidad.
        </p>
        <p>
          Los avatares se sirven desde un bucket público: cualquier persona que obtenga
          la URL puede ver la imagen. No se permite subir SVG y el servidor normaliza las
          imágenes a WebP de 256 × 256 px.
        </p>
      </section>

      <section className="privacidad-card">
        <h2>Retención y eliminación</h2>
        <p>
          Conservamos los datos mientras la cuenta y la relación jurídica estén activas.
          Cuando solicitas eliminarla, desactivamos el acceso, distribuimos la solicitud
          a los servicios, anonimizamos lo que ya no necesitamos y bloqueamos lo que deba
          conservarse para responsabilidades legales. La eliminación distribuida es
          asíncrona; te informaremos por el medio disponible si necesitamos aclaraciones.
        </p>
        <p>
          Las sesiones vencidas y registros de seguridad tienen plazos limitados. Los
          pedidos y pagos pueden conservarse durante los plazos fiscales, contractuales
          o de defensa legal aplicables y después se suprimen o disocian.
        </p>
      </section>

      <section className="privacidad-card">
        <h2>Tus derechos</h2>
        <p>
          Puedes solicitar acceso, rectificación, cancelación u oposición (ARCO), así como
          revocar consentimientos, mediante <a href="mailto:[CORREO PRIVACIDAD]">[CORREO PRIVACIDAD]</a>.
          La solicitud deberá permitir verificar tu identidad y localizar los datos.
          Responderemos en los plazos previstos por la LFPDPPP vigente y podremos pedir
          información adicional cuando sea necesario.
        </p>
        <p>
          Las actualizaciones de este aviso se publicarán en esta página indicando la fecha
          de versión. Para la versión integral y la matriz técnica de retención consulta la
          documentación del proyecto.
        </p>
      </section>
    </main>
  )
}
