// Sedes: planta y hospitales (equivale a SedeService.java / SedeServiceImpl.java).
// Nada se borra (RN-10): una sede se desactiva.
const { getPool } = require('../config/db');
const { NegocioError, verificar } = require('../util/errores');
const { texto } = require('../validators/comunes');
const sedeRepo = require('../repositories/sedeRepository');
const { TIPOS } = require('../models/Sede');

async function listar(filtros) {
  return sedeRepo.listar(getPool(), filtros);
}

async function buscar(id) {
  const s = await sedeRepo.buscar(getPool(), id);
  if (!s) throw new NegocioError('La sede no existe.', 404);
  return s;
}

function validar(body) {
  const datos = { nombre: texto(body.nombre), tipo: texto(body.tipo) };
  const errores = [];
  if (!datos.nombre) errores.push('Ingrese el nombre de la sede.');
  else if (datos.nombre.length > 80) errores.push('El nombre no puede pasar de 80 caracteres.');
  if (!TIPOS.includes(datos.tipo)) errores.push('Elija si la sede es PLANTA u HOSPITAL.');
  verificar(errores);
  return datos;
}

async function crear(body) {
  const datos = validar(body);
  const id = await sedeRepo.insertar(getPool(), datos);
  return { id_sede: id, mensaje: `Sede ${datos.nombre} registrada.${datos.tipo === 'HOSPITAL' ? ' Su encargado debe registrar el conteo inicial.' : ''}` };
}

async function editar(id, body) {
  const actual = await buscar(id);
  const datos = validar(body);
  if (actual.tipo !== datos.tipo && actual.fecha_inicio_control) {
    throw new NegocioError('No se puede cambiar el tipo de un hospital que ya inició su control de stock.');
  }
  await sedeRepo.actualizar(getPool(), id, datos);
  return { mensaje: `Sede ${datos.nombre} actualizada.` };
}

async function cambiarEstado(id, activo) {
  const s = await buscar(id);
  await sedeRepo.cambiarEstado(getPool(), id, activo);
  return { mensaje: `Sede ${s.nombre} ${activo ? 'activada' : 'desactivada'}.` };
}

module.exports = { listar, buscar, crear, editar, cambiarEstado };
