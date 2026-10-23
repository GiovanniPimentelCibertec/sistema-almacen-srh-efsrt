// Productos (equivale a la lógica de ProductoController.java).
// RN-01: código único. RN-02: un producto nuevo empieza con stock 0 y stock mínimo = mínimo inicial.
// El stock nunca se edita a mano: solo cambia con entradas, salidas y ajustes.
const { getPool, enTransaccion } = require('../config/db');
const { NegocioError, verificar } = require('../util/errores');
const { numero, entero, texto } = require('../validators/comunes');
const productoRepo = require('../repositories/productoRepository');
const categoriaRepo = require('../repositories/categoriaRepository');
const marcaRepo = require('../repositories/marcaRepository');

async function listar(filtros) {
  return productoRepo.listar(getPool(), filtros);
}

async function buscar(id) {
  const p = await productoRepo.buscar(getPool(), id);
  if (!p) throw new NegocioError('El producto no existe.', 404);
  return p;
}

async function validar(body, esNuevo) {
  const datos = {
    codigo: texto(body.codigo).toUpperCase(),
    nombre: texto(body.nombre),
    unidad: texto(body.unidad),
    id_categoria: entero(body.id_categoria),
    id_marca: entero(body.id_marca) || null,
    dias_reposicion: entero(body.dias_reposicion),
    minimo_inicial: numero(body.minimo_inicial),
  };
  const errores = [];
  if (esNuevo && !/^[A-Z0-9-]{2,20}$/.test(datos.codigo)) {
    errores.push('El código debe tener de 2 a 20 caracteres: letras, números o guion (por ejemplo BOL-003).');
  }
  if (!datos.nombre) errores.push('Ingrese el nombre del producto.');
  else if (datos.nombre.length > 100) errores.push('El nombre no puede pasar de 100 caracteres.');
  if (!datos.unidad) errores.push('Ingrese la unidad (unidad, caja, paquete, galón...).');
  else if (datos.unidad.length > 20) errores.push('La unidad no puede pasar de 20 caracteres.');
  if (!datos.dias_reposicion || datos.dias_reposicion < 1 || datos.dias_reposicion > 365) {
    errores.push('Los días de reposición deben ser un número entero de 1 a 365.');
  }
  if (datos.minimo_inicial === null || Number.isNaN(datos.minimo_inicial) || datos.minimo_inicial < 0) {
    errores.push('Ingrese el stock mínimo inicial (0 o más).');
  }
  const db = getPool();
  const categoria = datos.id_categoria ? await categoriaRepo.buscar(db, datos.id_categoria) : null;
  if (!categoria || !categoria.activo) errores.push('Elija una categoría activa.');
  if (datos.id_marca) {
    const marca = await marcaRepo.buscar(db, datos.id_marca);
    if (!marca || !marca.activo) errores.push('La marca elegida no existe o está desactivada.');
  }
  verificar(errores);
  return datos;
}

async function crear(body) {
  const datos = await validar(body, true);
  const id = await productoRepo.insertar(getPool(), datos);
  return { id_producto: id, mensaje: `Producto ${datos.codigo} registrado con stock 0.` };
}

/** Al cambiar los días de reposición o el mínimo inicial, el stock mínimo se recalcula (RN-07). */
async function editar(id, body) {
  const actual = await buscar(id);
  const datos = await validar(body, false);
  await enTransaccion(async (cn) => {
    await productoRepo.actualizar(cn, id, datos);
    await productoRepo.recalcularMinimo(cn, id);
  });
  return { mensaje: `Producto ${actual.codigo} actualizado.` };
}

async function cambiarEstado(id, activo) {
  const p = await buscar(id);
  await productoRepo.cambiarEstado(getPool(), id, activo);
  return { mensaje: `Producto ${p.codigo} ${activo ? 'activado' : 'desactivado'}.` };
}

module.exports = { listar, buscar, crear, editar, cambiarEstado };
