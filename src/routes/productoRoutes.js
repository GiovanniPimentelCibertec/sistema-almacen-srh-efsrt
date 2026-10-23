// Productos (equivale a ProductoController.java) · CU06 · JEFE (el ASISTENTE solo ve)
const { rutasCatalogo } = require('./catalogos');
const productoService = require('../services/productoService');

module.exports = rutasCatalogo(productoService, {
  clave: 'productos',
  rolesLectura: ['JEFE', 'ASISTENTE'],
  rolesEscritura: ['JEFE'],
});
