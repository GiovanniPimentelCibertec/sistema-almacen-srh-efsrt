// Marcas (equivale a MarcaController.java) · CU06 · JEFE (listar: también ASISTENTE)
const { rutasCatalogo } = require('./catalogos');
const { marcas } = require('../services/categoriaService');

module.exports = rutasCatalogo(marcas, {
  clave: 'marcas',
  rolesLectura: ['JEFE', 'ASISTENTE'],
  rolesEscritura: ['JEFE'],
});
