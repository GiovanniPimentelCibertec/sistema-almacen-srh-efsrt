// Módulo de sedes hospitalarias (equivale a HospitalService.java, con las reglas del informe EFSRT).
// La sede siempre sale de la sesión del encargado, nunca del formulario.
// El stock de la sede no se guarda: se calcula con la vista v_stock_sede (RN-09):
//   conteo INICIAL + envíos activos desde fecha_inicio_control − CONSUMO ± AJUSTE
const { getPool, enTransaccion } = require('../config/db');
const { NegocioError, verificar } = require('../util/errores');
const { MAXIMO_CANTIDAD, numero, entero, texto } = require('../validators/comunes');
const { stockSedeFila } = require('../validators/stockSedeFila');
const sedeRepo = require('../repositories/sedeRepository');
const productoRepo = require('../repositories/productoRepository');
const movimientoRepo = require('../repositories/movimientoRepository');
const detalleRepo = require('../repositories/detalleMovimientoRepository');
const consumoRepo = require('../repositories/consumoSedeRepository');
const errorRepo = require('../repositories/registroErrorRepository');

const redondear = (n) => Math.round(n * 100) / 100;
const MOTIVOS_CORRECCION = ['DIGITACION', 'DUPLICADO', 'PRODUCTO', 'OTRO'];

/** Turno según la hora: MAÑANA de 06:00 a 13:59, TARDE de 14:00 a 21:59 y NOCHE de 22:00 a 05:59. */
function turnoPara(fecha = new Date()) {
  const h = fecha.getHours();
  if (h >= 6 && h < 14) return 'MAÑANA';
  if (h >= 14 && h < 22) return 'TARDE';
  return 'NOCHE';
}

/** Sede del encargado: debe ser un hospital activo. */
async function sedeDe(db, idSede, { bloquear = false } = {}) {
  const sede = bloquear ? await sedeRepo.buscarParaActualizar(db, idSede) : await sedeRepo.buscar(db, idSede);
  if (!sede || sede.tipo !== 'HOSPITAL') throw new NegocioError('Su usuario no tiene un hospital asignado.', 403);
  if (!sede.activo) throw new NegocioError('El hospital está desactivado: no puede registrar nada.');
  return sede;
}

function exigirControlIniciado(sede) {
  if (!sede.fecha_inicio_control) {
    throw new NegocioError('Primero registre el conteo inicial de su sede.', 409);
  }
}

async function productoActivo(db, idProducto) {
  const p = await productoRepo.buscar(db, idProducto);
  if (!p || !p.activo) throw new NegocioError('El producto no existe o está desactivado.');
  return p;
}

/** Productos activos (solo los datos que necesita el encargado). */
async function productos() {
  const filas = await productoRepo.listar(getPool(), { soloActivos: true });
  return filas.map(({ id_producto, codigo, nombre, unidad, categoria }) => ({ id_producto, codigo, nombre, unidad, categoria }));
}

/** Resumen de la sede para su panel: estado del control, envíos por confirmar y stock. */
async function panel(idSede) {
  const db = getPool();
  const sede = await sedeDe(db, idSede);
  const resultado = { sede, control_iniciado: !!sede.fecha_inicio_control, envios: [], stock: [] };
  if (!resultado.control_iniciado) return resultado;
  resultado.envios = await enviosPendientes(idSede);
  resultado.stock = await stockSede(idSede);
  resultado.pendientes = await errorRepo.contarPendientes(db, idSede);
  return resultado;
}

/** Stock calculado de la sede con su uso diario (RN-09). */
async function stockSede(idSede) {
  const db = getPool();
  const sede = await sedeDe(db, idSede);
  exigirControlIniciado(sede);
  const filas = await consumoRepo.stockSede(db, idSede);
  const consumo7 = await consumoRepo.consumoPorProductoDesde(db, idSede, 7);
  return filas.map((f) => stockSedeFila(f, consumo7.get(f.id_producto) || 0));
}

/**
 * CU12: conteo inicial (una sola vez). Guarda una fila INICIAL por producto con cantidad mayor a 0
 * y llena fecha_inicio_control con la fecha de hoy. Los envíos anteriores a esa fecha no cuentan.
 */
