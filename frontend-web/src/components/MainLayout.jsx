import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu } from 'lucide-react'
import Sidebar from './Sidebar'
import '../styles/MainLayout.css'

export default function MainLayout() {
  const [sidebarAbierto, setSidebarAbierto] = useState(false)

  return (
    <div className="layout">
      <Sidebar
        abierto={sidebarAbierto}
        onCerrar={() => setSidebarAbierto(false)}
      />

      <main className="layout-main">
        {/* Botón hamburguesa — solo visible en móvil */}
        <button
          className="menu-hamburguesa"
          onClick={() => setSidebarAbierto(true)}
        >
          <Menu size={22} />
        </button>

        <Outlet />
      </main>
    </div>
  )
}