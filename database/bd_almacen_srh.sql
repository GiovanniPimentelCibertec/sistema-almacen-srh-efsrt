-- =====================================================================
--  bd_almacen_srh  ·  Sistema web de gestión de almacén logístico
--  SRH S.A.C. · EFSRT I · Grupo 08
--  MySQL 8 (también funciona en MariaDB 10.5+)
--  9 tablas: usuario, sede, categoria, marca, producto, movimiento,
--            detalle_movimiento, consumo_sede, registro_error
--  Regla general: NADA se borra. Catálogos -> activo = 0.
--                 Movimientos y consumos -> estado = 'ANULADO'.
-- =====================================================================

DROP DATABASE IF EXISTS bd_almacen_srh;
CREATE DATABASE bd_almacen_srh CHARACTER SET utf8mb4 COLLATE utf8mb4_spanish_ci;
USE bd_almacen_srh;

-- ---------------------------------------------------------------------
-- 1. SEDE: planta y hospitales
-- ---------------------------------------------------------------------
CREATE TABLE sede (
  id_sede               INT AUTO_INCREMENT PRIMARY KEY,
  nombre                VARCHAR(80)  NOT NULL UNIQUE,
  tipo                  ENUM('PLANTA','HOSPITAL') NOT NULL,
  fecha_inicio_control  DATE NULL,              -- se llena con el conteo INICIAL
  activo                TINYINT(1) NOT NULL DEFAULT 1
);

-- ---------------------------------------------------------------------
-- 2. USUARIO: un solo rol; si es SEDE, va amarrado a una sede
-- ---------------------------------------------------------------------
CREATE TABLE usuario (
  id_usuario  INT AUTO_INCREMENT PRIMARY KEY,
  nombres     VARCHAR(100) NOT NULL,
  username    VARCHAR(40)  NOT NULL UNIQUE,                 -- RN-01
  password    VARCHAR(100) NOT NULL,                        -- hash bcrypt, nunca texto plano
  rol         ENUM('ADMINISTRADOR','JEFE','ASISTENTE','SEDE') NOT NULL,
  id_sede     INT NULL,
  activo      TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_usuario_sede FOREIGN KEY (id_sede) REFERENCES sede(id_sede),
  -- solo el rol SEDE lleva sede, y siempre la lleva
  CONSTRAINT ck_usuario_sede CHECK ((rol = 'SEDE' AND id_sede IS NOT NULL)
                                 OR (rol <> 'SEDE' AND id_sede IS NULL))
);

-- ---------------------------------------------------------------------
-- 3. CATEGORIA y 4. MARCA
-- ---------------------------------------------------------------------
CREATE TABLE categoria (
  id_categoria INT AUTO_INCREMENT PRIMARY KEY,
  nombre       VARCHAR(60) NOT NULL UNIQUE,
  activo       TINYINT(1) NOT NULL DEFAULT 1
);

CREATE TABLE marca (
  id_marca INT AUTO_INCREMENT PRIMARY KEY,
  nombre   VARCHAR(60) NOT NULL UNIQUE,
  activo   TINYINT(1) NOT NULL DEFAULT 1
);

-- ---------------------------------------------------------------------
-- 5. PRODUCTO: el stock del almacén central vive aquí
--    y solo cambia con movimientos (nunca a mano)
-- ---------------------------------------------------------------------
CREATE TABLE producto (
  id_producto      INT AUTO_INCREMENT PRIMARY KEY,
  codigo           VARCHAR(20)  NOT NULL UNIQUE,            -- RN-01
  nombre           VARCHAR(100) NOT NULL,
  unidad           VARCHAR(20)  NOT NULL,                   -- kg, unidad, paquete...
  id_categoria     INT NOT NULL,
  id_marca         INT NULL,
  stock            DECIMAL(10,2) NOT NULL DEFAULT 0,        -- RN-02: empieza en 0
  stock_minimo     DECIMAL(10,2) NOT NULL DEFAULT 0,
  dias_reposicion  INT NOT NULL DEFAULT 7,
  minimo_inicial   DECIMAL(10,2) NOT NULL DEFAULT 0,
  activo           TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_producto_categoria FOREIGN KEY (id_categoria) REFERENCES categoria(id_categoria),
  CONSTRAINT fk_producto_marca     FOREIGN KEY (id_marca)     REFERENCES marca(id_marca),
  CONSTRAINT ck_producto_stock     CHECK (stock >= 0),        -- RN-04 (red de seguridad)
  CONSTRAINT ck_producto_dias      CHECK (dias_reposicion > 0)
);

