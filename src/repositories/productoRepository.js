// Consultas de la tabla producto (equivale a ProductoRepository.java)
const SELECT = `
  SELECT p.*, c.nombre AS categoria, m.nombre AS marca,
         CASE WHEN p.stock <= p.stock_minimo THEN 'REPONER' ELSE 'OK' END AS situacion
    FROM producto p
    JOIN categoria c ON c.id_categoria = p.id_categoria
    LEFT JOIN marca m ON m.id_marca = p.id_marca`;

async function listar(db, { soloActivos = false } = {}) {
  const [filas] = await db.query(`${SELECT} ${soloActivos ? 'WHERE p.activo = 1' : ''} ORDER BY p.activo DESC, p.codigo`);
  return filas;
}

async function buscar(db, id) {
  const [[fila]] = await db.query(`${SELECT} WHERE p.id_producto = ?`, [id]);
  return fila || null;
}

/**
 * Bloquea los productos (SELECT ... FOR UPDATE, equivale a PESSIMISTIC_WRITE) en orden de id,
 * para que dos movimientos a la vez no se crucen. Devuelve un Map id -> producto.
 */
async function bloquear(db, ids) {
  const unicos = [...new Set(ids)].sort((a, b) => a - b);
  const mapa = new Map();
  for (const id of unicos) {
    const [[p]] = await db.query('SELECT * FROM producto WHERE id_producto = ? FOR UPDATE', [id]);
    if (p) mapa.set(id, p);
  }
  return mapa;
}

async function buscarPorCodigo(db, codigo) {
  const [[fila]] = await db.query('SELECT * FROM producto WHERE codigo = ?', [codigo]);
  return fila || null;
}

/** RN-02: un producto nuevo empieza con stock 0 y stock_minimo = minimo_inicial. */
async function insertar(db, p) {
  const [r] = await db.query(
    `INSERT INTO producto (codigo, nombre, unidad, id_categoria, id_marca, stock, stock_minimo, dias_reposicion, minimo_inicial)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    [p.codigo, p.nombre, p.unidad, p.id_categoria, p.id_marca, p.minimo_inicial, p.dias_reposicion, p.minimo_inicial]);
  return r.insertId;
}

/** El código y el stock no se editan: el stock solo cambia con movimientos. */
async function actualizar(db, id, p) {
  await db.query(
    `UPDATE producto SET nombre = ?, unidad = ?, id_categoria = ?, id_marca = ?, dias_reposicion = ?, minimo_inicial = ?
      WHERE id_producto = ?`,
    [p.nombre, p.unidad, p.id_categoria, p.id_marca, p.dias_reposicion, p.minimo_inicial, id]);
}

async function cambiarEstado(db, id, activo) {
  await db.query('UPDATE producto SET activo = ? WHERE id_producto = ?', [activo ? 1 : 0, id]);
}

async function actualizarStock(db, id, stock) {
  await db.query('UPDATE producto SET stock = ? WHERE id_producto = ?', [stock, id]);
}

/**
 * RN-07: stock mínimo = (salidas activas de los últimos 90 días ÷ 90) × días de reposición.
 * Sin salidas en esos 90 días, se usa el mínimo inicial.
 */
async function recalcularMinimo(db, id) {
  await db.query(`
    UPDATE producto p SET p.stock_minimo = COALESCE(ROUND((
        SELECT SUM(d.cantidad) FROM detalle_movimiento d
          JOIN movimiento m ON m.id_movimiento = d.id_movimiento
         WHERE d.id_producto = p.id_producto AND m.tipo = 'SALIDA' AND m.estado = 'ACTIVO'
           AND m.fecha >= NOW() - INTERVAL 90 DAY) / 90 * p.dias_reposicion, 2), p.minimo_inicial)
     WHERE p.id_producto = ?`, [id]);
}

module.exports = {
  listar, buscar, bloquear, buscarPorCodigo, insertar, actualizar, cambiarEstado, actualizarStock, recalcularMinimo,
};
