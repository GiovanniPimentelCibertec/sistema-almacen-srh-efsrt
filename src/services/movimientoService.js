// Movimientos del almacén central: entradas, salidas a sedes y ajustes (equivale a MovimientoServiceImpl.java).
// Cada movimiento se guarda en UNA transacción (RN-05): si un producto falla, no queda nada guardado.
const { getPool, enTransaccion } = require('../config/db');
const { NegocioError, verificar } = require('../util/errores');
const { validarMovimiento } = require('../validators/movimientoForm');
const { validarAjuste } = require('../validators/ajusteForm');
const productoRepo = require('../repositories/productoRepository');
const movimientoRepo = require('../repositories/movimientoRepository');
const detalleRepo = require('../repositories/detalleMovimientoRepository');
const sedeRepo = require('../repositories/sedeRepository');

const redondear = (n) => Math.round(n * 100) / 100;
const nombreDe = (p) => `${p.codigo} ${p.nombre}`;

/** Bloquea los productos de las líneas y verifica que existan y estén activos. */
async function bloquearProductos(cn, lineas) {
  const productos = await productoRepo.bloquear(cn, lineas.map((l) => l.id_producto));
  const errores = [];
  for (const l of lineas) {
    const p = productos.get(l.id_producto);
    if (!p || !p.activo) errores.push('Un producto elegido no existe o está desactivado.');
  }
  verificar([...new Set(errores)]);
  return productos;
}

/** RN-07 y RN-08: recalcula el mínimo de los productos y devuelve los que quedaron por reponer. */
async function recalcularYAlertar(cn, ids) {
  const alertas = [];
  for (const id of ids) {
    await productoRepo.recalcularMinimo(cn, id);
    const p = await productoRepo.buscar(cn, id);
    if (Number(p.stock) <= Number(p.stock_minimo)) {
      alertas.push({ id_producto: id, codigo: p.codigo, nombre: p.nombre, stock: p.stock, stock_minimo: p.stock_minimo });
    }
  }
  return alertas;
}

/** CU07 · RF-04: entrada de uno o varios productos. La ENTRADA suma stock y no lleva sede (RN-03). */
async function registrarEntrada(idUsuario, body) {
  const { errores, datos } = validarMovimiento(body, false);
  verificar(errores);
  return enTransaccion(async (cn) => {
    const productos = await bloquearProductos(cn, datos.lineas);
    const id = await movimientoRepo.insertar(cn, { tipo: 'ENTRADA', observacion: datos.observacion, id_usuario: idUsuario });
    for (const l of datos.lineas) {
      const p = productos.get(l.id_producto);
      const saldo = redondear(Number(p.stock) + l.cantidad);
      await productoRepo.actualizarStock(cn, p.id_producto, saldo);
      await detalleRepo.insertar(cn, { id_movimiento: id, id_producto: p.id_producto, cantidad: l.cantidad, stock_resultante: saldo }); // RN-06
    }
    return { id_movimiento: id, mensaje: 'Entrada registrada.' };
  });
}

/**
 * CU08 · RF-05: salida a una sede (caso transaccional). Por producto se guarda lo pedido y lo despachado.
 * Si a un producto no le alcanza el stock, no se guarda nada y se avisa cuál (RN-04, RN-05).
 */
async function registrarSalida(idUsuario, body) {
  const { errores, datos } = validarMovimiento(body, true);
  verificar(errores);
  return enTransaccion(async (cn) => {
    const sede = await sedeRepo.buscar(cn, datos.id_sede);
    if (!sede || !sede.activo) throw new NegocioError('La sede elegida no existe o está desactivada.');

    const productos = await bloquearProductos(cn, datos.lineas);
    const sinStock = [];
    for (const l of datos.lineas) {
      const p = productos.get(l.id_producto);
      if (l.cantidad > Number(p.stock)) {
        sinStock.push(`Stock insuficiente de ${nombreDe(p)}: se quiere despachar ${l.cantidad} y solo hay ${Number(p.stock)}.`);
      }
    }
    verificar(sinStock);

    const id = await movimientoRepo.insertar(cn, {
      tipo: 'SALIDA', observacion: datos.observacion, id_usuario: idUsuario, id_sede: sede.id_sede,
    });
    for (const l of datos.lineas) {
      const p = productos.get(l.id_producto);
      const saldo = redondear(Number(p.stock) - l.cantidad);
      await productoRepo.actualizarStock(cn, p.id_producto, saldo);
      await detalleRepo.insertar(cn, {
        id_movimiento: id, id_producto: p.id_producto, cantidad_pedida: l.cantidad_pedida, cantidad: l.cantidad, stock_resultante: saldo,
      });
    }
    const alertas = await recalcularYAlertar(cn, datos.lineas.map((l) => l.id_producto));
    const incompleta = datos.lineas.some((l) => l.cantidad < l.cantidad_pedida);
    return {
      id_movimiento: id,
      mensaje: incompleta ? 'Salida registrada como entrega incompleta (se despachó menos de lo pedido).' : 'Salida registrada.',
      pendiente_confirmar: sede.tipo === 'HOSPITAL',
      alertas,
    };
  });
}