async function conteoInicial(idSede, idUsuario, body) {
  const items = Array.isArray(body.items) ? body.items : [];
  const errores = [];
  const vistos = new Set();
  const filas = [];
  for (const it of items) {
    const id_producto = entero(it.id_producto);
    const cantidad = numero(it.cantidad);
    if (!id_producto) continue;
    if (cantidad === null || cantidad === 0) continue; // sin unidades: no se registra fila
    if (Number.isNaN(cantidad) || cantidad < 0) errores.push('Las cantidades del conteo deben ser 0 o más.');
    else if (cantidad > MAXIMO_CANTIDAD) errores.push(`La cantidad no puede pasar de ${MAXIMO_CANTIDAD}.`);
    else if (vistos.has(id_producto)) errores.push('Hay un producto repetido en el conteo.');
    else { vistos.add(id_producto); filas.push({ id_producto, cantidad }); }
  }
  verificar([...new Set(errores)]);

  return enTransaccion(async (cn) => {
    const sede = await sedeDe(cn, idSede, { bloquear: true });
    if (sede.fecha_inicio_control) {
      throw new NegocioError(`El conteo inicial ya se registró el ${sede.fecha_inicio_control}; use el conteo de verificación.`, 409);
    }
    for (const f of filas) {
      await productoActivo(cn, f.id_producto);
      await consumoRepo.insertar(cn, { id_sede: idSede, id_producto: f.id_producto, id_usuario: idUsuario, tipo: 'INICIAL', cantidad: f.cantidad, motivo: 'Conteo inicial' });
    }
    await sedeRepo.iniciarControl(cn, idSede);
    return { mensaje: `Conteo inicial registrado (${filas.length} productos con stock). Desde hoy se controla el stock de la sede.` };
  });
}

/** CU13: envíos de la sede que aún no se confirman, con sus productos. */
async function enviosPendientes(idSede) {
  const db = getPool();
  const sede = await sedeDe(db, idSede);
  if (!sede.fecha_inicio_control) return [];
  const envios = await movimientoRepo.enviosPendientes(db, idSede, sede.fecha_inicio_control);
  for (const e of envios) e.detalles = await detalleRepo.porMovimiento(db, e.id_movimiento);
  return envios;
}

async function envio(idSede, idMovimiento) {
  const db = getPool();
  const m = await movimientoRepo.buscar(db, idMovimiento);
  if (!m || m.tipo !== 'SALIDA' || m.id_sede !== idSede) throw new NegocioError('Ese envío no corresponde a su sede.', 404);
  m.detalles = await detalleRepo.porMovimiento(db, idMovimiento);
  return m;
}

/**
 * CU13 · RF-10: confirmar un envío. «Sí, llegó todo» = CONFORME.
 * «No, llegó diferente» = DIFERENTE y, por cada producto que llegó distinto, un registro_error PENDIENTE
 * para el jefe (acción DIFERENCIA, motivo ENVIO, valor anterior = enviado, valor nuevo = recibido).
 * recibidos = { id_producto: cantidad recibida } o null si llegó todo.
 */
async function confirmarEnvio(idSede, idUsuario, idMovimiento, body) {
  const llegoTodo = body.conforme === true || body.conforme === 'true';
  return enTransaccion(async (cn) => {
    const sede = await sedeDe(cn, idSede, { bloquear: true });
    exigirControlIniciado(sede);
    const m = await movimientoRepo.buscarParaActualizar(cn, idMovimiento);
    if (!m || m.tipo !== 'SALIDA' || m.id_sede !== idSede || m.estado !== 'ACTIVO') {
      throw new NegocioError('Ese envío no corresponde a su sede.', 404);
    }
    if (m.confirmado_sede) throw new NegocioError('Este envío ya fue confirmado.', 409);
    if (m.fecha.slice(0, 10) < sede.fecha_inicio_control) {
      throw new NegocioError('Este envío es anterior al conteo inicial de la sede y no se confirma.');
    }
    const detalles = await detalleRepo.porMovimiento(cn, idMovimiento);

    if (llegoTodo) {
      await movimientoRepo.marcarConfirmado(cn, idMovimiento, 'CONFORME');
      return { conforme: true, mensaje: 'Envío confirmado: llegó todo.' };
    }

    const recibidos = body.recibidos || {};
    const errores = [];
    const diferencias = [];
    for (const d of detalles) {
      const llego = numero(recibidos[d.id_producto]);
      if (llego === null || Number.isNaN(llego) || llego < 0) {
        errores.push(`${d.codigo}: indique cuántas unidades llegaron (0 si no llegó nada).`);
      } else if (llego > d.cantidad) {
        errores.push(`${d.codigo}: no pueden llegar más de las ${d.cantidad} enviadas.`);
      } else if (llego !== d.cantidad) {
        diferencias.push({ d, llego });
      }
    }
    verificar(errores);
    if (!diferencias.length) {
      await movimientoRepo.marcarConfirmado(cn, idMovimiento, 'CONFORME');
      return { conforme: true, mensaje: 'Todas las cantidades coinciden: el envío quedó conforme.' };
    }
    for (const { d, llego } of diferencias) {
      await errorRepo.insertar(cn, {
        id_movimiento: idMovimiento, accion: 'DIFERENCIA', valor_anterior: d.cantidad, valor_nuevo: llego, motivo: 'ENVIO',
        // El detalle empieza con el código del producto (punto abierto 2 de la lógica: la tabla no guarda el producto)
        detalle: `${d.codigo} ${d.producto}: se enviaron ${d.cantidad} y llegaron ${llego}`.slice(0, 200),
        id_usuario_reporta: idUsuario, estado: 'PENDIENTE',
      });
    }
    await movimientoRepo.marcarConfirmado(cn, idMovimiento, 'DIFERENTE');
    return {
      conforme: false,
      mensaje: `Envío registrado como DIFERENTE: ${diferencias.length} producto(s) quedaron pendientes de revisión del jefe.`,
    };
  });
}

