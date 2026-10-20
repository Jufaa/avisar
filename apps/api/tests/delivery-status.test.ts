import { describe, expect, it } from 'vitest';
import { parseDeliveryEvents, shouldApplyDelivery } from '../src/modules/notifications/domain/delivery-status.js';

/**
 * Recorded from Meta's documented payload examples, then trimmed to the fields
 * this code reads. The point of these is the edges: a provider contract we did
 * not write, delivered over the internet, with retries.
 */
function webhook(statuses: unknown[], value: Record<string, unknown> = {}) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550000000', phone_number_id: 'PNID' },
              statuses,
              ...value,
            },
          },
        ],
      },
    ],
  };
}

describe('parseDeliveryEvents', () => {
  it('reads a delivery report', () => {
    const events = parseDeliveryEvents(
      webhook([{ id: 'wamid.ABC', status: 'delivered', timestamp: '1720000000' }]),
    );

    expect(events).toEqual([
      { providerMessageId: 'wamid.ABC', status: 'DELIVERED', at: new Date(1720000000 * 1000) },
    ]);
  });

  it('reads a read report', () => {
    const [event] = parseDeliveryEvents(
      webhook([{ id: 'wamid.ABC', status: 'read', timestamp: '1720000000' }]),
    );
    expect(event.status).toBe('READ');
  });

  it('keeps the provider reason when a message never arrived', () => {
    const [event] = parseDeliveryEvents(
      webhook([
        {
          id: 'wamid.ABC',
          status: 'failed',
          timestamp: '1720000000',
          errors: [{ code: 131047, message: 'Re-engagement message' }],
        },
      ]),
    );

    expect(event.status).toBe('UNDELIVERED');
    expect(event.error).toBe('131047: Re-engagement message');
  });

  it('handles several reports in one body, which is how Meta batches them', () => {
    const events = parseDeliveryEvents(
      webhook([
        { id: 'wamid.A', status: 'delivered', timestamp: '1720000000' },
        { id: 'wamid.B', status: 'failed', timestamp: '1720000001' },
      ]),
    );

    expect(events.map((event) => event.providerMessageId)).toEqual(['wamid.A', 'wamid.B']);
  });

  /**
   * SENT already means the provider took the request. Recording it again would
   * be storing the same fact under a second name.
   */
  it('ignores the sent status, which restates what we already knew', () => {
    expect(
      parseDeliveryEvents(webhook([{ id: 'wamid.ABC', status: 'sent', timestamp: '1720000000' }])),
    ).toEqual([]);
  });

  it('ignores inbound patient messages, which share this endpoint', () => {
    const body = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [
            {
              value: {
                messaging_product: 'whatsapp',
                messages: [
                  { from: '15551234567', type: 'text', text: { body: 'holis' } },
                ],
              },
            },
          ],
        },
      ],
    };

    expect(parseDeliveryEvents(body)).toEqual([]);
  });

  /**
   * A body that is not what we expect must produce nothing, never an exception.
   * This endpoint answers requests from the internet; a crash is a 500 that
   * makes Meta retry forever.
   */
  it.each([
    ['null', null],
    ['a string', 'ok'],
    ['an array', []],
    ['a number', 7],
    ['an empty object', {}],
    ['another product', { object: 'instagram', entry: [] }],
    ['entry that is not a list', { object: 'whatsapp_business_account', entry: {} }],
    [
      'a change with no value',
      { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages' }] }] },
    ],
    [
      'another messaging product',
      { object: 'whatsapp_business_account', entry: [{ changes: [{ value: { statuses: [] } }] }] },
    ],
  ])('returns nothing for %s', (_label, body) => {
    expect(parseDeliveryEvents(body)).toEqual([]);
  });

  it('skips a status with no id, because it cannot be matched to a row', () => {
    expect(parseDeliveryEvents(webhook([{ status: 'delivered', timestamp: '1720000000' }]))).toEqual([]);
  });

  it('skips a status name it does not know, rather than guessing', () => {
    expect(
      parseDeliveryEvents(webhook([{ id: 'wamid.A', status: 'partially_delivered', timestamp: '1' }])),
    ).toEqual([]);
  });

  /**
   * A missing timestamp means we do not know when it happened, not that it did
   * not. Dropping the report would lose real delivery evidence.
   */
  it('falls back to now when the timestamp is missing or nonsense', () => {
    const before = Date.now();
    const events = parseDeliveryEvents(webhook([{ id: 'wamid.A', status: 'delivered' }]));
    const after = Date.now();

    expect(events[0].at.getTime()).toBeGreaterThanOrEqual(before);
    expect(events[0].at.getTime()).toBeLessThanOrEqual(after);
  });

  it('accepts a numeric timestamp', () => {
    const [event] = parseDeliveryEvents(
      webhook([{ id: 'wamid.A', status: 'delivered', timestamp: 1720000000 }]),
    );
    expect(event.at).toEqual(new Date(1720000000 * 1000));
  });
});

describe('shouldApplyDelivery', () => {
  it('applies the first report we get about a message', () => {
    expect(shouldApplyDelivery('UNKNOWN', 'DELIVERED')).toBe(true);
  });

  it('does not let a late delivered undo a read', () => {
    expect(shouldApplyDelivery('READ', 'DELIVERED')).toBe(false);
  });

  it('promotes a delivered to a read', () => {
    expect(shouldApplyDelivery('DELIVERED', 'READ')).toBe(true);
  });

  /**
   * The contradiction worth defining: the phone rang and then we are told it
   * failed. Meta does retry, so this ordering really happens.
   */
  it('does not let a late failed undo a delivered', () => {
    expect(shouldApplyDelivery('DELIVERED', 'UNDELIVERED')).toBe(false);
  });

  it('is idempotent, because Meta retries deliveries we already processed', () => {
    expect(shouldApplyDelivery('DELIVERED', 'DELIVERED')).toBe(false);
    expect(shouldApplyDelivery('READ', 'READ')).toBe(false);
    expect(shouldApplyDelivery('UNDELIVERED', 'UNDELIVERED')).toBe(false);
  });

  /**
   * The ladder ranks how much the message demonstrably arrived: it did not
   * arrive, it arrived, it was read. So genuinely better news does replace
   * worse news — the late report here is the more correct one.
   */
  it('promotes a message that later turns out to have arrived', () => {
    expect(shouldApplyDelivery('UNDELIVERED', 'DELIVERED')).toBe(true);
    expect(shouldApplyDelivery('UNDELIVERED', 'READ')).toBe(true);
  });

  it('does not let better news be undone by a report that arrives later', () => {
    expect(shouldApplyDelivery('DELIVERED', 'UNDELIVERED')).toBe(false);
    expect(shouldApplyDelivery('READ', 'UNDELIVERED')).toBe(false);
    expect(shouldApplyDelivery('READ', 'DELIVERED')).toBe(false);
  });
});
