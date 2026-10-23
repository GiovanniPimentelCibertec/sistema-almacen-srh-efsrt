// Entidad Producto: tabla `producto` (equivale a entity/Producto.java)
module.exports = {
  tabla: 'producto',
  id: 'id_producto',
  campos: {
  codigo: 'VARCHAR(20), único (RN-01); no se cambia después de creado',
  nombre: 'VARCHAR(100)',
  unidad: 'unidad, caja, paquete, galón...',
  id_categoria: 'categoría (obligatoria)',
  id_marca: 'marca (opcional)',
  stock: 'stock del almacén central; empieza en 0 (RN-02) y solo cambia con movimientos',
  stock_minimo: 'calculado después de cada salida (RN-07)',
  dias_reposicion: 'días que tarda la reposición (> 0)',
  minimo_inicial: 'mínimo que se usa mientras no hay salidas',
  activo: '1 = activo, 0 = desactivado',
  },
};
