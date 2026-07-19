import { Navigate, Routes, Route } from 'react-router-dom'
import MainLayout from '../components/MainLayout'
import AdminRoute from '../components/AdminRoute'

import HomeScreen     from '../screens/HomeScreen'
import ExplorarScreen from '../screens/ExplorarScreen'
import CarritoScreen  from '../screens/CarritoScreen'
import CuentaScreen   from '../screens/CuentaScreen'
import ProductoScreen from '../screens/ProductoScreen'
import LoginScreen    from '../screens/LoginScreen'
import RegistroScreen from '../screens/RegistroScreen'
import VenderScreen   from '../screens/VenderScreen'
import AdminScreen from '../screens/AdminScreen'
import OrdersScreen from '../screens/OrdersScreen'
import AtencionClienteScreen from '../screens/AtencionClienteScreen'
import WishlistScreen from '../screens/WishlistScreen'
import { CheckoutSuccessScreen, CheckoutCancelledScreen } from '../screens/CheckoutStatusScreen'

export default function AppRouter() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/"             element={<HomeScreen />} />
        <Route path="/explorar"     element={<ExplorarScreen />} />
        <Route path="/recientes"    element={<Navigate to="/" replace />} />
        <Route path="/pedidos"      element={<OrdersScreen />} />
        <Route path="/carrito"      element={<CarritoScreen />} />
        <Route path="/checkout/exito" element={<CheckoutSuccessScreen />} />
        <Route path="/checkout/cancelado" element={<CheckoutCancelledScreen />} />
        <Route path="/cuenta"       element={<CuentaScreen />} />
        <Route path="/deseos"       element={<WishlistScreen />} />
        <Route path="/producto/:id" element={<ProductoScreen />} />
        <Route path="/login"        element={<LoginScreen />} />
        <Route path="/registro"     element={<RegistroScreen />} />
        <Route path="/vender"       element={<VenderScreen />} />
        <Route path="/soporte"      element={<AtencionClienteScreen />} />
        <Route element={<AdminRoute />}>
          <Route path="/admin/usuarios"    element={<AdminScreen />} />
          <Route path="/admin/solicitudes" element={<AdminScreen />} />
          <Route path="/admin/reportes"    element={<AdminScreen />} />
        </Route>
      </Route>
    </Routes>
  )
}
