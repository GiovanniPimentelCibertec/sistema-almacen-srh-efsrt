// Fila del stock de una sede con su uso diario y los días que le alcanza (equivale a dto/StockSedeFila.java).
// Uso diario = consumo de los últimos 7 días ÷ 7; días que alcanza = stock de la sede ÷ uso diario.
const DIAS_ALERTA = 2; // en rojo si alcanza para 2 días o menos

function stockSedeFila(fila, consumo7) {
  const stock = Number(fila.stock_sede);
  const usoDiario = Math.round((consumo7 / 7) * 100) / 100;
  const dias = usoDiario > 0 ? Math.floor((stock / usoDiario) * 10) / 10 : null;
  return {
    id_producto: fila.id_producto,
    codigo: fila.codigo,
    producto: fila.producto,
    unidad: fila.unidad,
    categoria: fila.categoria,
    stock_sede: stock,
    consumo_7_dias: consumo7,
    uso_diario: usoDiario,
    dias_alcanza: dias,                         // null = «sin consumo»
    alerta: dias !== null && dias <= DIAS_ALERTA,
  };
}

module.exports = { stockSedeFila, DIAS_ALERTA };
