export function getCarrito() {
  const data = localStorage.getItem("carrito");
  return data ? JSON.parse(data) : [];
}

function actualizarCarrito(carrito) {
  localStorage.setItem("carrito", JSON.stringify(carrito));
  window.dispatchEvent(new Event("carritoActualizado"));
}

export function agregarAlCarrito(producto) {
  const carrito = getCarrito();

  const existe = carrito.find(item => item.id === producto.id);

  if (existe) {
    existe.cantidad += 1;
  } else {
    carrito.push({
      ...producto,
      cantidad: 1
    });
  }

  actualizarCarrito(carrito);
}

export function eliminarDelCarrito(id) {
  const carrito = getCarrito().filter(item => item.id !== id);
  actualizarCarrito(carrito);
}

export function cambiarCantidad(id, delta) {
  const carrito = getCarrito().map(item => {
    if (item.id === id) {
      return {
        ...item,
        cantidad: Math.max(1, item.cantidad + delta)
      };
    }
    return item;
  });

  actualizarCarrito(carrito);
}

export function contarItems() {
  return getCarrito().reduce((total, item) => total + item.cantidad, 0);
}