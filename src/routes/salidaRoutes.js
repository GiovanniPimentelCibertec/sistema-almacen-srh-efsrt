// Salidas a sedes (equivale a SalidaController.java) · CU08 · RF-05 · JEFE y ASISTENTE
const express = require('express');
const { permitir } = require('../config/seguridad');
const { ruta } = require('../util/errores');
const movimientoService = require('../services/movimientoService');

const router = express.Router();

// POST /api/movimientos/salida
router.post('/salida', permitir('JEFE', 'ASISTENTE'), ruta(async (req, res) => {
  res.status(201).json({ ok: true, ...(await movimientoService.registrarSalida(req.usuario.id_usuario, req.body)) });
}));

module.exports = router;
