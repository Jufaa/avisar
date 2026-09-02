# Avisar

Agenda de turnos para consultorios, construida alrededor de un solo trabajo:
**que el recordatorio del turno llegue por WhatsApp sin que nadie se acuerde de mandarlo.**

- Documento de arquitectura: [`docs/arquitectura-mvp.html`](docs/arquitectura-mvp.html)
- Backend: Node + TypeScript + Fastify + Prisma + PostgreSQL
- Frontend: React + Vite + TailwindCSS (mobile-first)
- WhatsApp: detrás de una interfaz. Arranca en modo consola, sin credenciales.

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

> El texto editable dentro de la app sigue sirviendo: es lo que se ve en el log,
> en la vista previa y lo que manda el proveedor de consola. Meta solo restringe
> el mensaje real.

---

## Opción recomendada: Meta Cloud API (directo, gratis)

Twilio es un revendedor y su cuenta trial **bloquea las plantillas de WhatsApp**,
así que no se puede enviar nada desde la API hasta pagar. Meta directo es más
barato y, para desarrollar, más fácil.

El setup para desarrolladores da, sin tarjeta:

- Un número de prueba propio
- Hasta 5 números destinatarios verificados con un código
- La plantilla `hello_world` ya aprobada
- Plantillas propias, creadas y aprobadas gratis sobre ese número

### Pasos

1. Creá una app en <https://developers.facebook.com> y agregale el producto **WhatsApp**.
2. En **WhatsApp → API Setup** vas a encontrar:
   - **Phone number ID** (numérico) → `META_PHONE_NUMBER_ID`
   - **Temporary access token** (dura 24 h) → `META_ACCESS_TOKEN`
3. En esa misma pantalla, agregá tu celular como destinatario y verificalo con
   el código que te llega.
4. En `apps/api/.env`:

```env
NOTIFICATION_PROVIDER=meta
META_PHONE_NUMBER_ID=123456789012345
META_ACCESS_TOKEN=EAAG...
META_TEMPLATE_NAME=hello_world
META_TEMPLATE_LANGUAGE=en_US
META_TEMPLATE_PARAM_COUNT=0
```

5. Reiniciá el backend y probá desde **Recordatorios → Probalo con tu número**.

Eso ya te pone un WhatsApp real en el teléfono. Es feo — dice "Hello World" —
pero prueba que todo el circuito funciona de punta a punta.

### Después, tu plantilla de verdad

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
- Recordatorios automáticos con reglas configurables y plantilla editable
- Link de confirmar/cancelar para el paciente, con token de un solo uso
- Log de mensajes enviados, fallidos y no enviados

## Lo que queda afuera del MVP, a propósito

Login por profesional, roles y permisos, facturación, historia clínica, reserva
online por parte del paciente, turnos recurrentes, SMS y email.

El modelo de datos ya los soporta: `professional.user_id` está creado y en `null`.
Sumar logins más adelante es una feature, no una migración con clientes facturando.
# avisar
