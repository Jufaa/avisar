import { describe, expect, it } from 'vitest';
import { renderTemplate, unknownVariables } from '../src/modules/notifications/domain/render-template.js';

const context = {
  patientName: 'María Suárez',
  professionalName: 'Juan Pérez',
  organizationName: 'Centro Belgrano',
  // 2026-09-03 14:30 in Buenos Aires (UTC-3)
  startsAt: new Date('2026-09-03T17:30:00.000Z'),
  timezone: 'America/Argentina/Buenos_Aires',
  link: 'https://avisar.app/t/abc123',
};

describe('renderTemplate', () => {
  it('replaces every supported variable', () => {
    const body = renderTemplate(
      'Hola {nombre_paciente}, turno con {profesional} el {fecha} a las {hora}. {consultorio}. {link}',
      context,
    );

    expect(body).toContain('María Suárez');
    expect(body).toContain('Juan Pérez');
    expect(body).toContain('Centro Belgrano');
    expect(body).toContain('14:30');
    expect(body).toContain('https://avisar.app/t/abc123');
  });

  it('renders the time in the organization timezone, not the server one', () => {
    const buenosAires = renderTemplate('{hora}', context);
    const madrid = renderTemplate('{hora}', { ...context, timezone: 'Europe/Madrid' });

    expect(buenosAires).toBe('14:30');
    expect(madrid).not.toBe(buenosAires);
  });

  it('leaves an unknown placeholder visible instead of blanking it', () => {
    // A visible {telefono} tells the user what they got wrong.
    // An empty gap tells them nothing.
    expect(renderTemplate('Llamanos al {telefono}', context)).toBe('Llamanos al {telefono}');
  });
});

describe('unknownVariables', () => {
  it('reports only the placeholders the system cannot fill', () => {
    expect(unknownVariables('{nombre_paciente} {telefono} {hora} {obra_social}')).toEqual([
      'telefono',
      'obra_social',
    ]);
  });

  it('returns nothing for a valid template', () => {
    expect(unknownVariables('Hola {nombre_paciente}, te esperamos el {fecha}')).toEqual([]);
  });
});
