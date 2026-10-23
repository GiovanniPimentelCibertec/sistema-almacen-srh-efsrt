// Formulario de ajuste por conteo físico (equivale a dto/AjusteForm.java).
// Según el informe EFSRT (HU-04), el jefe ingresa la cantidad que hay físicamente y el motivo;
// el sistema calcula la diferencia y deja el stock igual al conteo.
const { MAXIMO_CANTIDAD, numero, entero, texto } = require('./comunes');

function validarAjuste(body) {
  const errores = [];
  const id_producto = entero(body.id_producto);
  const cantidad_fisica = numero(body.cantidad_fisica);
  const motivo = texto(body.motivo);
  if (!id_producto) errores.push('Seleccione el producto.');
  if (cantidad_fisica === null || Number.isNaN(cantidad_fisica) || cantidad_fisica < 0) {
    errores.push('Ingrese la cantidad que hay físicamente (0 o más).');
  } else if (cantidad_fisica > MAXIMO_CANTIDAD) {
    errores.push(`La cantidad no puede pasar de ${MAXIMO_CANTIDAD}.`);
  }
  if (!motivo) errores.push('Ingrese el motivo del ajuste.');
  else if (motivo.length > 200) errores.push('El motivo no puede pasar de 200 caracteres.');
  return { errores, datos: { id_producto, cantidad_fisica, motivo } };
}

module.exports = { validarAjuste };
