// Conexión a MySQL (equivale a spring.datasource.* de application.properties)
const mysql = require('mysql2/promise');

let pool = null;

function crearPool(opciones = {}) {
  return mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bd_almacen_srh',
    waitForConnections: true,
    connectionLimit: 10,
    decimalNumbers: true,   // DECIMAL llega como número, no como texto
    dateStrings: true,      // las fechas llegan tal como las guarda MySQL ('2026-10-22 08:15:00')
    charset: 'utf8mb4',
    ...opciones,
  });
}

/** Pool compartido por toda la aplicación. */
function getPool() {
  if (!pool) pool = crearPool();
  return pool;
}

/** Permite usar otra base (las pruebas usan bd_almacen_srh_test). */
function usarPool(nuevo) {
  pool = nuevo;
}

/**
 * Ejecuta fn dentro de una transacción: todo o nada (RN-05).
 * Si fn lanza un error, se hace ROLLBACK y no queda nada guardado.
 */
async function enTransaccion(fn) {
  const cn = await getPool().getConnection();
  try {
    await cn.beginTransaction();
    const resultado = await fn(cn);
    await cn.commit();
    return resultado;
  } catch (e) {
    await cn.rollback();
    throw e;
  } finally {
    cn.release();
  }
}

module.exports = { crearPool, getPool, usarPool, enTransaccion };
