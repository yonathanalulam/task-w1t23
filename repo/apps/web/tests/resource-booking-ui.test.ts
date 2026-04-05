import { describe, expect, it } from 'vitest';
import { availabilityState, availabilityTone, bookingErrorMessage } from '../src/lib/resource-booking-ui';

describe('resource booking UI helpers', () => {
  it('maps availability state and tone for resource cards', () => {
    expect(availabilityState({ isBlackedOut: false, availableSeats: 2 })).toBe('available');
    expect(availabilityTone('available')).toBe('ok');

    expect(availabilityState({ isBlackedOut: false, availableSeats: 0 })).toBe('full');
    expect(availabilityTone('full')).toBe('warn');

    expect(availabilityState({ isBlackedOut: true, availableSeats: 99 })).toBe('blackout');
    expect(availabilityTone('blackout')).toBe('bad');
  });

  it('returns conflict-aware booking error messages', () => {
    expect(bookingErrorMessage(undefined, 'RESOURCE_BLACKED_OUT')).toContain('maintenance blackout');
    expect(bookingErrorMessage(undefined, 'RESOURCE_CAPACITY_EXCEEDED')).toContain('remaining capacity');
    expect(bookingErrorMessage(undefined, 'RESOURCE_BOOKING_CONFLICT')).toContain('just now');
    expect(bookingErrorMessage(undefined, 'BOOKING_OUTSIDE_BUSINESS_HOURS')).toContain('outside configured business hours');
  });
});
