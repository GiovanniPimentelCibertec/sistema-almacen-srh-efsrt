// Error de negocio (equivale a MovimientoException del proyecto Java):
// lleva uno o varios mensajes claros para mostrar en la pantalla.
class NegocioError extends Error {
  constructor(errores, status = 400) {
    const lista = Array.isArray(errores) ? errores : [errores];
    super(lista.join(' '));
    this.errores = lista;
    this.status = status;
  }
}

/** Lanza NegocioError si la lista de errores no está vacía. */
function verificar(errores) {
  if (errores.length) throw new NegocioError(errores);
}

/**
 * Convierte cualquier error en una respuesta JSON { ok: false, errores: [...] }.
 * Traduce los errores de MySQL que protegen las reglas (RN-01, RN-04) a mensajes claros.
 */
function manejarErrores(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof NegocioError) {
    return res.status(err.status).json({ ok: false, errores: err.errores });
  }
  if (err && err.code === 'ER_DUP_ENTRY') {
    let mensaje = 'Ese valor ya existe.';
    if (/codigo/.test(err.sqlMessage)) mensaje = 'Ese código ya existe.';
    else if (/username/.test(err.sqlMessage)) mensaje = 'Ese nombre de usuario ya existe.';
    else if (/nombre/.test(err.sqlMessage)) mensaje = 'Ese nombre ya existe.';
    return res.status(409).json({ ok: false, errores: [mensaje] });
  }
  if (err && err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
    return res.status(400).json({ ok: false, errores: ['La base de datos rechazó el dato: ' + err.sqlMessage] });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, errores: ['Los datos enviados no son válidos.'] });
  }
  console.error(err);
  return res.status(500).json({ ok: false, errores: ['Ocurrió un error inesperado. Inténtelo de nuevo.'] });
}

/** Envuelve una función async de Express para que sus errores lleguen a manejarErrores. */
const ruta = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { NegocioError, verificar, manejarErrores, ruta };
