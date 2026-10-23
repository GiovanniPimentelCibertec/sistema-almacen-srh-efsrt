// Ajustes por conteo físico (equivale a AjusteController.java) · CU09 · RF-06 · solo JEFE
const express = require('express');
const { permitir } = require('../config/seguridad');
const { ruta } = require('../util/errores');
const movimientoService = require('../services/movimientoService');

const router = express.Router();

// POST /api/movimientos/ajuste
router.post('/ajuste', permitir('JEFE'), ruta(async (req, res) => {
  res.status(201).json({ ok: true, ...(await movimientoService.registrarAjuste(req.usuario.id_usuario, req.body)) });
}));

module.exports = router;
