// Categorías (equivale a CategoriaController.java) · CU05 · ADMINISTRADOR (listar: también JEFE y ASISTENTE)
const { rutasCatalogo } = require('./catalogos');
const { categorias } = require('../services/categoriaService');

module.exports = rutasCatalogo(categorias, {
  clave: 'categorias',
  rolesLectura: ['ADMINISTRADOR', 'JEFE', 'ASISTENTE'],
  rolesEscritura: ['ADMINISTRADOR'],
});
