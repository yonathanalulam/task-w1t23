export type ResourceAvailabilityState = 'available' | 'full' | 'blackout';

export const availabilityState = (resource: { isBlackedOut: boolean; availableSeats: number }): ResourceAvailabilityState => {
  if (resource.isBlackedOut) {
    return 'blackout';
  }

  if (resource.availableSeats <= 0) {
    return 'full';
  }

  return 'available';
};

export const availabilityTone = (state: ResourceAvailabilityState): 'ok' | 'warn' | 'bad' => {
  if (state === 'available') {
    return 'ok';
  }
  if (state === 'full') {
    return 'warn';
  }
  return 'bad';
};

export const bookingErrorMessage = (message: string | undefined, code: string | undefined): string => {
  if (code === 'RESOURCE_BLACKED_OUT') {
    return message ?? 'Selected resource is in a maintenance blackout window.';
  }

  if (code === 'RESOURCE_CAPACITY_EXCEEDED') {
    return message ?? 'Requested seats exceed remaining capacity for the selected window.';
  }

  if (code === 'RESOURCE_BOOKING_CONFLICT') {
    return message ?? 'Another booking reserved this slot just now. Refresh availability and try again.';
  }

  if (code === 'BOOKING_OUTSIDE_BUSINESS_HOURS' || code === 'RESOURCE_CLOSED_DAY') {
    return message ?? 'Selected time is outside configured business hours.';
  }

  return message ?? 'Booking request failed.';
};
