// Pantallas del sistema: misma URL que en el proyecto Java, el archivo HTML que se entrega
// y los roles que pueden abrirla (equivale a los @GetMapping que devolvían una plantilla Thymeleaf).
const path = require('path');
const express = require('express');
const { usuarioActual } = require('./seguridad');

const PUBLIC = path.join(__dirname, '..', '..', 'public');
const ALMACEN = ['JEFE', 'ASISTENTE'];

const PAGINAS = [
  // Inicio
  ['/', 'inicio.html', ['ADMINISTRADOR', 'JEFE', 'ASISTENTE']],
  // Administrador: usuarios, sedes y categorías
  ['/usuarios', 'usuarios/lista.html', ['ADMINISTRADOR']],
  ['/usuarios/nuevo', 'usuarios/form.html', ['ADMINISTRADOR']],
  ['/usuarios/editar/:id', 'usuarios/form.html', ['ADMINISTRADOR']],
  ['/sedes', 'sedes/listar.html', ['ADMINISTRADOR']],
  ['/sedes/nuevo', 'sedes/formulario.html', ['ADMINISTRADOR']],
  ['/sedes/editar/:id', 'sedes/formulario.html', ['ADMINISTRADOR']],
  ['/categorias', 'categorias/listar.html', ['ADMINISTRADOR']],
  ['/categorias/nuevo', 'categorias/formulario.html', ['ADMINISTRADOR']],
  ['/categorias/editar/:id', 'categorias/formulario.html', ['ADMINISTRADOR']],
  // Jefe: productos y marcas (el asistente solo ve los productos)
  ['/productos', 'productos/listar.html', ALMACEN],
  ['/productos/nuevo', 'productos/formulario.html', ['JEFE']],
  ['/productos/editar/:id', 'productos/formulario.html', ['JEFE']],
  ['/marcas', 'marcas/listar.html', ['JEFE']],
  ['/marcas/nuevo', 'marcas/formulario.html', ['JEFE']],
  ['/marcas/editar/:id', 'marcas/formulario.html', ['JEFE']],
  // Movimientos del almacén central
  ['/entradas', 'movimientos/listar.html', ALMACEN],
  ['/entradas/nueva', 'movimientos/formulario.html', ALMACEN],
  ['/entradas/:id', 'movimientos/detalle.html', ALMACEN],
  ['/salidas', 'movimientos/listar.html', ALMACEN],
  ['/salidas/nueva', 'movimientos/formulario.html', ALMACEN],
  ['/salidas/:id', 'movimientos/detalle.html', ALMACEN],
  ['/ajustes', 'ajustes/listar.html', ['JEFE']],
  ['/ajustes/nuevo', 'ajustes/formulario.html', ['JEFE']],
  ['/movimientos', 'movimientos/listar.html', ALMACEN],
  ['/movimientos/:id', 'movimientos/detalle.html', ALMACEN],
  // Consultas
  ['/kardex', 'consultas/kardex.html', ALMACEN],
  ['/stock', 'consultas/stock.html', ALMACEN],
  // Jefe: panel de sedes, registro de errores y reportes
  ['/hospitales', 'hospitales/inicio.html', ['JEFE']],
  ['/errores', 'hospitales/errores.html', ['JEFE']],
  ['/reportes', 'reportes/inicio.html', ['JEFE']],
  ['/reportes/consumo-sede-mes', 'reportes/consumo.html', ['JEFE']],
  ['/reportes/bajo-minimo', 'reportes/reponer.html', ['JEFE']],
  // Encargado de sede (pantallas pensadas para el celular)
  ['/sede', 'sede/panel.html', ['SEDE']],
  ['/sede/conteo-inicial', 'sede/conteo-inicial.html', ['SEDE']],
  ['/sede/envio/:id', 'sede/envio.html', ['SEDE']],
  ['/sede/consumo', 'sede/consumo.html', ['SEDE']],
  ['/sede/verificacion', 'sede/verificacion.html', ['SEDE']],
  ['/sede/registros', 'sede/registros.html', ['SEDE']],
];

function enviar(res, archivo, status = 200) {
  res.status(status).sendFile(path.join(PUBLIC, archivo));
}

function routerPaginas() {
  const router = express.Router();

  router.get('/login', (req, res) => {
    const u = usuarioActual(req);
    if (u) return res.redirect(u.rol === 'SEDE' ? '/sede' : '/');
    enviar(res, 'login.html');
  });

  for (const [url, archivo, roles] of PAGINAS) {
    router.get(url, (req, res) => {
      const u = usuarioActual(req);
      if (!u) return res.redirect('/login');
      if (url === '/' && u.rol === 'SEDE') return res.redirect('/sede');
      if (!roles.includes(u.rol)) return enviar(res, 'error.html', 403);
      enviar(res, archivo);
    });
  }
  return router;
}

module.exports = { routerPaginas, PAGINAS, enviar };