-- ---------------------------------------------------------------------
-- 6. MOVIMIENTO (cabecera) + 7. DETALLE_MOVIMIENTO  = kardex
-- ---------------------------------------------------------------------
CREATE TABLE movimiento (
  id_movimiento   INT AUTO_INCREMENT PRIMARY KEY,
  tipo            ENUM('ENTRADA','SALIDA','AJUSTE') NOT NULL,
  fecha           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  observacion     VARCHAR(200) NULL,                        -- guía de remisión, motivo del ajuste...
  id_usuario      INT NOT NULL,
  id_sede         INT NULL,                                 -- solo en SALIDA
  estado          ENUM('ACTIVO','ANULADO') NOT NULL DEFAULT 'ACTIVO',
  confirmado_sede ENUM('CONFORME','DIFERENTE') NULL,        -- NULL = pendiente
  CONSTRAINT fk_mov_usuario FOREIGN KEY (id_usuario) REFERENCES usuario(id_usuario),
  CONSTRAINT fk_mov_sede    FOREIGN KEY (id_sede)    REFERENCES sede(id_sede),
  CONSTRAINT ck_mov_sede    CHECK ((tipo = 'SALIDA' AND id_sede IS NOT NULL)
                                OR (tipo <> 'SALIDA' AND id_sede IS NULL))
);

CREATE TABLE detalle_movimiento (
  id_detalle        INT AUTO_INCREMENT PRIMARY KEY,
  id_movimiento     INT NOT NULL,
  id_producto       INT NOT NULL,
  cantidad_pedida   DECIMAL(10,2) NULL,                     -- solo en SALIDA
  cantidad          DECIMAL(10,2) NOT NULL,                 -- en AJUSTE puede ser negativa
  stock_resultante  DECIMAL(10,2) NOT NULL,                 -- RN-06: saldo del kardex
  CONSTRAINT fk_det_mov  FOREIGN KEY (id_movimiento) REFERENCES movimiento(id_movimiento),
  CONSTRAINT fk_det_prod FOREIGN KEY (id_producto)   REFERENCES producto(id_producto),
  CONSTRAINT ck_det_cant CHECK (cantidad <> 0),
  CONSTRAINT ck_det_saldo CHECK (stock_resultante >= 0),
  CONSTRAINT uq_det_mov_prod UNIQUE (id_movimiento, id_producto)  -- un producto una vez por movimiento
);

-- ---------------------------------------------------------------------
-- 8. CONSUMO_SEDE: lo que pasa dentro de cada hospital
-- ---------------------------------------------------------------------
CREATE TABLE consumo_sede (
  id_consumo   INT AUTO_INCREMENT PRIMARY KEY,
  id_sede      INT NOT NULL,
  id_producto  INT NOT NULL,
  id_usuario   INT NOT NULL,
  tipo         ENUM('INICIAL','CONSUMO','AJUSTE') NOT NULL,
  fecha        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cantidad     DECIMAL(10,2) NOT NULL,                      -- AJUSTE puede ser negativa
  turno        ENUM('MAÑANA','TARDE','NOCHE') NULL,         -- solo en CONSUMO
  motivo       VARCHAR(150) NULL,
  estado       ENUM('ACTIVO','ANULADO') NOT NULL DEFAULT 'ACTIVO',
  CONSTRAINT fk_cons_sede    FOREIGN KEY (id_sede)     REFERENCES sede(id_sede),
  CONSTRAINT fk_cons_prod    FOREIGN KEY (id_producto) REFERENCES producto(id_producto),
  CONSTRAINT fk_cons_usuario FOREIGN KEY (id_usuario)  REFERENCES usuario(id_usuario),
  CONSTRAINT ck_cons_cant    CHECK ((tipo = 'AJUSTE' AND cantidad <> 0)
                                 OR (tipo <> 'AJUSTE' AND cantidad > 0))
);