/**
 * CU12 · RF-09: consumo por turno. No puede pasar el stock de la sede.
 * Si el mismo producto con la misma cantidad se registró hace menos de 10 minutos, pide confirmar.
 */
async function registrarConsumo(idSede, idUsuario, body) {
  const id_producto = entero(body.id_producto);
  const cantidad = numero(body.cantidad);
  const turno = body.turno ? texto(body.turno) : turnoPara();
  const errores = [];
  if (!id_producto) errores.push('Seleccione el producto.');
  if (cantidad === null || Number.isNaN(cantidad) || cantidad <= 0) errores.push('La cantidad usada debe ser mayor a 0.');
  else if (cantidad > MAXIMO_CANTIDAD) errores.push(`La cantidad no puede pasar de ${MAXIMO_CANTIDAD}.`);
  if (!['MAÑANA', 'TARDE', 'NOCHE'].includes(turno)) errores.push('Elija el turno: MAÑANA, TARDE o NOCHE.');
  verificar(errores);

  return enTransaccion(async (cn) => {
    // Se bloquea la sede para que dos registros a la vez no consuman más de lo que hay
    const sede = await sedeDe(cn, idSede, { bloquear: true });
    exigirControlIniciado(sede);
    const p = await productoActivo(cn, id_producto);
    const disponible = await consumoRepo.stockProducto(cn, idSede, id_producto);
    if (cantidad > disponible) {
      throw new NegocioError(`${p.codigo} ${p.nombre}: quiere registrar ${cantidad} y en la sede solo hay ${disponible} ${p.unidad}.`);
    }
    const confirmado = body.confirmar === true || body.confirmar === 'true';
    if (!confirmado) {
      const reciente = await consumoRepo.consumoReciente(cn, idSede, id_producto, cantidad);
      if (reciente) {
        const e = new NegocioError(`Ya se registró ${cantidad} ${p.unidad} de ${p.nombre} a las ${reciente.fecha.slice(11, 16)}. ¿Es otro consumo?`, 409);
        e.errores = [e.message];
        e.requiereConfirmacion = true;
        throw e;
      }
    }
    await consumoRepo.insertar(cn, { id_sede: idSede, id_producto, id_usuario: idUsuario, tipo: 'CONSUMO', cantidad, turno });
    const queda = redondear(disponible - cantidad);
    return { queda, mensaje: `Consumo registrado (turno ${turno}). En la sede quedan ${queda} ${p.unidad} de ${p.nombre}.` };
  });
}

/** CU12: conteo de verificación. Si no coincide con el stock calculado, guarda un AJUSTE por la diferencia. */
async function conteoVerificacion(idSede, idUsuario, body) {
  const id_producto = entero(body.id_producto);
  const fisica = numero(body.cantidad_fisica);
  const errores = [];
  if (!id_producto) errores.push('Seleccione el producto.');
  if (fisica === null || Number.isNaN(fisica) || fisica < 0) errores.push('Ingrese la cantidad que hay físicamente (0 o más).');
  else if (fisica > MAXIMO_CANTIDAD) errores.push(`La cantidad no puede pasar de ${MAXIMO_CANTIDAD}.`);
  verificar(errores);

  return enTransaccion(async (cn) => {
    const sede = await sedeDe(cn, idSede, { bloquear: true });
    exigirControlIniciado(sede);
    const p = await productoActivo(cn, id_producto);
    const calculado = await consumoRepo.stockProducto(cn, idSede, id_producto);
    const diferencia = redondear(fisica - calculado);
    if (diferencia === 0) {
      return { diferencia: 0, mensaje: `El conteo coincide con el sistema (${calculado} ${p.unidad}). No se registró ajuste.` };
    }
    await consumoRepo.insertar(cn, {
      id_sede: idSede, id_producto, id_usuario: idUsuario, tipo: 'AJUSTE', cantidad: diferencia, motivo: 'Conteo de verificación',
    });
    return {
      diferencia,
      mensaje: `El sistema tenía ${calculado} y se contaron ${fisica}: se registró un ajuste de ${diferencia > 0 ? '+' : ''}${diferencia} ${p.unidad}.`,
    };
  });
}

