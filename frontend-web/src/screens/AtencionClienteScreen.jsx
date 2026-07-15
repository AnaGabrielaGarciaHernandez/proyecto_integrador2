import { useState } from 'react'
import {
  Headphones,
  MessageCircle,
  Mail,
  Clock3,
  ShieldCheck,
  ArrowRight,
  ChevronDown
} from 'lucide-react'
import '../styles/AtencionClienteScreen.css'

const canales = [
  {
    icon: MessageCircle,
    titulo: 'WhatsApp',
    texto: 'Respuesta rápida para dudas sobre pedidos, entregas y pagos.',
    detalle: '+52 618 123 4567'
  },
  {
    icon: Mail,
    titulo: 'Correo',
    texto: 'Envíanos tus comentarios o solicitudes de soporte.',
    detalle: 'soporte@ecobazar.com'
  },
  {
    icon: Clock3,
    titulo: 'Horario',
    texto: 'Atendemos de lunes a viernes de 9:00 a 18:00 hrs.',
    detalle: 'Respuestas en hasta 24 horas'
  }
]

const preguntas = [
  {
    titulo: '¿Necesito cuenta para ver ropa?',
    respuesta:
      'No necesitas una cuenta para explorar y ver los productos. Sin embargo, para comprar, publicar o guardar favoritos debes iniciar sesión.'
  },
  {
    titulo: "¿Qué es 'Apartar'?",
    respuesta:
      'Apartar permite reservar un artículo por un tiempo limitado mientras completas el pago. Revisa las condiciones específicas en la ficha del producto.'
  },
  {
    titulo: '¿Cómo publico ropa que ya no uso?',
    respuesta:
      'Ve a Publicar prenda, completa los datos y sube fotos. Revisa las políticas de venta antes de publicar.'
  },
  {
    titulo: '¿Cómo funciona la entrega?',
    respuesta:
      'El vendedor selecciona métodos de entrega disponibles y encontrarás información de seguimiento en tu pedido.'
  }
]

export default function AtencionClienteScreen() {
  const [openIndex, setOpenIndex] = useState(null)

  function toggle(index) {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <div className="atencion-container">
      <section className="atencion-hero">
        <div className="atencion-hero-content">
          <h1>Estamos aquí para ayudarte</h1>
          <p>
            Resolvemos dudas sobre compras, entregas, pagos y publicaciones en EcoBazar.
          </p>
        </div>
      </section>

      <section className="atencion-grid">
        {canales.map((canal) => {
          const Icon = canal.icon

          return (
            <article key={canal.titulo} className="atencion-card">
              <div className="atencion-card-icono">
                <Icon size={20} />
              </div>
              <div className="atencion-card-body">
                <h3>{canal.titulo}</h3>
                <p>{canal.texto}</p>
                <span>{canal.detalle}</span>
              </div>
            </article>
          )
        })}
      </section>

      <section className="atencion-panel">
        <div className="atencion-panel-header">
          <div>
            <p className="atencion-panel-eyebrow">Soporte confiable</p>
            <h2>Preguntas frecuentes</h2>
          </div>
          <div className="atencion-panel-badge atencion-panel-badge--accent">
            <ShieldCheck size={16} />
            Respuesta rápida
          </div>
        </div>

        <div className="atencion-faq-list">
          {preguntas.map((pregunta, idx) => (
            <div key={pregunta.titulo} className="atencion-faq-item" onClick={() => toggle(idx)}>
              <div className="atencion-faq-texto">
                <h3>{pregunta.titulo}</h3>
                {openIndex === idx && <p className="atencion-faq-respuesta">{pregunta.respuesta}</p>}
              </div>
              <ChevronDown size={18} className={`atencion-faq-arrow ${openIndex === idx ? 'rotate' : ''}`} />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