-- ---------------------------------------------------------------------
-- 9. REGISTRO_ERROR: cada corrección, anulación o diferencia
-- ---------------------------------------------------------------------
CREATE TABLE registro_error (
  id_error            INT AUTO_INCREMENT PRIMARY KEY,
  id_consumo          INT NULL,
  id_movimiento       INT NULL,
  accion              ENUM('CORREGIR','ANULAR','DIFERENCIA') NOT NULL,
  valor_anterior      DECIMAL(10,2) NULL,
  valor_nuevo         DECIMAL(10,2) NULL,
  motivo              ENUM('DIGITACION','DUPLICADO','PRODUCTO','ENVIO','OTRO') NOT NULL,
  detalle             VARCHAR(200) NULL,
  id_usuario_reporta  INT NOT NULL,
  id_usuario_revisa   INT NULL,
  fecha_reporte       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_revision      DATETIME NULL,
  estado              ENUM('PENDIENTE','APROBADO','RECHAZADO') NOT NULL DEFAULT 'PENDIENTE',
  CONSTRAINT fk_err_cons    FOREIGN KEY (id_consumo)         REFERENCES consumo_sede(id_consumo),
  CONSTRAINT fk_err_mov     FOREIGN KEY (id_movimiento)      REFERENCES movimiento(id_movimiento),
  CONSTRAINT fk_err_reporta FOREIGN KEY (id_usuario_reporta) REFERENCES usuario(id_usuario),
  CONSTRAINT fk_err_revisa  FOREIGN KEY (id_usuario_revisa)  REFERENCES usuario(id_usuario),
  CONSTRAINT ck_err_origen  CHECK (id_consumo IS NOT NULL OR id_movimiento IS NOT NULL)
);

-- =====================================================================
--  VISTAS para consultas y reportes (solo cuentan registros ACTIVOS)
-- =====================================================================

-- Stock actual con situación OK / REPONER  (RN-08)
CREATE VIEW v_stock_actual AS
SELECT p.id_producto, p.codigo, p.nombre, c.nombre AS categoria, p.unidad,
       p.stock, p.stock_minimo,
       CASE WHEN p.stock <= p.stock_minimo THEN 'REPONER' ELSE 'OK' END AS situacion
FROM producto p JOIN categoria c ON c.id_categoria = p.id_categoria
WHERE p.activo = 1;

-- Kardex del almacén central
CREATE VIEW v_kardex AS
SELECT d.id_producto, p.codigo, p.nombre AS producto, m.id_movimiento, m.fecha, m.tipo,
       s.nombre AS sede, d.cantidad_pedida, d.cantidad, d.stock_resultante,
       u.username AS registrado_por, m.observacion
FROM detalle_movimiento d
JOIN movimiento m ON m.id_movimiento = d.id_movimiento
JOIN producto   p ON p.id_producto   = d.id_producto
JOIN usuario    u ON u.id_usuario    = m.id_usuario
LEFT JOIN sede  s ON s.id_sede       = m.id_sede
WHERE m.estado = 'ACTIVO';

-- Stock de cada sede hospitalaria (RN-09):
-- INICIAL + envíos activos desde fecha_inicio_control - CONSUMO ± AJUSTE
CREATE VIEW v_stock_sede AS
SELECT s.id_sede, s.nombre AS sede, p.id_producto, p.codigo, p.nombre AS producto,
       COALESCE((SELECT SUM(cs.cantidad) FROM consumo_sede cs
                 WHERE cs.id_sede = s.id_sede AND cs.id_producto = p.id_producto
                   AND cs.estado = 'ACTIVO' AND cs.tipo = 'INICIAL'), 0)
     + COALESCE((SELECT SUM(d.cantidad) FROM movimiento m
                 JOIN detalle_movimiento d ON d.id_movimiento = m.id_movimiento
                 WHERE m.tipo = 'SALIDA' AND m.estado = 'ACTIVO'
                   AND m.id_sede = s.id_sede AND d.id_producto = p.id_producto
                   AND DATE(m.fecha) >= s.fecha_inicio_control), 0)
     - COALESCE((SELECT SUM(cs.cantidad) FROM consumo_sede cs
                 WHERE cs.id_sede = s.id_sede AND cs.id_producto = p.id_producto
                   AND cs.estado = 'ACTIVO' AND cs.tipo = 'CONSUMO'), 0)
     + COALESCE((SELECT SUM(cs.cantidad) FROM consumo_sede cs
                 WHERE cs.id_sede = s.id_sede AND cs.id_producto = p.id_producto
                   AND cs.estado = 'ACTIVO' AND cs.tipo = 'AJUSTE'), 0) AS stock_sede
FROM sede s CROSS JOIN producto p
WHERE s.tipo = 'HOSPITAL' AND s.activo = 1 AND p.activo = 1
  AND s.fecha_inicio_control IS NOT NULL;

