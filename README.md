# Avisar

Agenda de turnos para consultorios, construida alrededor de un solo trabajo:
**que el recordatorio del turno llegue por WhatsApp sin que nadie se acuerde de mandarlo.**

- Documento de arquitectura: [`docs/arquitectura-mvp.html`](docs/arquitectura-mvp.html)
- Backend: Node + TypeScript + Fastify + Prisma + PostgreSQL
- Frontend: React + Vite + TailwindCSS (mobile-first)
- WhatsApp: detrás de una interfaz. Arranca en modo consola, sin credenciales.

---

## Páginas públicas de privacidad

- `/privacidad.html`: política de privacidad; usar en el campo de Meta «URL de la Política de privacidad».
- `/eliminar-datos.html`: instrucciones de solicitud por correo; usar como «URL de las instrucciones para la eliminación de datos», no como callback automático.

Son documentos HTML públicos, sin inicio de sesión ni JavaScript, copiados por Vite al build y servidos por el mismo backend en producción. También están enlazados desde las pantallas de acceso y registro.
Las solicitudes se reciben y gestionan manualmente mediante el contacto indicado en ambas páginas. Actualizar el texto si cambian el responsable, los proveedores o el tratamiento de datos. Publicar estos enlaces no garantiza la aprobación de Meta ni reemplaza otros requisitos de la cuenta.

---

## Poner el proyecto en marcha

Requisitos: Node 20+, pnpm 9+, y PostgreSQL (por Docker o local).

```bash
pnpm install

# 1. Base de datos
docker compose up -d              # Postgres en el puerto 5433

# 2. Configuración del backend
cp apps/api/.env.example apps/api/.env

# 3. Tablas y datos de demo
pnpm db:migrate
pnpm db:seed

# 4. Backend + frontend juntos
pnpm dev
```

- API: http://localhost:3333
- Web: http://localhost:5173
- Cuenta de demo: `demo@avisar.app` / `demo1234`

### Sin Docker

Si tenés PostgreSQL instalado, alcanza con apuntar `DATABASE_URL` a tu base y
saltear el paso 1. El puerto por defecto del proyecto es 5433 justamente para no
chocar con una instalación local en 5432.

---

## Modo de prueba (así arranca)

`NOTIFICATION_PROVIDER=console` es el valor por defecto. Con eso:

- Las reglas, la programación, el job, los reintentos y el log funcionan de verdad.
- El mensaje se imprime en la terminal del backend en lugar de salir por WhatsApp.
- No hace falta ninguna credencial ni gastar un peso.

Se ve así:

```
┌────────────────────────────────────────────────────────────┐
  WHATSAPP → +5491144445558
  ref: f2e6e1f5-62ec-4e45-9af7-6e4b862182b8
├────────────────────────────────────────────────────────────┤
  Hola Diego Molina! Te recordamos tu turno con Ana Gómez
  el viernes, 28 de agosto a las 09:00 hs.

  Confirmá o cancelá acá: http://localhost:5173/t/Mhmgv-3aJ...

  Centro de Kinesiología Belgrano
└────────────────────────────────────────────────────────────┘
```

### Ver un recordatorio salir ahora mismo

El job corre cada minuto. Para no esperar 24 horas, adelantá un recordatorio:

```sql
UPDATE notification
SET scheduled_for = now() - interval '3 minutes'
WHERE id = (SELECT id FROM notification WHERE status='PENDING' ORDER BY scheduled_for LIMIT 1);
```

En menos de un minuto aparece en la terminal del backend, y el link que imprime
abre la pantalla real que ve el paciente.

---

## Conectar WhatsApp de verdad

Cuando quieras salir del modo de prueba, en `apps/api/.env`:

```env
NOTIFICATION_PROVIDER=twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+1XXXXXXXXXX   # el número que te asignó el sandbox
TWILIO_CONTENT_SID=HX...                     # plantilla aprobada
```

`TwilioNotificationProvider` es el único archivo del proyecto que sabe que
Twilio existe. Nada más cambia.

### La plantilla no es opcional

WhatsApp **no deja mandar texto libre** a alguien que no te escribió en las
últimas 24 horas. Un recordatorio siempre lo inicia el consultorio, así que
siempre necesita una plantilla aprobada por Meta. Sin ella, Twilio responde:

```
[21654] ContentSid Required
```

Se crea en **Twilio Console → Messaging → Content Template Builder**. El cuerpo
usa variables numeradas, y el proyecto las manda **en este orden**:

| Variable | Valor |
|---|---|
| `{{1}}` | Nombre del paciente |
| `{{2}}` | Profesional |
| `{{3}}` | Fecha |
| `{{4}}` | Hora |
| `{{5}}` | Link para confirmar o cancelar |

Ejemplo de cuerpo:

```
Hola {{1}}! Te recordamos tu turno con {{2}} el {{3}} a las {{4}} hs.
Confirmá o cancelá acá: {{5}}
```

Una vez aprobada, copiá su SID (`HX...`) a `TWILIO_CONTENT_SID`.

> Las plantillas se administran de forma centralizada en el proveedor. Los
> profesionales gestionan sus turnos y consultan la respuesta en la agenda.

---

## WhatsApp: un número central de Avisar

Avisar envía los recordatorios de todos los profesionales desde un único número.
El profesional carga el paciente, su teléfono y el turno; la aplicación programa
el recordatorio. El paciente abre el enlace recibido y confirma o cancela.
La agenda actualiza el estado automáticamente mientras está abierta.

Los profesionales no conectan cuentas de Meta ni editan o prueban mensajes desde
la aplicación. **Cuenta** conserva las opciones individual y consultorio.
La plantilla, las credenciales y la facturación del envío pertenecen a Avisar.

La regla inicial envía el recordatorio 24 horas antes. Las reservas realizadas
después de ese momento no generan un aviso retroactivo; la pantalla del turno
informa cuando no hay un recordatorio programado. Los pacientes deben tener
habilitada la recepción de recordatorios.

En **Cuenta → Recordatorios** se pueden agregar avisos, cambiar su anticipación
en horas o días y quitarlos. Cada horario distinto genera un aviso: por ejemplo,
2 días, 1 día y 2 horas antes son tres recordatorios. La anticipación admitida es
de 1 hora a 14 días. Los cambios afectan a los turnos nuevos; no se recalculan los
avisos de turnos ya agendados. Quitar un horario lo desactiva para nuevos turnos,
conservando los mensajes programados y el historial de los anteriores.

### Obtener los datos de configuración

La persona que administra Avisar configura estos valores en el servidor:

