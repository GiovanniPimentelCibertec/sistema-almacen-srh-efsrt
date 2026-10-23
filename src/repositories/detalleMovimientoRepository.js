// Consultas de la tabla detalle_movimiento y del kardex (equivale a MovimientoDetalleRepository.java)
async function insertar(db, { id_movimiento, id_producto, cantidad_pedida = null, cantidad, stock_resultante }) {
  await db.query(
    `INSERT INTO detalle_movimiento (id_movimiento, id_producto, cantidad_pedida, cantidad, stock_resultante)
     VALUES (?, ?, ?, ?, ?)`,
    [id_movimiento, id_producto, cantidad_pedida, cantidad, stock_resultante]);
}

async function porMovimiento(db, id_movimiento) {
  const [filas] = await db.query(
    `SELECT d.*, p.codigo, p.nombre AS producto, p.unidad
       FROM detalle_movimiento d JOIN producto p ON p.id_producto = d.id_producto
      WHERE d.id_movimiento = ? ORDER BY p.codigo`, [id_movimiento]);
  return filas;
}

/** Kardex de un producto entre dos fechas (vista v_kardex: solo movimientos activos). */
async function kardex(db, id_producto, desde, hasta) {
  const [filas] = await db.query(
    `SELECT * FROM v_kardex WHERE id_producto = ? AND fecha >= ? AND fecha < ? + INTERVAL 1 DAY
      ORDER BY fecha, id_movimiento`,
    [id_producto, desde + ' 00:00:00', hasta]);
  return filas;
}

/** Saldo con el que empieza el kardex: el saldo del último movimiento activo antes de «desde». */
async function saldoAntesDe(db, id_producto, desde) {
  const [[fila]] = await db.query(
    `SELECT stock_resultante FROM v_kardex WHERE id_producto = ? AND fecha < ?
      ORDER BY fecha DESC, id_movimiento DESC LIMIT 1`,
    [id_producto, desde + ' 00:00:00']);
  return fila ? fila.stock_resultante : 0;
}

/** Últimos movimientos activos (panel de inicio). */
async function ultimos(db, limite = 8) {
  const [filas] = await db.query('SELECT * FROM v_kardex ORDER BY fecha DESC, id_movimiento DESC LIMIT ?', [limite]);
  return filas;
}

module.exports = { insertar, porMovimiento, kardex, saldoAntesDe, ultimos };
