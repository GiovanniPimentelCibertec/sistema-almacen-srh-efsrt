// Consultas de la tabla consumo_sede y del stock de las sedes (equivale a ConsumoSedeRepository.java)
async function insertar(db, { id_sede, id_producto, id_usuario, tipo, cantidad, turno = null, motivo = null }) {
  const [r] = await db.query(
    `INSERT INTO consumo_sede (id_sede, id_producto, id_usuario, tipo, cantidad, turno, motivo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id_sede, id_producto, id_usuario, tipo, cantidad, turno, motivo]);
  return r.insertId;
}

async function buscar(db, id) {
  const [[fila]] = await db.query(
    `SELECT c.*, p.codigo, p.nombre AS producto, p.unidad FROM consumo_sede c
       JOIN producto p ON p.id_producto = c.id_producto WHERE c.id_consumo = ?`, [id]);
  return fila || null;
}

async function buscarParaActualizar(db, id) {
  const [[fila]] = await db.query('SELECT * FROM consumo_sede WHERE id_consumo = ? FOR UPDATE', [id]);
  return fila || null;
}

async function cambiarCantidad(db, id, cantidad) {
  await db.query('UPDATE consumo_sede SET cantidad = ? WHERE id_consumo = ?', [cantidad, id]);
}

async function anular(db, id) {
  await db.query("UPDATE consumo_sede SET estado = 'ANULADO' WHERE id_consumo = ?", [id]);
}

/** RN-09: stock de cada producto en la sede (vista v_stock_sede). */
async function stockSede(db, id_sede) {
  const [filas] = await db.query(
    `SELECT v.*, p.unidad, c.nombre AS categoria FROM v_stock_sede v
       JOIN producto p ON p.id_producto = v.id_producto
       JOIN categoria c ON c.id_categoria = p.id_categoria
      WHERE v.id_sede = ? ORDER BY v.codigo`, [id_sede]);
  return filas;
}

async function stockProducto(db, id_sede, id_producto) {
  const [[fila]] = await db.query(
    'SELECT stock_sede FROM v_stock_sede WHERE id_sede = ? AND id_producto = ?', [id_sede, id_producto]);
  return fila ? Number(fila.stock_sede) : 0;
}

/** Mismo producto y misma cantidad registrados hace menos de 10 minutos (posible duplicado). */
async function consumoReciente(db, id_sede, id_producto, cantidad) {
  const [[fila]] = await db.query(
    `SELECT id_consumo, fecha FROM consumo_sede
      WHERE id_sede = ? AND id_producto = ? AND cantidad = ? AND tipo = 'CONSUMO' AND estado = 'ACTIVO'
        AND fecha >= NOW() - INTERVAL 10 MINUTE
      ORDER BY fecha DESC LIMIT 1`, [id_sede, id_producto, cantidad]);
  return fila || null;
}

/** Consumo por producto en los últimos N días (para el uso diario del panel de sedes). */
async function consumoPorProductoDesde(db, id_sede, dias) {
  const [filas] = await db.query(
    `SELECT id_producto, SUM(cantidad) AS total FROM consumo_sede
      WHERE id_sede = ? AND tipo = 'CONSUMO' AND estado = 'ACTIVO' AND fecha >= NOW() - INTERVAL ? DAY
      GROUP BY id_producto`, [id_sede, dias]);
  return new Map(filas.map((f) => [f.id_producto, Number(f.total)]));
}

async function ultimoConsumo(db, id_sede) {
  const [[fila]] = await db.query(
    `SELECT MAX(fecha) AS fecha, TIMESTAMPDIFF(HOUR, MAX(fecha), NOW()) AS horas FROM consumo_sede
      WHERE id_sede = ? AND tipo = 'CONSUMO' AND estado = 'ACTIVO'`, [id_sede]);
  return fila && fila.fecha ? fila : null;
}

/** Registros de la sede de los últimos días, con lo necesario para la regla de 24 horas (RN-11). */
async function registros(db, id_sede, dias = 30) {
  const [filas] = await db.query(
    `SELECT c.*, p.codigo, p.nombre AS producto, p.unidad, u.username AS registrado_por,
            (c.fecha >= NOW() - INTERVAL 24 HOUR) AS dentro_24h,
            (SELECT COUNT(*) FROM registro_error e WHERE e.id_consumo = c.id_consumo AND e.estado = 'PENDIENTE') AS pendientes
       FROM consumo_sede c
       JOIN producto p ON p.id_producto = c.id_producto
       JOIN usuario u ON u.id_usuario = c.id_usuario
      WHERE c.id_sede = ? AND c.fecha >= NOW() - INTERVAL ? DAY
      ORDER BY c.fecha DESC, c.id_consumo DESC`, [id_sede, dias]);
  return filas;
}

module.exports = {
  insertar, buscar, buscarParaActualizar, cambiarCantidad, anular, stockSede, stockProducto, consumoReciente,
  consumoPorProductoDesde, ultimoConsumo, registros,
};