| Variable en `apps/api/.env` | Cómo obtenerla |
| --- | --- |
| `NOTIFICATION_PROVIDER` | Usar `meta` para el servicio central o `console` para pruebas locales sin mensajes reales. |
| `META_PHONE_NUMBER_ID` | [Meta for Developers](https://developers.facebook.com/apps/) → WhatsApp → configuración de la API → identificador del número central. |
| `META_ACCESS_TOKEN` | Token autorizado para enviar desde ese número, guardado únicamente en el servidor. |
| `META_APP_SECRET` | Configuración de la app de Meta → Básica → secreto de la app. Valida las notificaciones recibidas de Meta. |
| `META_WEBHOOK_VERIFY_TOKEN` | Generar un valor aleatorio local y usar el mismo en la configuración del webhook de Meta. |
| `WEB_APP_URL` | URL pública HTTPS donde el paciente abrirá la confirmación del turno. |
| `META_TEMPLATE_*` | Nombre, idioma y estructura de parámetros de la plantilla aprobada del número central. |

Configurar el webhook en `<URL_HTTPS_API>/api/webhooks/meta` y reiniciar la API
después de completar las variables. Si la configuración central está incompleta,
el proveedor queda **no disponible** y bloquea los envíos. No usa credenciales
guardadas por una organización como alternativa.

La respuesta se registra al pulsar **Sí/No** en la página del enlace. El sistema
no interpreta mensajes libres escritos en el chat de WhatsApp.

### Plantilla de recordatorio

En **WhatsApp Manager → Plantillas de mensajes** (business.facebook.com/wa/manage/message-templates),
creá una con categoría **Servicio** — así llama Meta en español a la que su
documentación nombra *Utility*. Se aprueba más rápido y es más barata que
Marketing.

Nombre en minúsculas con guiones bajos: `recordatorio_turno`.

Cuerpo:

```
Hola {{1}}! Te recordamos tu turno con {{2}} el {{3}} a las {{4}} hs.

¡Te esperamos!
```

> Meta **rechaza toda plantilla que termine en una variable**. El cierre de
> texto no es decorativo.

El link no va en el cuerpo: va en un **botón**, que para este público es mucho
más fácil de tocar que un enlace en medio de un párrafo.

En la sección **Botones → Llamada a la acción**:

| Campo | Valor |
|---|---|
| Tipo de acción | Ir al sitio web |
| Texto del botón | `Confirmá o cancelá acá` |
| Tipo de URL | **Dinámico** |
| URL | `https://TU-DOMINIO/t/{{1}}` |
| URL de muestra | `https://TU-DOMINIO/t/abc123` |

> **Dinámico, nunca Estático.** Con una URL estática todos los pacientes
> reciben el mismo link, y el token es justamente lo que identifica cada turno.

Y en el `.env`:

```env
META_TEMPLATE_NAME=recordatorio_turno
META_TEMPLATE_LANGUAGE=es_AR
META_TEMPLATE_PARAM_COUNT=4
META_TEMPLATE_URL_BUTTON=true
```

El orden posicional es contrato del código
(`TEMPLATE_VARIABLE_ORDER` en `render-template.ts`):

| Variable | Valor |
|---|---|
| `{{1}}` | Nombre del paciente |
| `{{2}}` | Profesional |
| `{{3}}` | Fecha |
| `{{4}}` | Hora |
| Botón `{{1}}` | Token del turno (el sufijo de la URL) |

Con `META_TEMPLATE_PARAM_COUNT=4` el cuerpo recibe las primeras cuatro y el
token viaja aparte, como parámetro del botón.

> El token temporal dura 24 horas. Para que no se venza todos los días,
> generá un token permanente desde un usuario del sistema en Business Manager.

> **Ojo:** `tsx watch` vigila los archivos `.ts`, **no el `.env`**. Después de
> tocar variables de entorno hay que matar el proceso y volver a levantarlo. Al
> arrancar, el log dice qué proveedor quedó activo — si dice `console`, no tomó
> el cambio.

---

## Base de datos en Neon

El backend conserva Prisma y su conexión PostgreSQL. Para conectar un proyecto
de Neon, ejecutar desde la raíz:

```bash
neon init -y --org-id <org-id> --project-id <project-id> --branch production --services postgres
neon deploy
```

Si la instalación de dependencias solicita indicar la raíz del workspace:

```bash
pnpm add -w @neon/config @neon/env
```

El CLI guarda `DATABASE_URL`, `DATABASE_URL_UNPOOLED` y `NEON_BRANCH` en
`.env.local`, o en `.env` si ya existe. La API carga primero las variables
inyectadas por el entorno, luego `.env.local` y `.env` de la raíz, y finalmente
los archivos equivalentes de `apps/api`. La configuración local restante se
conserva. Para volver a PostgreSQL local, retirar las variables de conexión de
Neon del archivo raíz o inyectar explícitamente las conexiones locales.

`DATABASE_URL` utiliza el pool de Neon para las consultas de la aplicación.
`DATABASE_URL_UNPOOLED` utiliza la conexión directa para migraciones; cuando
falta, Prisma CLI conserva el uso de `DATABASE_URL` para PostgreSQL local.

```bash
pnpm --filter @avisar/api db:deploy
npm run build
pnpm dev
```

En Render, configurar ambas variables de conexión como variables de entorno.
El contenedor aplica las migraciones antes de iniciar la API. Los archivos
`.env`, `.env.local` y `.neon` quedan excluidos de la imagen y las credenciales
no se guardan en Git. Las migraciones crean las tablas; los datos de la base
local no se transfieren automáticamente.

Los recordatorios actuales consultan la base cada minuto mientras el servidor
está activo. Esto puede impedir la suspensión de Neon y consumir la cuota
gratuita. La conexión a Neon no modifica ese comportamiento ni resuelve la
ejecución de recordatorios cuando Render Free está suspendido.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | Backend y frontend en paralelo |
| `pnpm dev:api` / `pnpm dev:web` | Uno solo |
| `pnpm test` | Tests del backend (no necesitan base ni Twilio) |
| `pnpm db:migrate` | Aplica migraciones |
| `pnpm db:seed` | Carga el consultorio de demo |
| `pnpm db:studio` | Explorador visual de la base |
| `pnpm build` | Compila todo |
| `pnpm --filter @avisar/api templates` | Lista las plantillas de Twilio y sus SIDs |

---

## Facturación electrónica (ARCA)

La sección **Facturas** emite comprobantes electrónicos contra ARCA a través de
un proveedor intermediario. Arranca en modo simulado, sin cuenta y sin costo.

### Cómo funciona

1. Cargás los datos fiscales del consultorio una vez: CUIT, razón social,
   condición frente al IVA y punto de venta.
2. Armás la factura. El tipo (A, B o C) **no se elige**: se deriva de tu
   condición y la del cliente. Un monotributista siempre emite C.
3. Revisás los números en pantalla.
4. Confirmás. Recién ahí se emite y se obtiene el CAE.

Ese paso 3 no es un adorno: una factura es un documento fiscal, y nada que
tenga validez legal debería salir de un solo clic.

### Modo simulado vs. real

**Facturas está disponible por defecto para todas las cuentas.** Cada usuario
configura el CUIT emisor desde la aplicación, sin solicitar una activación
manual. `INVOICING_ENABLED` solo es necesario si se quiere deshabilitar
explícitamente el módulo en un despliegue.

En producción, omitir la configuración no impide iniciar la aplicación: la
facturación queda disponible y la emisión bloqueada hasta configurar un proveedor
real. El proveedor simulado solo emite comprobantes de prueba fuera de producción.

| Variable | Valor | Qué pasa |
|---|---|---|
| `INVOICING_PROVIDER` | `fake` (por defecto) | Se simula el CAE. **No se emite nada real.** Sirve para construir y probar todo el circuito. |
| `INVOICING_PROVIDER` | `tusfacturas` | Se emite de verdad en ARCA. Requiere cuenta y credenciales. |

Para pasar a real, en `apps/api/.env`:

```
INVOICING_PROVIDER=tusfacturas
TUSFACTURAS_API_KEY=
TUSFACTURAS_API_TOKEN=
TUSFACTURAS_USER_TOKEN=
```

La app avisa en pantalla, en cada carga de la sección, cuando está en modo
simulado. Nadie debería creer que emitió una factura real cuando emitió una
simulación.

### Una factura emitida no se edita ni se borra

Existe en ARCA. Nuestra base es una copia, y borrar la copia no la deshace.
Un error se corrige con una nota de crédito.

---

## Estructura

```
apps/
  api/          Fastify + Prisma, un módulo por área de negocio
    src/modules/{auth,organizations,professionals,patients,appointments,notifications,public}/
      domain/           entidades e interfaces (sin dependencias externas)
      application/      casos de uso
      infrastructure/   Prisma, Twilio, tokens
      http/             rutas y validación
  web/          React + Vite, un feature por carpeta
packages/
  shared/       tipos y contratos compartidos entre API y web
```

La regla que no se negocia: `infrastructure` depende de `domain`, nunca al revés.
Por eso se puede cambiar Twilio o Prisma sin tocar un caso de uso.

---

## Lo que ya funciona

- Alta de cuenta con onboarding guiado de 4 pasos
- Pacientes: alta, edición, búsqueda por nombre o teléfono, opt-out de WhatsApp
- Normalización de teléfonos: `011 15-4444-9090` y `+54 9 11 4444 9090` son el mismo paciente
- Profesionales como fichas de agenda, sin login propio
- Turnos con detección de superposición (avisa, no bloquea)
- Agenda diaria y semanal, mobile-first
- Recordatorios automáticos desde el número central de Avisar y respuesta del paciente visible en la agenda
- Link de confirmar/cancelar para el paciente, con token de un solo uso
- Log de mensajes enviados, fallidos y no enviados

## Lo que queda afuera del MVP, a propósito

Login por profesional, roles y permisos, facturación, historia clínica, reserva
online por parte del paciente, turnos recurrentes, SMS y email.

El modelo de datos ya los soporta: `professional.user_id` está creado y en `null`.
Sumar logins más adelante es una feature, no una migración con clientes facturando.
# avisar
