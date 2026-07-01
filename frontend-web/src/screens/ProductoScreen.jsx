import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Tag, MapPin, ShoppingCart, User, Package, ShieldCheck, RotateCcw, X, ZoomIn } from 'lucide-react'
import { productos } from '../data/productos'
import '../styles/ProductoScreen.css'

export default function ProductoScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [imagenAbierta, setImagenAbierta] = useState(false)

  const producto = productos.find(p => p.id === Number(id))

  if (!producto) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>Producto no encontrado.</p>
      </div>
    )
  }

  const ahorro = Math.round(((producto.precioOriginal - producto.precio) / producto.precioOriginal) * 100)

  return (
    <div className="producto-contenedor">

      {/* Lightbox */}
      {imagenAbierta && (
        <div className="lightbox" onClick={() => setImagenAbierta(false)}>
          <button className="lightbox-cerrar"><X size={24} /></button>
          <img src={producto.imagen} alt={producto.nombre} className="lightbox-imagen" />
        </div>
      )}

      {/* Imagen izquierda */}
      <div className="producto-hero">
        <img
          src={producto.imagen}
          alt={producto.nombre}
          className="producto-imagen"
          onClick={() => setImagenAbierta(true)}
        />
        <button className="producto-zoom" onClick={() => setImagenAbierta(true)}>
          <ZoomIn size={16} />
        </button>
        <button className="producto-volver" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} />
        </button>
      </div>

      {/* Info derecha */}
      <div className="producto-info-derecha">

        <div className="producto-badges">
          <span className={`badge-condicion badge-condicion--${producto.condicion.toLowerCase().replace(' ', '-')}`}>
            ● {producto.condicion}
          </span>
          {producto.tipo && (
            <span className={`badge-tipo badge-tipo--${producto.tipo.toLowerCase()}`}>
              {producto.tipo}
            </span>
          )}
        </div>

        <div className="producto-body">
          <p className="producto-categoria">{producto.categoria}</p>
          <h1 className="producto-nombre">{producto.nombre}</h1>
          <div className="producto-precio-fila">
            <div>
              <div className="producto-precios">
                <span className="producto-precio-actual">${producto.precio}</span>
                <span className="producto-precio-original">${producto.precioOriginal}</span>
              </div>
              <span className="producto-ahorro">Ahorras {ahorro}%</span>
            </div>
            <div className="producto-talla-box">
              <p className="producto-talla-label">Talla</p>
              <div className="producto-talla-valor">{producto.talla}</div>
            </div>
          </div>
        </div>

        <div className="producto-vendedor">
          <div className="vendedor-foto" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#e5e7eb', width: '52px', height: '52px',
            borderRadius: '50%', flexShrink: 0
          }}>
            <User size={22} color="#9ca3af" />
          </div>
          <div className="vendedor-info">
            <div className="vendedor-tipo"><User size={10} /> {producto.vendedorTipo}</div>
            <p className="vendedor-nombre-detalle">{producto.vendedor}</p>
          </div>
          <button className="btn-ver-perfil">Ver perfil</button>
        </div>

        <div className="producto-descripcion">
          <div className="producto-seccion-titulo"><Tag size={13} /> Descripción</div>
          <p>{producto.descripcion}</p>
        </div>

        <div className="producto-entrega">
          <div className="entrega-header">Entrega</div>
          <div className="entrega-opcion">
            <div className="entrega-icono"><MapPin size={16} /></div>
            <div className="entrega-texto">
              <h4>{producto.entrega}</h4>
              <p>{producto.direccion}</p>
            </div>
          </div>
        </div>

        <div className="producto-garantias">
          <div className="garantia-item"><Package size={18} /><span>Envío seguro</span></div>
          <div className="garantia-item"><ShieldCheck size={18} /><span>Compra protegida</span></div>
          <div className="garantia-item"><RotateCcw size={18} /><span>15 días devolución</span></div>
        </div>

        <button className="producto-btn-fijo">
          <ShoppingCart size={20} />
          ${producto.precio}
        </button>

      </div>
    </div>
  )
}