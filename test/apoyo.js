// Apoyo de las pruebas (equivale a src/test/resources/application.properties + @BeforeEach de las pruebas Java).
// Cada prueba trabaja sobre una base aparte, bd_almacen_srh_test, creada desde el mismo script del proyecto.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const db = require('../src/config/db');
const { crearApp } = require('../src/app');

const BASE_PRUEBAS = 'bd_almacen_srh_test';
const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'database', 'bd_almacen_srh.sql'), 'utf8')
  .replace(/bd_almacen_srh\b/g, BASE_PRUEBAS);

const conexion = () => ({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
});

let servidor = null;
let url = null;

/**
 * Vuelve a crear la base de pruebas desde el script (datos iniciales limpios).
 * Se usa la misma collation que MySQL Workbench en MySQL 8 (utf8mb4_0900_ai_ci), porque las vistas
 * guardan la collation de la sesión que las creó: así las pruebas ven lo mismo que verá el equipo.
 */
async function reiniciarBase() {
  const cn = await mysql.createConnection({ ...conexion(), multipleStatements: true });
  await cn.query('SET NAMES utf8mb4 COLLATE utf8mb4_0900_ai_ci').catch(() => {}); // MariaDB no la tiene
  await cn.query(SCRIPT);
  await cn.end();
}

/** Crea la base, el pool y levanta el servidor en un puerto libre. */
async function iniciar() {
  await reiniciarBase();
  db.usarPool(db.crearPool({ database: BASE_PRUEBAS }));
  servidor = crearApp().listen(0);
  await new Promise((ok) => servidor.once('listening', ok));
  url = `http://127.0.0.1:${servidor.address().port}`;
}

async function terminar() {
  if (servidor) await new Promise((ok) => servidor.close(ok));
  await db.getPool().end();
}

/** Consulta directa a la base de pruebas (para verificar lo que quedó guardado). */
async function sql(consulta, parametros = []) {
  const [filas] = await db.getPool().query(consulta, parametros);
  return filas;
}

/** Cliente HTTP con su propia sesión (cookie). */
function cliente() {
  let cookie = '';
  async function pedir(metodo, ruta, cuerpo) {
    const res = await fetch(url + ruta, {
      method: metodo,
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const nueva = res.headers.get('set-cookie');
    if (nueva) cookie = nueva.split(';')[0];
    const tipo = res.headers.get('content-type') || '';
    const datos = tipo.includes('json') ? await res.json() : await res.text();
    return { status: res.status, datos, location: res.headers.get('location') };
  }
  return {
    get: (r) => pedir('GET', r),
    post: (r, c) => pedir('POST', r, c),
    put: (r, c) => pedir('PUT', r, c),
    del: (r) => pedir('DELETE', r),
    async login(username, password = '123456') {
      const r = await pedir('POST', '/api/login', { username, password });
      if (r.status !== 200) throw new Error(`No se pudo iniciar sesión con ${username}: ${JSON.stringify(r.datos)}`);
      return this;
    },
  };
}

const como = (username) => cliente().login(username);

// Ids de los datos iniciales del script
const SEDE = { PLANTA: 1, BARTON: 2, KAELIN: 3 };
const PROD = { BOLSA_ROJA: 1, BOLSA_NEGRA: 2, MASCARILLA: 3, GUANTES: 4, CHAQUETA: 5, ALCOHOL: 6 };

module.exports = { iniciar, terminar, reiniciarBase, sql, cliente, como, SEDE, PROD };