/** Mis registros: lo que la sede registró en los últimos 30 días, con la regla de 24 horas. */
async function registros(idSede) {
  const db = getPool();
  await sedeDe(db, idSede);
  return consumoRepo.registros(db, idSede, 30);
}

/**
 * CU14 · RF-11: corregir o anular un registro de la sede (RN-10, RN-11).
 * Menos de 24 horas: se aplica al momento (APROBADO). Más de 24 horas: queda PENDIENTE para el jefe.
 * Nada se borra: se corrige el mismo registro o se marca ANULADO, y el cambio queda en registro_error.
 */
async function corregirRegistro(idSede, idUsuario, idConsumo, body) {
  const accion = texto(body.accion).toUpperCase();
  const motivo = texto(body.motivo).toUpperCase();
  const detalle = texto(body.detalle);
  const errores = [];
  if (!['CORREGIR', 'ANULAR'].includes(accion)) errores.push('Elija si quiere corregir la cantidad o anular el registro.');
  if (!MOTIVOS_CORRECCION.includes(motivo)) errores.push('Elija el motivo: digitación, duplicado, producto equivocado u otro.');
  if (detalle.length > 200) errores.push('El detalle no puede pasar de 200 caracteres.');
  let nueva = null;
  if (accion === 'CORREGIR') {
    nueva = numero(body.cantidad_nueva);
    if (nueva === null || Number.isNaN(nueva)) errores.push('Ingrese la cantidad correcta.');
    else if (Math.abs(nueva) > MAXIMO_CANTIDAD) errores.push(`La cantidad no puede pasar de ${MAXIMO_CANTIDAD}.`);
  }
  verificar(errores);

  return enTransaccion(async (cn) => {
    await sedeDe(cn, idSede, { bloquear: true });
    const c = await consumoRepo.buscarParaActualizar(cn, idConsumo);
    if (!c || c.id_sede !== idSede) throw new NegocioError('Ese registro no es de su sede.', 404);
    if (c.estado !== 'ACTIVO') throw new NegocioError('Ese registro ya está anulado.', 409);
    if (await errorRepo.pendientesDelConsumo(cn, idConsumo)) {
      throw new NegocioError('Ese registro ya tiene una corrección pendiente de revisión del jefe.', 409);
    }
    if (accion === 'CORREGIR') {
      if (c.tipo === 'AJUSTE' ? nueva === 0 : nueva <= 0) {
        throw new NegocioError(c.tipo === 'AJUSTE' ? 'Un ajuste no puede quedar en 0; anúlelo.' : 'La cantidad debe ser mayor a 0; si el registro sobra, anúlelo.');
      }
      if (nueva === Number(c.cantidad)) throw new NegocioError('La cantidad nueva es igual a la registrada.');
    }
    const [[{ dentro }]] = await cn.query('SELECT (? >= NOW() - INTERVAL 24 HOUR) AS dentro', [c.fecha]);
    const error = {
      id_consumo: idConsumo, accion, valor_anterior: c.cantidad, valor_nuevo: accion === 'ANULAR' ? null : nueva,
      motivo, detalle, id_usuario_reporta: idUsuario,
    };
    if (!dentro) {
      await errorRepo.insertar(cn, { ...error, estado: 'PENDIENTE' });
      return { aplicado: false, mensaje: 'El registro tiene más de 24 horas: la corrección quedó pendiente para el jefe de logística.' };
    }
    await aplicarCorreccion(cn, c, accion, nueva);
    await errorRepo.insertar(cn, { ...error, estado: 'APROBADO' });
    return { aplicado: true, mensaje: accion === 'ANULAR' ? 'Registro anulado: ya no cuenta para el stock.' : 'Cantidad corregida.' };
  });
}

/**
 * Aplica una corrección o anulación a un registro de la sede dentro de la transacción.
 * Si el cambio dejaría el stock de la sede en negativo, no se aplica y se explica por qué.
 */
async function aplicarCorreccion(cn, c, accion, nueva) {
  if (accion === 'ANULAR') await consumoRepo.anular(cn, c.id_consumo);
  else await consumoRepo.cambiarCantidad(cn, c.id_consumo, nueva);
  const queda = await consumoRepo.stockProducto(cn, c.id_sede, c.id_producto);
  if (queda < 0) {
    const p = await productoRepo.buscar(cn, c.id_producto);
    throw new NegocioError(`No se puede: el stock de ${p.codigo} ${p.nombre} en la sede quedaría en ${queda}.`);
  }
}

module.exports = {
  turnoPara, productos, panel, stockSede, conteoInicial, enviosPendientes, envio, confirmarEnvio, registrarConsumo,
  conteoVerificacion, registros, corregirRegistro, aplicarCorreccion,
};
