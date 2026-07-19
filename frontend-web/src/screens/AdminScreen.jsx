import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Users, CheckCircle, XCircle, PauseCircle, Trash2, Shield, Activity, BarChart
} from 'lucide-react'
import { get, patch, post, del } from '../services/api'
import '../styles/AdminScreen.css'

export default function AdminScreen() {
  const location = useLocation()
  const navigate = useNavigate()
  
  const tab = location.pathname.includes('solicitudes')
    ? 'solicitudes'
    : location.pathname.includes('reportes')
    ? 'reportes'
    : 'usuarios'

  const [users, setUsers] = useState([])
  const [applications, setApplications] = useState([])
  const [reports, setReports] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchData()
  }, [tab])

  async function fetchData() {
    setLoading(true)
    setError('')
    try {
      if (tab === 'usuarios') {
        const data = await get('/admin/users')
        setUsers(data?.users || [])
      } else if (tab === 'solicitudes') {
        const data = await get('/admin/seller-applications')
        setApplications(data?.applications || [])
      } else if (tab === 'reportes') {
        const data = await get('/admin/reports/sales')
        setReports(data || null)
      }
    } catch (err) {
      setError(err.message || 'Error al cargar los datos')
    } finally {
      setLoading(false)
    }
  }

  async function handleSuspendUser(id, is_active) {
    if (!window.confirm(`¿Estás seguro de ${is_active ? 'suspender' : 'activar'} a este usuario?`)) return
    try {
      await patch(`/admin/users/${id}/suspend`, { is_active: !is_active })
      fetchData()
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleDeleteUser(id) {
    if (!window.confirm('¿Estás seguro de ELIMINAR definitivamente a este usuario?')) return
    try {
      await del(`/admin/users/${id}`)
      fetchData()
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleChangeRole(id, currentRole) {
    const newRole = window.prompt('Escribe el nuevo rol (cliente, vendedor, admin):', currentRole)
    if (!newRole || newRole === currentRole) return
    try {
      await patch(`/admin/users/${id}/role`, { role: newRole })
      fetchData()
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleApproveApp(id) {
    if (!window.confirm('¿Aprobar solicitud? El usuario se convertirá en vendedor.')) return
    try {
      await post(`/admin/seller-applications/${id}/approve`)
      fetchData()
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleRejectApp(id) {
    const reason = window.prompt('Motivo de rechazo:')
    if (reason === null) return
    try {
      await post(`/admin/seller-applications/${id}/reject`, { reason })
      fetchData()
    } catch (err) {
      alert(err.message)
    }
  }

  const pendientesCount = applications.length

  return (
    <div>
      <div className="admin-hero">
        <h1>Panel de Administración</h1>
      </div>

      <div className="admin-tabs">
        <button className={`admin-tab ${tab === 'usuarios' ? 'activo' : ''}`} onClick={() => navigate('/admin/usuarios')}>
          <Users size={14} /> Usuarios
        </button>
        <button className={`admin-tab ${tab === 'solicitudes' ? 'activo' : ''}`} onClick={() => navigate('/admin/solicitudes')}>
          <Shield size={14} /> Solicitudes
          {pendientesCount > 0 && <span className="admin-badge">{pendientesCount}</span>}
        </button>
        <button className={`admin-tab ${tab === 'reportes' ? 'activo' : ''}`} onClick={() => navigate('/admin/reportes')}>
          <Activity size={14} /> Reportes
        </button>
      </div>

      <div className="admin-body">
        {loading && <p>Cargando información...</p>}
        {error && <p style={{color: 'red'}}>{error}</p>}

        {!loading && !error && (
          <>
            {tab === 'usuarios' && (
              <div>
                {users.map(u => (
                  <div key={u.id} className="admin-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px' }}>
                      <div>
                        <h3>{u.full_name} <span style={{fontSize: '0.8em', color: '#666'}}>({u.role})</span></h3>
                        <p>{u.email}</p>
                        <span className={`status-badge ${u.is_active ? 'status-aprobado' : 'status-rechazado'}`}>
                          {u.is_active ? 'Activo' : 'Suspendido'}
                        </span>
                      </div>
                      <div className="admin-acciones-grid" style={{ gridTemplateColumns: '1fr', gap: '8px' }}>
                        <button className="admin-btn admin-btn-nota" onClick={() => handleChangeRole(u.id, u.role)}>
                          Cambiar Rol
                        </button>
                        <button className="admin-btn admin-btn-suspender" onClick={() => handleSuspendUser(u.id, u.is_active)}>
                          {u.is_active ? 'Suspender' : 'Activar'}
                        </button>
                        <button className="admin-btn admin-btn-rechazar" onClick={() => handleDeleteUser(u.id)}>
                          <Trash2 size={15} /> Borrar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {users.length === 0 && <p>No hay usuarios registrados.</p>}
              </div>
            )}

            {tab === 'solicitudes' && (
              <div>
                {applications.map(app => (
                  <div key={app.id} className="admin-card">
                    <div style={{ padding: '16px' }}>
                      <h3>{app.requested_display_name} <span style={{fontSize: '0.8em', color: '#666'}}>({app.seller_type})</span></h3>
                      <p><strong>Descripción:</strong> {app.description}</p>
                      <p><strong>Teléfono:</strong> {app.contact_phone}</p>
                      <div className="admin-acciones-grid" style={{ marginTop: '16px' }}>
                        <button className="admin-btn admin-btn-aprobar" onClick={() => handleApproveApp(app.id)}>
                          <CheckCircle size={15} /> Aprobar
                        </button>
                        <button className="admin-btn admin-btn-rechazar" onClick={() => handleRejectApp(app.id)}>
                          <XCircle size={15} /> Rechazar
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {applications.length === 0 && <p>No hay solicitudes pendientes.</p>}
              </div>
            )}

            {tab === 'reportes' && reports && (
              <div>
                <div className="admin-card" style={{ padding: '24px', textAlign: 'center', marginBottom: '24px' }}>
                  <BarChart size={48} color="var(--color-accent)" style={{ marginBottom: '16px' }} />
                  <h2>Total de Ventas Históricas</h2>
                  <p style={{ fontSize: '2em', fontWeight: 'bold', color: 'var(--color-accent)' }}>
                    ${(reports.total_sales_cents / 100).toFixed(2)} MXN
                  </p>
                </div>
                
                <h3>Últimos Pedidos</h3>
                {reports.recent_orders?.map(order => (
                  <div key={order.id} className="admin-card" style={{ padding: '16px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div>
                        <strong>{order.order_number}</strong>
                        <p>{order.buyer_name}</p>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className="status-badge status-aprobado">{order.status}</span>
                        <p style={{ fontWeight: 'bold', marginTop: '8px' }}>${(order.total_cents / 100).toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
