// Inicio de sesión, usuario actual y panel de inicio (equivale a HomeController.java)
const express = require('express');
const { permitir } = require('../config/seguridad');
const { ruta } = require('../util/errores');
const usuarioService = require('../services/usuarioService');
const reporteService = require('../services/reporteService');

const router = express.Router();

// POST /api/login · CU01 + CU02
router.post('/login', ruta(async (req, res) => {
  const usuario = await usuarioService.autenticar(req.body.username, req.body.password);
  // Sesión nueva al entrar (evita reutilizar una sesión anterior)
  await new Promise((ok, mal) => req.session.regenerate((e) => (e ? mal(e) : ok())));
  req.session.usuario = usuario;
  res.json({ ok: true, usuario, inicio: usuario.rol === 'SEDE' ? '/sede' : '/' });
}));

// POST /api/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('srh.sid');
    res.json({ ok: true });
  });
});

// GET /api/me: nombre, rol y sede para armar el menú
router.get('/me', permitir(), (req, res) => res.json({ ok: true, usuario: req.usuario }));

// GET /api/panel
router.get('/panel', permitir('ADMINISTRADOR', 'JEFE', 'ASISTENTE'), ruta(async (req, res) => {
  res.json({ ok: true, ...(await reporteService.panel(req.usuario.rol)) });
}));

module.exports = router;
