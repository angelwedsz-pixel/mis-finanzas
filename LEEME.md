# Mis finanzas — versión web (celular y computador)

Funciona en el iPhone desde Safari, **sin depender de tu computador**. Cada persona entra con su
**usuario y contraseña** y solo ve sus propios datos. Todo es gratis.

- **La app** (pantallas): se publica en **GitHub Pages**.
- **Las cuentas y los datos**: se guardan en **Supabase** (base de datos en la nube).

Tus apps de computador (`finanzas_personales` y `finanzas_publico`) siguen funcionando igual.
Esta versión no las modifica.

---

## Paso 1 — Crear la base de datos en Supabase (10 minutos)

1. Entra a **supabase.com** → *Start your project* → crea tu cuenta (puedes usar GitHub o tu correo).
2. **New project**:
   - *Name*: `mis-finanzas`
   - *Database password*: inventa una y guárdala (no la necesitarás en la app).
   - *Region*: **South America (São Paulo)** (la más cercana a Colombia).
   - *Plan*: **Free**.
3. Cuando termine de crearse, abre **SQL Editor** → **New query**, pega **todo** el archivo
   `supabase/esquema.sql` y presiona **Run**. Debe decir *Success*.

## Paso 2 — Cerrar el registro y crear los usuarios

1. **Authentication → Sign In / Providers → Email**: desactiva **Allow new users to sign up**
   (así nadie puede crearse una cuenta por su cuenta) y guarda.
2. **Authentication → Users → Add user → Create new user**, una vez por persona:
   - *Email*: el usuario seguido de `@finanzas.invalid`. Ejemplo: `angel@finanzas.invalid`
   - *Password*: una contraseña de al menos 8 caracteres.
   - Marca **Auto Confirm User**.
3. En la app, esa persona entra solo con **angel** y su contraseña. Después puede cambiar la
   contraseña en *Ajustes → Mi cuenta* (así tú no la conocerás).

> `.invalid` es un dominio reservado que nunca recibe correos. Si Supabase dijera que el correo
> no es válido, avísame y lo cambiamos en `js/config.js`.

## Paso 3 — Conectar la app con Supabase

1. En Supabase abre **Project Settings → API** (o el botón **Connect**).
2. Copia **Project URL** y la llave **anon public** (o **publishable**).
3. Abre `js/config.js` con el Bloc de notas o VS Code y pégalas:
   ```js
   SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
   SUPABASE_KEY: 'eyJhbGciOi...  (o sb_publishable_...)',
   ```
   Esa llave es pública por diseño; la seguridad la dan las reglas de la base de datos.
   **Nunca** pongas la llave `service_role` / `secret`.

## Paso 4 — Publicar la app gratis en GitHub Pages

1. Crea una cuenta en **github.com**.
2. **New repository** → nombre `mis-finanzas` → **Public** → *Create repository*.
3. Toca **uploading an existing file** y arrastra **todo el contenido** de esta carpeta
   (`index.html`, `css`, `js`, `icons`, `manifest.webmanifest`, `sw.js`…). → *Commit changes*.
4. **Settings → Pages** → *Source*: **Deploy from a branch** → *Branch*: **main**, carpeta
   **/ (root)** → *Save*.
5. En uno o dos minutos aparece la dirección: `https://TU-USUARIO.github.io/mis-finanzas/`.

Cuando cambies algo (por ejemplo `config.js`), vuelve a subir ese archivo al repositorio.

## Paso 5 — Usarla en el iPhone

1. Abre la dirección en **Safari**.
2. Entra con tu usuario y contraseña.
3. Toca **Compartir** → **Agregar a pantalla de inicio**. Queda un ícono rojo "MF".

La primera vez la app te pide tus cuentas, cuánto tienes hoy y **cada cuánto te pagan
(mensual o quincenal)**.

## Traer tus datos de la app de computador

En la primera pantalla de la app toca **¿Ya usabas la versión de computador?** → **Traer mis
datos…** y elige el archivo `finanzas_personales\data\finanzas.db`. Hazlo desde el computador
(abriendo la dirección de GitHub Pages en el navegador). El archivo solo se lee: no se modifica.
También se puede hacer después en **Ajustes → Copias**.

## Novedades (primer actualizacion)

- **Corregir saldo**: en *Cuentas* toca una cuenta → *Corregir saldo* y escribe lo que tienes hoy.
  No crea cuentas ni movimientos nuevos.
- **Borrar cuentas**, aunque tengan movimientos (se borran también sus movimientos, con aviso).
- **Planes** (nuevo botón en la barra):
  - *Límites de gasto* por categoría en cada período de pago, con avisos al 80% y al pasarte.
  - *Pagos fijos* (arriendo, servicios, suscripciones) con su día de pago, recordatorio en Inicio
    y botón *Ya lo pagué* que anota el gasto.
  - *Metas de ahorro* con nombre, valor, fecha y cuánto apartar por mes.
- No requiere cambios en Supabase: los planes se guardan como ajustes de cada usuario.

## Bueno saber

- **Pago mensual o quincenal**: se elige en *Ajustes → Salario*. Con pago quincenal, el disponible,
  el dinero por día y la meta de ahorro se calculan por quincena.
- **Necesita internet** para guardar y ver los datos.
- El plan gratis de Supabase **pausa el proyecto si nadie lo usa en 7 días**. Los datos no se
  pierden: entra a supabase.com y toca *Resume project*. Con uso diario no pasa.
- El plan gratis **no hace copias automáticas**: de vez en cuando descarga una en
  *Ajustes → Copias* y guárdala en iCloud o Drive.
- Como dueño del proyecto en Supabase, tú podrías ver técnicamente los datos de otros usuarios
  desde el panel de Supabase. La app no se los muestra a nadie.
- **Alguien olvidó su contraseña**: como no hay correo, la cambias tú desde Supabase →
  **SQL Editor** con esta consulta (cambia el usuario y la clave nueva). Sus datos no se tocan:
  ```sql
  update auth.users
     set encrypted_password = extensions.crypt('ClaveNueva123', extensions.gen_salt('bf'))
   where email = 'usuario@finanzas.invalid';
  ```
  Luego esa persona entra con la clave nueva y la cambia en *Ajustes → Mi cuenta*.
- **Modo de prueba**: en la pantalla de ingreso, *Probar con datos de ejemplo* muestra la app con
  datos inventados guardados solo en ese navegador.

## Para quien quiera revisar el código

- `js/core/` — cálculos (iguales a la versión de computador) y períodos mensuales o quincenales.
- `js/data/` — conexión con Supabase, modo de prueba e importación de `finanzas.db`.
- `js/ui/` — pantallas. `css/app.css` — diseño rojo y negro.
- `supabase/esquema.sql` — tablas y reglas de seguridad (cada fila tiene dueño).
- Pruebas: `node --test tests/*.test.js` (requiere Node.js).
