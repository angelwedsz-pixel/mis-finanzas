// Ayuda: preguntas frecuentes en lenguaje sencillo.

const QA = [
  ['¿Cómo la instalo en mi iPhone?',
    'Abre la app en <b>Safari</b>, toca <b>Compartir</b> (el cuadrado con la flecha) y elige <b>Agregar a pantalla de inicio</b>. Queda un ícono rojo "MF" como cualquier app.'],
  ['¿Necesito el computador encendido?',
    'No. La app y tus datos están en internet. Solo necesitas conexión a internet en el celular.'],
  ['¿Qué significa «Te quedan para gastar»?',
    'Es el dinero que tienes en el banco y en efectivo, menos lo que debes en tarjetas y menos lo que te falta pasar a tu ahorro este mes. Es lo que puedes gastar hasta el próximo pago; debajo verás cuánto es por día.'],
  ['¿Qué quiere decir el color?',
    'Verde: a tu ritmo actual, te alcanza. Amarillo: te alcanza, pero muy justo. Rojo: si sigues gastando igual, no te alcanza.'],
  ['¿Me pagan cada quincena, sirve igual?',
    'Sí. En <b>Ajustes → Salario</b> elige <b>Dos veces al mes (quincenal)</b> y los días de pago (por ejemplo 15 y 30). La app calcula cuánto te queda hasta el próximo pago y tu meta de ahorro por cada quincena.'],
  ['¿Qué hago el día que me pagan?',
    'Ve a <b>Anotar → Me pagaron</b> y escribe lo que te llegó de verdad. Si pasas plata a tu ahorro, usa <b>Ahorré</b>. La app nunca suma el salario sola.'],
  ['¿Ahorrar cuenta como gasto?',
    'No. Pasar plata a tu ahorro sigue siendo tu dinero, solo que en otra cuenta.'],
  ['¿Cómo manejo la tarjeta de crédito?',
    '<b>Sencillo:</b> cuando la pagues, usa <b>Pagué la tarjeta</b>. <b>Detallado:</b> crea la tarjeta en <b>Mis cuentas</b> con lo que debes hoy, anota cada compra pagada con ella y, al pagarla, usa <b>Pagué la tarjeta</b>. Así no se cuenta nada dos veces.'],
  ['Me equivoqué al anotar algo',
    'Ve a <b>Movimientos</b>, toca el movimiento y corrígelo o bórralo. Los saldos se arreglan solos.'],
  ['¿Mis datos están seguros?',
    'Cada persona entra con su usuario y contraseña y solo puede ver sus propios datos: lo garantiza la base de datos. Cambia tu contraseña en <b>Ajustes → Mi cuenta</b>. Si pierdes el celular, usa <b>Cerrar sesión en todos los dispositivos</b>.'],
  ['¿Se pueden perder mis datos?',
    'Están guardados en la nube. Aun así, de vez en cuando descarga una copia en <b>Ajustes → Copias</b> y guárdala en iCloud o Drive.'],
  ['Olvidé mi contraseña',
    'Pídele a quien administra la app (el dueño del proyecto en Supabase) que te asigne una nueva. Luego cámbiala en Ajustes.'],
];

export function renderHelp(ctx) {
  ctx.main.innerHTML = `<div class="page-head"><div><div class="eyebrow">Ayuda</div><h1>Preguntas frecuentes</h1></div></div>
    <div class="stack">${QA.map(([q, a]) => `<details class="card"><summary style="cursor:pointer;font-weight:600">${q}</summary>
      <p class="muted" style="margin-bottom:0">${a}</p></details>`).join('')}</div>`;
}
