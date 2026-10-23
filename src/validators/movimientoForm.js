// Formulario de entrada o salida con varios productos (equivale a dto/MovimientoForm.java).
// La pantalla ya revisa lo básico; aquí se vuelve a revisar todo, porque la pantalla se puede saltar.
const { MAXIMO_CANTIDAD, numero, entero, texto } = require('./comunes');

/**
 * Valida el formulario y devuelve { observacion, id_sede, lineas } o la lista de errores.
 * lineas = [{ id_producto, cantidad_pedida, cantidad }]
 */
function validarMovimiento(body, esSalida) {
  const errores = [];
  const observacion = texto(body.observacion);
  if (observacion.length > 200) errores.push('La observación no puede pasar de 200 caracteres.');

  let id_sede = null;
  if (esSalida) {
    id_sede = entero(body.id_sede);
    if (!id_sede) errores.push('Seleccione la sede de destino.');
  }

  // Solo cuentan los renglones que el usuario llenó
  const crudas = Array.isArray(body.lineas) ? body.lineas : [];
  const llenas = crudas.filter((l) => l && (l.id_producto || l.cantidad || l.cantidad_pedida));
  if (!llenas.length) errores.push('Agregue al menos un producto.');

  const vistos = new Set();
  const lineas = [];
  llenas.forEach((l, i) => {
    const renglon = `Renglón ${i + 1}: `;
    const id_producto = entero(l.id_producto);
    if (!id_producto) {
      errores.push(renglon + 'seleccione el producto.');
      return;
    }
    if (vistos.has(id_producto)) errores.push(renglon + 'el producto está repetido; júntelo en un solo renglón.');
    vistos.add(id_producto);

    const cantidad = numero(l.cantidad);
    const cantidad_pedida = esSalida ? numero(l.cantidad_pedida) : null;
    if ((cantidad && cantidad > MAXIMO_CANTIDAD) || (cantidad_pedida && cantidad_pedida > MAXIMO_CANTIDAD)) {
      errores.push(renglon + `la cantidad no puede pasar de ${MAXIMO_CANTIDAD}.`);
      return;
    }
    if (esSalida) {
      if (!(cantidad_pedida > 0)) errores.push(renglon + 'la cantidad pedida debe ser mayor a 0.');
      if (!(cantidad > 0)) {
        errores.push(renglon + 'la cantidad despachada debe ser mayor a 0 (si no se envía nada, quite el producto).');
      } else if (cantidad_pedida > 0 && cantidad > cantidad_pedida) {
        errores.push(renglon + 'no se puede despachar más de lo pedido.');
      }
    } else if (!(cantidad > 0)) {
      errores.push(renglon + 'la cantidad recibida debe ser mayor a 0.');
    }
    lineas.push({ id_producto, cantidad_pedida, cantidad });
  });

  return { errores, datos: { observacion, id_sede, lineas } };
}

module.exports = { validarMovimiento };