-- Envíos pendientes de confirmar por cada sede
CREATE VIEW v_envios_pendientes AS
SELECT m.id_movimiento, m.fecha, m.id_sede, s.nombre AS sede
FROM movimiento m JOIN sede s ON s.id_sede = m.id_sede
WHERE m.tipo = 'SALIDA' AND m.estado = 'ACTIVO' AND s.tipo = 'HOSPITAL'
  AND m.confirmado_sede IS NULL;

-- Reporte: consumo (despachado) por sede y mes
CREATE VIEW v_despacho_sede_mes AS
SELECT DATE_FORMAT(m.fecha, '%Y-%m') AS mes, s.nombre AS sede,
       p.codigo, p.nombre AS producto, SUM(d.cantidad) AS total_despachado
FROM movimiento m
JOIN detalle_movimiento d ON d.id_movimiento = m.id_movimiento
JOIN sede s     ON s.id_sede     = m.id_sede
JOIN producto p ON p.id_producto = d.id_producto
WHERE m.tipo = 'SALIDA' AND m.estado = 'ACTIVO'
GROUP BY mes, s.nombre, p.codigo, p.nombre;

-- Reporte: productos bajo el mínimo y cuánto falta
CREATE VIEW v_bajo_minimo AS
SELECT codigo, nombre, unidad, stock, stock_minimo, (stock_minimo - stock) AS falta
FROM producto WHERE activo = 1 AND stock <= stock_minimo;

-- =====================================================================
--  DATOS INICIALES (de prueba)
--  Contraseña de todos los usuarios de prueba: 123456
--  (hash bcrypt generado con bcryptjs, 10 rondas)
-- =====================================================================
INSERT INTO sede (nombre, tipo) VALUES
 ('Planta Callao', 'PLANTA'), ('Hospital Barton', 'HOSPITAL'), ('Hospital Kaelin', 'HOSPITAL');

INSERT INTO usuario (nombres, username, password, rol, id_sede) VALUES
 ('Administrador del sistema', 'admin',     '$2a$10$GCXhw5iOCBGotwsUnKck2OPndMdvyDiVG77JjPh2PiXVl/bXw3/.y', 'ADMINISTRADOR', NULL),
 ('Jefe de logística',         'jefe',      '$2a$10$GCXhw5iOCBGotwsUnKck2OPndMdvyDiVG77JjPh2PiXVl/bXw3/.y', 'JEFE',          NULL),
 ('Asistente de almacén',      'asistente', '$2a$10$GCXhw5iOCBGotwsUnKck2OPndMdvyDiVG77JjPh2PiXVl/bXw3/.y', 'ASISTENTE',     NULL),
 ('Encargado Barton',          'barton',    '$2a$10$GCXhw5iOCBGotwsUnKck2OPndMdvyDiVG77JjPh2PiXVl/bXw3/.y', 'SEDE',          2),
 ('Encargado Kaelin',          'kaelin',    '$2a$10$GCXhw5iOCBGotwsUnKck2OPndMdvyDiVG77JjPh2PiXVl/bXw3/.y', 'SEDE',          3);

INSERT INTO categoria (nombre) VALUES
 ('Bolsas'), ('EPP'), ('Uniformes'), ('Limpieza y desinfección'), ('Útiles de escritorio');

INSERT INTO marca (nombre) VALUES ('Plastisur'), ('3M'), ('Genérica');

-- Producto nuevo: stock 0 y stock_minimo = minimo_inicial (RN-02)
INSERT INTO producto (codigo, nombre, unidad, id_categoria, id_marca, stock_minimo, dias_reposicion, minimo_inicial) VALUES
 ('BOL-001', 'Bolsa roja 60x80',             'unidad', 1, 1, 150, 7, 150),
 ('BOL-002', 'Bolsa negra 60x80',            'unidad', 1, 1,  80, 7,  80),
 ('EPP-001', 'Mascarilla KN95',              'unidad', 2, 2,  60, 7,  60),
 ('EPP-002', 'Guantes de nitrilo (caja x100)', 'caja', 2, 3,   4, 7,   4),
 ('UNI-001', 'Chaqueta scrub',               'unidad', 3, 3,  10, 15, 10),
 ('LIM-001', 'Alcohol 70% (galón)',          'galón',  4, 3,   4, 7,   4);
