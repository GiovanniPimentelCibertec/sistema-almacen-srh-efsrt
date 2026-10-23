// Usuarios e inicio de sesión (equivale a UsuarioDetailsService.java y a la lógica de UsuarioController.java).
// Las contraseñas se guardan con bcrypt (10 rondas) y nunca en texto plano.
const bcrypt = require('bcryptjs');
const { getPool } = require('../config/db');
const { NegocioError, verificar } = require('../util/errores');
const { entero, texto } = require('../validators/comunes');
const usuarioRepo = require('../repositories/usuarioRepository');
const sedeRepo = require('../repositories/sedeRepository');
const { ROLES } = require('../models/Usuario');

/** CU01 + CU02: valida usuario y contraseña. Un usuario desactivado no puede entrar. */
async function autenticar(username, password) {
  const u = await usuarioRepo.buscarPorUsername(getPool(), texto(username));
  const ok = u && (await bcrypt.compare(String(password || ''), u.password));
  if (!ok) throw new NegocioError('Usuario o contraseña incorrectos.', 401);
  if (!u.activo) throw new NegocioError('Su usuario está desactivado. Consulte con el administrador.', 403);
  return { id_usuario: u.id_usuario, username: u.username, nombres: u.nombres, rol: u.rol, id_sede: u.id_sede, sede: u.sede };
}

async function listar() {
  return usuarioRepo.listar(getPool());
}

async function buscar(id) {
  const u = await usuarioRepo.buscar(getPool(), id);
  if (!u) throw new NegocioError('El usuario no existe.', 404);
  return u;
}

async function validar(body, esNuevo) {
  const datos = {
    nombres: texto(body.nombres),
    username: texto(body.username).toLowerCase(),
    rol: texto(body.rol),
    id_sede: entero(body.id_sede) || null,
    password: String(body.password || ''),
  };
  const errores = [];
  if (!datos.nombres) errores.push('Ingrese los nombres.');
  else if (datos.nombres.length > 100) errores.push('Los nombres no pueden pasar de 100 caracteres.');
  if (!/^[a-z0-9._-]{3,40}$/.test(datos.username)) {
    errores.push('El usuario debe tener de 3 a 40 caracteres: letras, números, punto, guion o guion bajo.');
  }
  if (!ROLES.includes(datos.rol)) errores.push('Elija el rol.');
  // Solo el rol SEDE lleva sede, y siempre la lleva
  if (datos.rol === 'SEDE') {
    const sede = datos.id_sede ? await sedeRepo.buscar(getPool(), datos.id_sede) : null;
    if (!sede || sede.tipo !== 'HOSPITAL' || !sede.activo) errores.push('Elija el hospital del encargado de sede.');
  } else {
    datos.id_sede = null;
  }
  if (esNuevo || datos.password) {
    if (datos.password.length < 6) errores.push('La contraseña debe tener al menos 6 caracteres.');
  }
  verificar(errores);
  if (datos.password) datos.password = await bcrypt.hash(datos.password, 10);
  return datos;
}

async function crear(body) {
  const datos = await validar(body, true);
  const id = await usuarioRepo.insertar(getPool(), datos);
  return { id_usuario: id, mensaje: `Usuario ${datos.username} registrado.` };
}

async function editar(id, body, idActual) {
  await buscar(id);
  const datos = await validar(body, false);
  if (id === idActual && datos.rol !== 'ADMINISTRADOR') throw new NegocioError('No puede quitarse a sí mismo el rol de administrador.');
  await usuarioRepo.actualizar(getPool(), id, datos);
  return { mensaje: `Usuario ${datos.username} actualizado.` };
}

async function cambiarEstado(id, activo, idActual) {
  const u = await buscar(id);
  if (id === idActual && !activo) throw new NegocioError('No puede desactivar su propio usuario.');
  await usuarioRepo.cambiarEstado(getPool(), id, activo);
  return { mensaje: `Usuario ${u.username} ${activo ? 'activado' : 'desactivado'}.` };
}

module.exports = { autenticar, listar, buscar, crear, editar, cambiarEstado };
