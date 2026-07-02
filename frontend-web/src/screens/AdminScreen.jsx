import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Users, ShoppingBag, Flag, Shield,
  ChevronDown, ChevronUp, CheckCircle,
  XCircle, PauseCircle, MessageSquare,
  Trash2, Clock
} from 'lucide-react'
import '../styles/AdminScreen.css'


const vendedoresData = [
  {
    id: 1, nombre: 'ArteNatural MX', contacto: 'María González Ruiz',
    fecha: '2026-06-09', status: 'pendiente',
    email: 'maria@artnatural.mx', telefono: '555-123-4567',
    rfc: 'GORM850301HDF',
    descripcion: 'Vendo macetas artesanales y plantas de ornamento cultivadas orgánicamente en mi huerto familiar en Oaxaca.',
  },
  {
    id: 2, nombre: 'TejidoVerde', contacto: 'Carlos Pérez López',
    fecha: '2026-06-08', status: 'pendiente',
    email: 'carlos@tejidoverde.mx', telefono: '555-987-6543',
    rfc: 'PELC900215ABC',
    descripcion: 'Tienda de ropa tejida a mano con fibras naturales y tintes vegetales.',
  },
  {
    id: 3, nombre: 'JaboneríaBotánica', contacto: 'Ana Martínez Vega',
    fecha: '2026-06-05', status: 'aprobado',
    email: 'ana@jaboneria.mx', telefono: '555-456-7890',
    rfc: 'MAVA880530XYZ',
    descripcion: 'Jabones artesanales con ingredientes botánicos locales.',
  },
  {
    id: 4, nombre: 'SemillaViva', contacto: 'Roberto Díaz Sánchez',
    fecha: '2026-06-04', status: 'rechazado',
    email: 'roberto@semillaviva.mx', telefono: '555-321-0987',
    rfc: 'DISR750812DEF',
    descripcion: 'Semillas y plantas nativas de la región.',
  },
]

const productosData = [
  {
    id: 1, imagen: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=100',
    nombre: 'Sudadera vintage Nike — gris oversize', vendedor: 'Sofía R.', status: 'activo',
    descripcion: 'Sudadera Nike vintage talla L en perfecto estado. Solo se usó en invierno pasado. Sin manchas ni roturas. Lavada y lista para usar.',
    precio: 180,
  },
  {
    id: 2, imagen: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=100',
    nombre: 'Hoodie universitario UNAM azul — talla M', vendedor: 'VintageCloset DGO', status: 'activo',
    descripcion: 'Hoodie oficial UNAM, talla M. Poco uso, en buen estado.', precio: 150,
  },
  {
    id: 3, imagen: 'https://images.unsplash.com/photo-1556821840-3a63f15732ce?w=100',
    nombre: 'Sudadera Thrasher negra — talla S', vendedor: 'Miguel A.', status: 'activo',
    descripcion: 'Sudadera Thrasher original talla S, solo usada dos veces.', precio: 220,
  },
  {
    id: 4, imagen: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=100',
    nombre: "Chaqueta de jean Levi's — talla M", vendedor: 'Fernanda V.', status: 'activo',
    descripcion: "Chaqueta de mezclilla Levi's original talla M.", precio: 320,
  },
  {
    id: 5, imagen: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=100',
    nombre: 'Bomber jacket verde militar — talla L', vendedor: 'ThriftDurango', status: 'activo',
    descripcion: 'Bomber jacket verde militar, talla L. Excelente estado.', precio: 280,
  },
]

const reportesData = [
  {
    id: 1, tipo: 'Producto', fecha: '2026-06-09', status: 'pendiente',
    nombre: 'Bolsa de tela tejida a mano',
    motivo: 'Descripción engañosa',
    descripcion: 'El producto que recibí no corresponde a la foto.',
  },
  {
    id: 2, tipo: 'Vendedor', fecha: '2026-06-08', status: 'pendiente',
    nombre: 'PielNatural',
    motivo: 'No entregó el pedido',
    descripcion: 'Pagué hace 3 semanas y el vendedor no responde mis mensajes.',
  },
  {
    id: 3, tipo: 'Producto', fecha: '2026-06-05', status: 'resuelto',
    nombre: 'Tenis de algodón reciclado',
    motivo: 'Calidad inferior',
    descripcion: 'Los tenis se desarmaron a la semana de uso.',
  },
]