/**
 * CU09 · RF-06: ajuste por conteo físico (solo JEFE). Diferencia = cantidad física − stock guardado;
 * si es 0 no se registra nada. El stock queda igual a la cantidad física.
 */
async function registrarAjuste(idUsuario, body) {
  const { errores, datos } = validarAjuste(body);
  verificar(errores);
  return enTransaccion(async (cn) => {
    const productos = await bloquearProductos(cn, [{ id_producto: datos.id_producto }]);
    const p = productos.get(datos.id_producto);
    const diferencia = redondear(datos.cantidad_fisica - Number(p.stock));
    if (diferencia === 0) {
      throw new NegocioError(`El stock de ${nombreDe(p)} ya es ${Number(p.stock)}: coincide con el conteo y no se registró nada.`);
    }
    const id = await movimientoRepo.insertar(cn, { tipo: 'AJUSTE', observacion: datos.motivo, id_usuario: idUsuario });
    await productoRepo.actualizarStock(cn, p.id_producto, datos.cantidad_fisica);
    await detalleRepo.insertar(cn, { id_movimiento: id, id_producto: p.id_producto, cantidad: diferencia, stock_resultante: datos.cantidad_fisica });
    const alertas = await recalcularYAlertar(cn, [p.id_producto]);
    return {
      id_movimiento: id,
      diferencia,
      mensaje: `Ajuste registrado: ${diferencia > 0 ? '+' : ''}${diferencia}. El stock de ${nombreDe(p)} queda en ${datos.cantidad_fisica}.`,
      alertas,
    };
  });
}

async function listar(filtros) {
  return movimientoRepo.listar(getPool(), filtros);
}

async function buscarConDetalle(id) {
  const db = getPool();
  const m = await movimientoRepo.buscar(db, id);
  if (!m) throw new NegocioError('El movimiento no existe.', 404);
  m.detalles = await detalleRepo.porMovimiento(db, id);
  return m;
}

/** CU10 · RF-07: kardex de un producto con el saldo con el que empieza el periodo. */
async function kardex(idProducto, desde, hasta) {
  const db = getPool();
  const producto = await productoRepo.buscar(db, idProducto);
  if (!producto) throw new NegocioError('El producto no existe.', 404);
  if (desde > hasta) throw new NegocioError('La fecha «desde» no puede ser posterior a «hasta».');
  const saldoInicial = await detalleRepo.saldoAntesDe(db, idProducto, desde);
  const filas = await detalleRepo.kardex(db, idProducto, desde, hasta);
  let entradas = 0;
  let salidas = 0;
  for (const f of filas) {
    if (f.cantidad > 0 && f.tipo !== 'SALIDA') entradas += f.cantidad;
    else salidas += Math.abs(f.cantidad);
  }
  return { producto, desde, hasta, saldoInicial, filas, entradas: redondear(entradas), salidas: redondear(salidas) };
}

/** CU10 · RF-07: stock actual con su situación OK o REPONER (vista v_stock_actual, RN-08). */
async function stock({ categoria, situacion } = {}) {
  const where = [];
  const p = [];
  if (categoria) { where.push('categoria = ?'); p.push(categoria); }
  // La columna «situacion» de la vista toma la collation de la sesión que creó la vista (Workbench, consola o Node);
  // COLLATE explícito evita el error «Illegal mix of collations» sin importar cómo se cargó el script.
  if (situacion) { where.push('situacion = ? COLLATE utf8mb4_general_ci'); p.push(situacion); }
  const [filas] = await getPool().query(
    `SELECT * FROM v_stock_actual ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY situacion = 'REPONER' COLLATE utf8mb4_general_ci DESC, codigo`, p);
  return filas;
}

module.exports = { registrarEntrada, registrarSalida, registrarAjuste, listar, buscarConDetalle, kardex, stock, recalcularYAlertar };
