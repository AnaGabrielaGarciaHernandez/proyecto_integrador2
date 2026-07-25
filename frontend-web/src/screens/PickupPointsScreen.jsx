import { useEffect, useState } from 'react'
import { AlertTriangle, Edit3, MapPin, Plus, Save, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import {
  createSellerPickupPoint,
  getSellerPickupPoints,
  updateSellerPickupPoint,
  updateSellerPickupPointStatus,
} from '../services/seller'
import '../styles/PickupPointsScreen.css'

const EMPTY_POINT = {
  name: '',
  address_line: '',
  city: '',
  state: '',
  postal_code: '',
  reference: '',
}

export default function PickupPointsScreen() {
  const { user, loading: authLoading } = useAuth()
  const [points, setPoints] = useState([])
  const [form, setForm] = useState(EMPTY_POINT)
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (authLoading || !user || user.role !== 'vendedor') return undefined
    let mounted = true
    getSellerPickupPoints()
      .then((items) => { if (mounted) setPoints(items) })
      .catch((err) => { if (mounted) setError(err.message || 'No pudimos cargar tus puntos de venta.') })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [authLoading, user])

  if (authLoading) return <div className="pickup-page-message">Cargando...</div>
  if (!user) return <AccessMessage message="Inicia sesión para administrar tus puntos de venta." />
  if (user.role !== 'vendedor') return <AccessMessage message="Mis direcciones está disponible únicamente para vendedores." />

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function startEdit(point) {
    setEditingId(point.id)
    setForm({
      name: point.name || '',
      address_line: point.address_line || '',
      city: point.city || '',
      state: point.state || '',
      postal_code: point.postal_code || '',
      reference: point.reference || '',
    })
    setError('')
    setMessage('')
    window.scrollTo?.({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_POINT)
  }

  async function savePoint(event) {
    event.preventDefault()
    setError('')
    setMessage('')
    setSaving(true)
    try {
      const data = editingId
        ? await updateSellerPickupPoint(editingId, form)
        : await createSellerPickupPoint(form)
      const saved = data?.pickup_point
      if (saved) {
        setPoints((current) => editingId
          ? current.map((point) => point.id === saved.id ? { ...point, ...saved } : point)
          : [saved, ...current])
      }
      setMessage(editingId ? 'Punto de venta actualizado.' : 'Punto de venta creado.')
      cancelEdit()
    } catch (err) {
      setError(err.message || 'No pudimos guardar el punto de venta.')
    } finally {
      setSaving(false)
    }
  }

  async function togglePoint(point) {
    setError('')
    setMessage('')
    setBusyId(point.id)
    try {
      const data = await updateSellerPickupPointStatus(point.id, !point.is_active)
      if (data?.pickup_point) {
        setPoints((current) => current.map((item) => item.id === point.id
          ? { ...item, ...data.pickup_point }
          : item))
      }
      setMessage(point.is_active ? 'Punto desactivado. Sus productos requieren reasignación para volver a venderse.' : 'Punto activado.')
    } catch (err) {
      setError(err.message || 'No pudimos cambiar el estado del punto.')
    } finally {
      setBusyId('')
    }
  }

  return (
    <div className="pickup-page">
      <header className="pickup-hero">
        <div>
          <p className="pickup-eyebrow">OPERACIÓN DE TU TIENDA</p>
          <h1>Mis direcciones</h1>
          <p>Administra los puntos donde tus compradores recogerán sus productos.</p>
        </div>
        <Link className="pickup-back-link" to="/panel-vendedor">Volver al panel</Link>
      </header>

      <main className="pickup-body">
        {error && <div className="pickup-feedback error" role="alert">{error}</div>}
        {message && <div className="pickup-feedback success" role="status">{message}</div>}

        <section className="pickup-card pickup-form-card">
          <div className="pickup-card-heading">
            <div>
              <p className="pickup-card-kicker">{editingId ? 'EDITAR PUNTO' : 'NUEVO PUNTO'}</p>
              <h2>{editingId ? 'Actualiza los datos de recogida' : 'Agrega un punto de venta'}</h2>
              <p>La dirección completa sólo se mostrará a compradores después del pago.</p>
            </div>
            <MapPin size={24} />
          </div>
          <form className="pickup-form" onSubmit={savePoint}>
            <label>Nombre del punto<input value={form.name} onChange={(event) => updateField('name', event.target.value)} maxLength={160} placeholder="Punto Centro" required disabled={saving} /></label>
            <label className="pickup-field-wide">Dirección completa<input value={form.address_line} onChange={(event) => updateField('address_line', event.target.value)} maxLength={255} placeholder="Calle, número y colonia" required disabled={saving} /></label>
            <label>Ciudad<input value={form.city} onChange={(event) => updateField('city', event.target.value)} maxLength={120} placeholder="Durango" required disabled={saving} /></label>
            <label>Estado<input value={form.state} onChange={(event) => updateField('state', event.target.value)} maxLength={120} placeholder="Durango" required disabled={saving} /></label>
            <label>Código postal<input value={form.postal_code} onChange={(event) => updateField('postal_code', event.target.value)} maxLength={20} placeholder="34000" required disabled={saving} /></label>
            <label className="pickup-field-wide">Referencia (opcional)<textarea value={form.reference} onChange={(event) => updateField('reference', event.target.value)} maxLength={255} placeholder="Frente al parque, local verde..." disabled={saving} /></label>
            <div className="pickup-form-actions">
              {editingId && <button type="button" className="pickup-secondary" onClick={cancelEdit} disabled={saving}><X size={15} /> Cancelar</button>}
              <button type="submit" className="pickup-primary" disabled={saving}>{saving ? 'Guardando...' : editingId ? <><Save size={15} /> Guardar cambios</> : <><Plus size={15} /> Crear punto</>}</button>
            </div>
          </form>
        </section>

        <section className="pickup-card">
          <div className="pickup-card-heading pickup-card-heading--list">
            <div><p className="pickup-card-kicker">CATÁLOGO DE PUNTOS</p><h2>Tus puntos de venta</h2></div>
            <span className="pickup-count">{points.length}</span>
          </div>
          {loading && <p className="pickup-empty">Cargando puntos...</p>}
          {!loading && points.length === 0 && <p className="pickup-empty">Todavía no tienes puntos. Crea uno para poder publicar productos.</p>}
          <div className="pickup-list">
            {points.map((point) => (
              <article className={`pickup-point-row ${point.is_active ? '' : 'is-inactive'}`} key={point.id}>
                <div className="pickup-point-icon"><MapPin size={20} /></div>
                <div className="pickup-point-content">
                  <div className="pickup-point-title"><h3>{point.name}</h3><span className={`pickup-status ${point.is_active ? 'active' : 'inactive'}`}>{point.is_active ? 'Activo' : 'Inactivo'}</span></div>
                  <p>{point.address_line}, {point.city}, {point.state}, C.P. {point.postal_code}</p>
                  {point.reference && <small>Referencia: {point.reference}</small>}
                  {Number(point.pending_products_count || 0) > 0 && (
                    <div className="pickup-warning"><AlertTriangle size={15} /><span>{point.pending_products_count} producto(s) asociado(s). {point.is_active ? 'Se pausarán si desactivas este punto.' : 'Reasígnalos para volver a venderlos.'}</span></div>
                  )}
                </div>
                <div className="pickup-point-actions">
                  <button type="button" onClick={() => startEdit(point)} disabled={Boolean(busyId) || saving}><Edit3 size={15} /> Editar</button>
                  <button type="button" onClick={() => void togglePoint(point)} disabled={Boolean(busyId) || saving}>{busyId === point.id ? 'Guardando...' : point.is_active ? 'Desactivar' : 'Activar'}</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

function AccessMessage({ message }) {
  return <div className="pickup-page-message"><h2>Acceso restringido</h2><p>{message}</p><Link to="/">Volver al inicio</Link></div>
}
