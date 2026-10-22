// Valores iniciales para una cuenta nueva (todo se puede cambiar en la app).

export const ACCOUNT_TYPES = {
  banco: 'Banco',
  efectivo: 'Efectivo',
  ahorro: 'Ahorro',
  credito: 'Tarjeta de crédito',
};

export const DEFAULT_SETTINGS = {
  frecuencia_pago: 'mensual',  // 'mensual' o 'quincenal'
  dia_pago: '30',              // pago mensual
  dia_pago_1: '15',            // pago quincenal: primer día
  dia_pago_2: '30',            // pago quincenal: segundo día
  salario_referencia: '0',
  ahorro_modo: 'fijo',        // 'fijo' o 'porcentaje'
  ahorro_valor: '0',          // pesos si es fijo, % si es porcentaje
  ahorro_extra_meta: '0',     // opcional, nunca obligatorio
  reservar_ahorro: '1',       // descontar del disponible la meta pendiente
};

export const DEFAULT_ACCOUNTS = [
  { name: 'Banco', type: 'banco' },
  { name: 'Efectivo', type: 'efectivo' },
  { name: 'Ahorro', type: 'ahorro' },
];

// [nombre, grupo, tipo, clave_sistema]
export const DEFAULT_CATEGORIES = [
  ['Almuerzos', 'Alimentación', 'gasto', null],
  ['Mercado', 'Alimentación', 'gasto', null],
  ['Restaurantes y domicilios', 'Alimentación', 'gasto', null],
  ['Transporte', 'Transporte', 'gasto', null],
  ['Gasolina', 'Transporte', 'gasto', null],
  ['Parqueadero', 'Transporte', 'gasto', null],
  ['Arriendo', 'Hogar', 'gasto', null],
  ['Servicios públicos', 'Hogar', 'gasto', null],
  ['Celular e internet', 'Hogar', 'gasto', null],
  ['Salud', 'Salud', 'gasto', null],
  ['Educación', 'Educación', 'gasto', null],
  ['Ocio y gustos', 'Ocio', 'gasto', null],
  ['Ropa y compras', 'Compras', 'gasto', null],
  ['Suscripciones', 'Suscripciones', 'gasto', null],
  ['Préstamos', 'Deudas', 'gasto', null],
  ['Pago de tarjeta (sin detalle)', 'Deudas', 'gasto', 'pago_tarjeta_sin_detalle'],
  ['Imprevistos', 'Imprevistos', 'gasto', null],
  ['Otros gastos', 'Otros', 'gasto', null],
  ['Salario', 'Ingresos', 'ingreso', 'salario'],
  ['Ingresos extra', 'Ingresos', 'ingreso', null],
  ['Devoluciones y reembolsos', 'Ingresos', 'ingreso', null],
  ['Rendimientos', 'Ingresos', 'ingreso', null],
];
