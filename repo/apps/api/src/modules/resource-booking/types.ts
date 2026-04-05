export const resourceTypes = ['ROOM', 'EQUIPMENT', 'CONSULTATION'] as const;
export type ResourceType = (typeof resourceTypes)[number];

export interface ResourceRecord {
  id: string;
  resourceType: ResourceType;
  name: string;
  description: string | null;
  location: string | null;
  capacity: number;
  timezone: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessHourRecord {
  id: number;
  resourceId: string;
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BlackoutWindowRecord {
  id: string;
  resourceId: string;
  startsAt: Date;
  endsAt: Date;
  reason: string;
  createdByUserId: string;
  createdAt: Date;
}

export interface ResourceAvailabilityRecord extends ResourceRecord {
  requestedStartsAt: Date;
  requestedEndsAt: Date;
  bookedSeats: number;
  availableSeats: number;
  isBlackedOut: boolean;
  blackoutReason: string | null;
}

export interface ResourceBookingRecord {
  id: string;
  resourceId: string;
  researcherUserId: string;
  startsAt: Date;
  endsAt: Date;
  seatsRequested: number;
  status: 'CONFIRMED' | 'CANCELLED';
  createdAt: Date;
  updatedAt: Date;
  resourceName?: string;
  resourceType?: ResourceType;
}
