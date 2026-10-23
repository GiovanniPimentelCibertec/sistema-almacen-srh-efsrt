// Usuarios (equivale a UsuarioController.java) · CU03 · solo ADMINISTRADOR
const { rutasCatalogo } = require('./catalogos');
const usuarioService = require('../services/usuarioService');

module.exports = rutasCatalogo(usuarioService, {
  clave: 'usuarios',
  rolesLectura: ['ADMINISTRADOR'],
  rolesEscritura: ['ADMINISTRADOR'],
});
