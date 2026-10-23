// Entidad DetalleMovimiento: tabla `detalle_movimiento` (equivale a entity/MovimientoDetalle.java)
module.exports = {
  tabla: 'detalle_movimiento',
  id: 'id_detalle',
  campos: {
  id_movimiento: 'cabecera',
  id_producto: 'un producto una vez por movimiento',
  cantidad_pedida: 'solo en SALIDA',
  cantidad: 'en AJUSTE puede ser negativa; nunca 0',
  stock_resultante: 'saldo del kardex después del movimiento (RN-06)',
  },
};
