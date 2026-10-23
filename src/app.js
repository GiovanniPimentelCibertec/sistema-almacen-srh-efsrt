// Arranque del sistema (equivale a SistemaAlmacenApplication.java).
// Express entrega las pantallas (carpeta public/) y responde las rutas /api/... en JSON.
require('dotenv').config();
const path = require('path');
const express = require('express');
const { sesion } = require('./config/seguridad');
const { routerPaginas, enviar } = require('./config/paginas');
const { manejarErrores } = require('./util/errores');

function crearApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '200kb' }));
  app.use(sesion());

  // Archivos públicos: estilos y JavaScript de las pantallas
  const publico = path.join(__dirname, '..', 'public');
  app.use('/css', express.static(path.join(publico, 'css')));
  app.use('/js', express.static(path.join(publico, 'js')));

  // API REST (una ruta por controller del proyecto Java)
  app.use('/api', require('./routes/homeRoutes'));
  app.use('/api/usuarios', require('./routes/usuarioRoutes'));
  app.use('/api/sedes', require('./routes/sedeRoutes'));
  app.use('/api/categorias', require('./routes/categoriaRoutes'));
  app.use('/api/marcas', require('./routes/marcaRoutes'));
  app.use('/api/productos', require('./routes/productoRoutes'));
  app.use('/api/movimientos', require('./routes/entradaRoutes'));
  app.use('/api/movimientos', require('./routes/salidaRoutes'));
  app.use('/api/movimientos', require('./routes/ajusteRoutes'));
  app.use('/api/movimientos', require('./routes/movimientoRoutes'));
  app.use('/api', require('./routes/consultaRoutes'));
  app.use('/api/sede', require('./routes/sedeHospitalRoutes'));
  app.use('/api', require('./routes/hospitalesRoutes'));
  app.use('/api/reportes', require('./routes/reporteRoutes'));
  app.use('/api', (req, res) => res.status(404).json({ ok: false, errores: ['Ruta no encontrada.'] }));

  // Pantallas (mismas URLs que el proyecto Java)
  app.use(routerPaginas());
  app.use((req, res) => enviar(res, 'error.html', 404));

  app.use(manejarErrores);
  return app;
}

if (require.main === module) {
  const puerto = Number(process.env.PORT || 3000);
  crearApp().listen(puerto, () => {
    console.log(`Sistema de almacén SRH en http://localhost:${puerto}`);
  });
}

module.exports = { crearApp };
