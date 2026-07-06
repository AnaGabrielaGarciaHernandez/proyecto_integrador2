// Simulated orders service for frontend demonstrations
const sampleOrders = [
  // Client orders
  { id: 101, role: 'cliente', buyer: 'Ana', total: 420, status: 'Pendiente', date: '2026-07-01', items: [{name:'Sudadera vintage', qty:1}] },
  { id: 102, role: 'cliente', buyer: 'Ana', total: 250, status: 'Enviado', date: '2026-06-28', items: [{name:'Pantalón chino', qty:1}] },
  { id: 103, role: 'cliente', buyer: 'Ana', total: 120, status: 'Entregado', date: '2026-06-20', items: [{name:'Camiseta básica', qty:2}] },

  // Vendor orders
  { id: 201, role: 'vendedor', seller: 'VintageCloset', total: 180, status: 'Nuevo', date: '2026-07-02', items: [{name:'Hoodie UNAM', qty:1}] },
  { id: 202, role: 'vendedor', seller: 'ThriftDurango', total: 320, status: 'Aceptado', date: '2026-06-30', items: [{name:'Bomber jacket', qty:1}] },
]

export async function getOrdersForUser(user) {
  // simulate network delay
  await new Promise((r) => setTimeout(r, 200))

  if (!user) return []

  if (user.role === 'cliente') {
    return sampleOrders.filter(o => o.role === 'cliente')
  }

  if (user.role === 'vendedor') {
    return sampleOrders.filter(o => o.role === 'vendedor')
  }

  return []
}
