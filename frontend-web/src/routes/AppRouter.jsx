import { Routes, Route } from 'react-router-dom'
import MainLayout from '../components/MainLayout'

import HomeScreen     from '../screens/HomeScreen'
import ExplorarScreen from '../screens/ExplorarScreen'
import CarritoScreen  from '../screens/CarritoScreen'
import CuentaScreen   from '../screens/CuentaScreen'
import ProductoScreen from '../screens/ProductoScreen'
import LoginScreen    from '../screens/LoginScreen'
import RegistroScreen from '../screens/RegistroScreen'
import VenderScreen   from '../screens/VenderScreen'
import AdminScreen from '../screens/AdminScreen'
import RecientesScreen from '../screens/RecientesScreen'
import OrdersScreen from '../screens/OrdersScreen'

export default function AppRouter() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/"             element={<HomeScreen />} />
        <Route path="/explorar"     element={<ExplorarScreen />} />
        <Route path="/recientes"    element={<RecientesScreen />} />
        <Route path="/pedidos"      element={<OrdersScreen />} />
        <Route path="/carrito"      element={<CarritoScreen />} />
        <Route path="/cuenta"       element={<CuentaScreen />} />
        <Route path="/producto/:id" element={<ProductoScreen />} />
        <Route path="/login"        element={<LoginScreen />} />
        <Route path="/registro"     element={<RegistroScreen />} />
        <Route path="/vender"       element={<VenderScreen />} />
        <Route path="/admin/vendedores" element={<AdminScreen />} />
        <Route path="/admin/productos"  element={<AdminScreen />} />
        <Route path="/admin/reportes"   element={<AdminScreen />} />
      </Route>
    </Routes>
  )
}