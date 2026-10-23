// Categorías y marcas (equivale a CategoriaService.java / CategoriaServiceImpl.java y a MarcaController.java).
// Según el informe EFSRT (RN-10), nada se borra: se desactivan. Una categoría o marca
// no se puede desactivar mientras algún producto activo la use.
const { getPool } = require('../config/db');
const { NegocioError, verificar } = require('../util/errores');
const { texto } = require('../validators/comunes');
const categoriaRepo = require('../repositories/categoriaRepository');
const marcaRepo = require('../repositories/marcaRepository');

function catalogo(repo, nombreSingular) {
  const etiqueta = nombreSingular.charAt(0).toUpperCase() + nombreSingular.slice(1);

  async function buscar(id) {
    const fila = await repo.buscar(getPool(), id);
    if (!fila) throw new NegocioError(`La ${nombreSingular} no existe.`, 404);
    return fila;
  }

  function validar(body) {
    const nombre = texto(body.nombre);
    const errores = [];
    if (!nombre) errores.push(`Ingrese el nombre de la ${nombreSingular}.`);
    else if (nombre.length > 60) errores.push('El nombre no puede pasar de 60 caracteres.');
    verificar(errores);
    return nombre;
  }

  return {
    listar: (filtros) => repo.listar(getPool(), filtros),
    buscar,
    async crear(body) {
      const nombre = validar(body);
      const id = await repo.insertar(getPool(), nombre);
      return { id, mensaje: `${etiqueta} ${nombre} registrada.` };
    },
    async editar(id, body) {
      await buscar(id);
      const nombre = validar(body);
      await repo.actualizar(getPool(), id, nombre);
      return { mensaje: `${etiqueta} ${nombre} actualizada.` };
    },
    async cambiarEstado(id, activo) {
      const fila = await buscar(id);
      if (!activo) {
        const n = await repo.productosActivos(getPool(), id);
        if (n > 0) throw new NegocioError(`No se puede desactivar: ${n} producto(s) activos usan esta ${nombreSingular}.`);
      }
      await repo.cambiarEstado(getPool(), id, activo);
      return { mensaje: `${etiqueta} ${fila.nombre} ${activo ? 'activada' : 'desactivada'}.` };
    },
  };
}

module.exports = {
  categorias: catalogo(categoriaRepo, 'categoría'),
  marcas: catalogo(marcaRepo, 'marca'),
};
