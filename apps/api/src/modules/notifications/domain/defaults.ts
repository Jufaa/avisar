/**
 * What a brand-new account starts with. The reminder has to work on day one,
 * without the user opening a settings screen.
 */
export const DEFAULT_REMINDER_HOURS = 24;

export const DEFAULT_TEMPLATES = {
  reminder: {
    name: 'Recordatorio de turno',
    body:
      'Hola {nombre_paciente}! Te recordamos tu turno con {profesional} el {fecha} a las {hora} hs.\n\n' +
      'Confirmá o cancelá acá: {link}\n\n' +
      '{consultorio}',
  },
  confirmation: {
    name: 'Turno confirmado',
    body: 'Listo {nombre_paciente}, tu turno del {fecha} a las {hora} hs quedó confirmado. Te esperamos!',
  },
} as const;
