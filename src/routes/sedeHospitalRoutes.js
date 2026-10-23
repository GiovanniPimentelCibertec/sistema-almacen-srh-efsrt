// Pantallas del encargado de sede (equivale a SedeHospitalController.java) · CU12, CU13, CU14 · solo SEDE.
// La sede SIEMPRE sale de la sesión (req.usuario.id_sede), nunca del formulario.
const express = require('express');
const { permitir } = require('../config/seguridad');
const { ruta } = require('../util/errores');
const { idDe } = require('./catalogos');
const hospitalService = require('../services/hospitalService');

const router = express.Router();
router.use(permitir('SEDE'));
const sede = (req) => req.usuario.id_sede;

// GET /api/sede/panel: estado del control, envíos por confirmar y stock
router.get('/panel', ruta(async (req, res) => res.json({ ok: true, ...(await hospitalService.panel(sede(req))) })));

// GET /api/sede/productos: productos activos para el conteo y el consumo (solo lectura)
router.get('/productos', ruta(async (req, res) => res.json({ ok: true, productos: await hospitalService.productos() })));

// GET /api/sede/stock: stock calculado de su sede (RN-09)
router.get('/stock', ruta(async (req, res) => res.json({ ok: true, stock: await hospitalService.stockSede(sede(req)) })));

// POST /api/sede/conteo-inicial
router.post('/conteo-inicial', ruta(async (req, res) => {
  res.status(201).json({ ok: true, ...(await hospitalService.conteoInicial(sede(req), req.usuario.id_usuario, req.body)) });
}));

// GET /api/sede/envios-pendientes
router.get('/envios-pendientes', ruta(async (req, res) => {
  res.json({ ok: true, envios: await hospitalService.enviosPendientes(sede(req)) });
}));

// GET /api/sede/envios/:id
router.get('/envios/:id', ruta(async (req, res) => {
  res.json({ ok: true, envio: await hospitalService.envio(sede(req), idDe(req)) });
}));

// PUT /api/sede/envios/:id/confirmar  -> { conforme: true } o { recibidos: { id_producto: cantidad } }
router.put('/envios/:id/confirmar', ruta(async (req, res) => {
  res.json({ ok: true, ...(await hospitalService.confirmarEnvio(sede(req), req.usuario.id_usuario, idDe(req), req.body)) });
}));

// GET /api/sede/turno: turno que corresponde a la hora actual
router.get('/turno', (req, res) => res.json({ ok: true, turno: hospitalService.turnoPara() }));

// POST /api/sede/consumo  -> { id_producto, cantidad, turno, confirmar }
router.post('/consumo', ruta(async (req, res) => {
  res.status(201).json({ ok: true, ...(await hospitalService.registrarConsumo(sede(req), req.usuario.id_usuario, req.body)) });
}));

// POST /api/sede/verificacion  -> { id_producto, cantidad_fisica }
router.post('/verificacion', ruta(async (req, res) => {
  res.status(201).json({ ok: true, ...(await hospitalService.conteoVerificacion(sede(req), req.usuario.id_usuario, req.body)) });
}));

// GET /api/sede/registros: mis registros de los últimos 30 días
router.get('/registros', ruta(async (req, res) => {
  res.json({ ok: true, registros: await hospitalService.registros(sede(req)) });
}));

// PUT /api/sede/consumos/:id/corregir  -> { accion, cantidad_nueva, motivo, detalle } (regla de 24 h)
router.put('/consumos/:id/corregir', ruta(async (req, res) => {
  res.json({ ok: true, ...(await hospitalService.corregirRegistro(sede(req), req.usuario.id_usuario, idDe(req), req.body)) });
}));

module.exports = router;