const statusVendedor = {
  pendiente: { label: 'Pendiente', clase: 'status-pendiente' },
  aprobado:  { label: 'Aprobado',  clase: 'status-aprobado'  },
  rechazado: { label: 'Rechazado', clase: 'status-rechazado' },
}

export default function AdminScreen() {
  const location = useLocation()
  const tabInicial = location.pathname.includes('productos')
    ? 'productos'
    : location.pathname.includes('reportes')
    ? 'reportes'
    : 'vendedores'

  const navigate = useNavigate()
  const tab = location.pathname.includes('productos')
    ? 'productos'
    : location.pathname.includes('reportes')
    ? 'reportes'
    : 'vendedores'
  const [expandido, setExpandido]   = useState(null)
  const [vendedores, setVendedores] = useState(vendedoresData)
  const [productos, setProductos]   = useState(productosData)
  const [reportes, setReportes]     = useState(reportesData)

  const pendientesVendedores = vendedores.filter(v => v.status === 'pendiente').length
  const pendientesReportes   = reportes.filter(r => r.status === 'pendiente').length

  function toggleExpandido(id) {
    setExpandido(expandido === id ? null : id)
  }

  function cambiarStatusVendedor(id, nuevoStatus) {
    setVendedores(prev => prev.map(v => v.id === id ? { ...v, status: nuevoStatus } : v))
    setExpandido(null)
  }

  function quitarProducto(id) {
    setProductos(prev => prev.filter(p => p.id !== id))
    setExpandido(null)
  }

  function resolverReporte(id) {
    setReportes(prev => prev.map(r => r.id === id ? { ...r, status: 'resuelto' } : r))
  }

  return (
    <div>
      {/* Hero */}
      <div className="admin-hero">
        <h1>Panel de control</h1>
      </div>

      {/* Tabs */}
      <div className="admin-tabs">
        <button className={`admin-tab ${tab === 'vendedores' ? 'activo' : ''}`} onClick={() => navigate('/admin/vendedores')}>
          <Users size={14} /> Vendedores
          {pendientesVendedores > 0 && <span className="admin-badge">{pendientesVendedores}</span>}
        </button>
        <button className={`admin-tab ${tab === 'productos' ? 'activo' : ''}`} onClick={() => navigate('/admin/productos')}>
          <ShoppingBag size={14} /> Productos
        </button>
        <button className={`admin-tab ${tab === 'reportes' ? 'activo' : ''}`} onClick={() => navigate('/admin/reportes')}>
          <Flag size={14} /> Reportes
          {pendientesReportes > 0 && <span className="admin-badge">{pendientesReportes}</span>}
        </button>
      </div>

      <div className="admin-body">

        {/* ── Vendedores ── */}
        {tab === 'vendedores' && (
          <div>
            {vendedores.map(v => (
              <div key={v.id} className="admin-card">
                <div className="admin-card-header" onClick={() => toggleExpandido(v.id)}>
                  <div>
                    <div className="admin-card-meta">
                      <span className={`status-badge ${statusVendedor[v.status].clase}`}>
                        {v.status === 'pendiente' && <Clock size={10} />}
                        {v.status === 'aprobado'  && <CheckCircle size={10} />}
                        {v.status === 'rechazado' && <XCircle size={10} />}
                        {statusVendedor[v.status].label}
                      </span>
                      <span className="admin-card-fecha">{v.fecha}</span>
                    </div>
                    <h3>{v.nombre}</h3>
                    <p>{v.contacto}</p>
                  </div>
                  {expandido === v.id ? <ChevronUp size={16} color="#9ca3af" /> : <ChevronDown size={16} color="#9ca3af" />}
                </div>

                {expandido === v.id && (
                  <div className="admin-card-detalle">
                    <div className="admin-detalle-fila">
                      <span>Email</span><span>{v.email}</span>
                    </div>
                    <div className="admin-detalle-fila">
                      <span>Teléfono</span><span>{v.telefono}</span>
                    </div>
                    <div className="admin-detalle-fila">
                      <span>RFC</span><span>{v.rfc}</span>
                    </div>
                    <p className="admin-detalle-desc">{v.descripcion}</p>
                    <div className="admin-acciones-grid">
                      <button className="admin-btn admin-btn-aprobar" onClick={() => cambiarStatusVendedor(v.id, 'aprobado')}>
                        <CheckCircle size={15} /> Aprobar
                      </button>
                      <button className="admin-btn admin-btn-rechazar" onClick={() => cambiarStatusVendedor(v.id, 'rechazado')}>
                        <XCircle size={15} /> Rechazar
                      </button>
                      <button className="admin-btn admin-btn-suspender">
                        <PauseCircle size={15} /> Suspender
                      </button>
                      <button className="admin-btn admin-btn-nota">
                        <MessageSquare size={15} /> Enviar nota
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Productos ── */}
        {tab === 'productos' && (
          <div>
            {productos.map(p => (
              <div key={p.id} className="admin-card">
                <div className="admin-card-header" onClick={() => toggleExpandido(p.id)}>
                  <div className="admin-producto-fila">
                    <img src={p.imagen} alt={p.nombre} className="admin-producto-img" />
                    <div>
                      <h3>{p.nombre}</h3>
                      <p>{p.vendedor}</p>
                      <span className="status-badge status-aprobado">
                        <CheckCircle size={10} /> Activo
                      </span>
                    </div>
                  </div>
                  {expandido === p.id ? <ChevronUp size={16} color="#9ca3af" /> : <ChevronDown size={16} color="#9ca3af" />}
                </div>

                {expandido === p.id && (
                  <div className="admin-card-detalle">
                    <p className="admin-detalle-desc">{p.descripcion}</p>
                    <p style={{ fontSize: '13px', color: 'var(--color-accent)', fontWeight: '600', marginBottom: '16px' }}>
                      Precio: ${p.precio}
                    </p>
                    <div className="admin-acciones-grid admin-acciones-3">
                      <button className="admin-btn admin-btn-rechazar" onClick={() => quitarProducto(p.id)}>
                        <Trash2 size={15} /> Quitar
                      </button>
                      <button className="admin-btn admin-btn-suspender">
                        <PauseCircle size={15} /> Suspender
                      </button>
                      <button className="admin-btn admin-btn-nota">
                        <MessageSquare size={15} /> Nota
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Reportes ── */}
        {tab === 'reportes' && (
          <div>
            <div className="admin-reportes-titulo">
              <Flag size={16} />
              Reportes de usuarios
              {pendientesReportes > 0 && (
                <span className="admin-badge-pendientes">{pendientesReportes} pendientes</span>
              )}
            </div>

            {reportes.map(r => (
              <div key={r.id} className={`admin-reporte-card ${r.status === 'resuelto' ? 'resuelto' : ''}`}>
                <div className="admin-reporte-header">
                  <div className="admin-reporte-meta">
                    <span className="admin-reporte-tipo">{r.tipo}</span>
                    <span className="admin-card-fecha">{r.fecha}</span>
                  </div>
                  <span className={`status-badge ${r.status === 'resuelto' ? 'status-resuelto' : 'status-pendiente'}`}>
                    {r.status === 'resuelto' ? 'Resuelto' : 'Pendiente'}
                  </span>
                </div>
                <h3 className="admin-reporte-nombre">{r.nombre}</h3>
                <p className="admin-reporte-motivo">Motivo: {r.motivo}</p>
                <p className="admin-reporte-desc">{r.descripcion}</p>
                {r.status === 'pendiente' && (
                  <button className="admin-btn-resolver" onClick={() => resolverReporte(r.id)}>
                    <CheckCircle size={14} /> Marcar resuelto
                  </button>
                )}
              </div>
            ))}

            <div className="admin-historial">
              <div className="admin-historial-titulo">
                <Clock size={14} /> Historial de acciones
              </div>
              <div className="admin-historial-vacio">
                Sin acciones registradas aún
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}