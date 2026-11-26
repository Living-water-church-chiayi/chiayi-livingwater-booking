export type BookingType = 'standard' | 'sunday-service' | 'special-service';

export type RepeatType = 'none' | 'daily' | 'weekly' | 'biweekly' | 'odd-weeks' | 'even-weeks';

export interface Booking {
  id: string;
  bookingType?: BookingType;
  venue: string;
  date: string;
  startTime: string;
  endTime: string;
  borrower: string;
  purpose: string;
  uid: string;
  authorName?: string;
  createdAt?: unknown;
  groupId?: string | null;
  repeat?: RepeatType;
  repeatUntil?: string;
  repeatForever?: boolean;
}

export interface BookingFormData {
  bookingType: BookingType;
  venue: string;
  date: string;
  startTime: string;
  endTime: string;
  borrower: string;
  purpose: string;
  repeat: RepeatType;
  repeatUntil: string;
  repeatForever: boolean;
}

export interface CalendarContextMenuState {
  dateStr: string;
  x: number;
  y: number;
}

export type SyncStatus = 'loading' | 'syncing' | 'live' | 'reconnecting' | 'error';

export type ConflictCandidate = Pick<
  Booking,
  'date' | 'startTime' | 'endTime' | 'venue' | 'bookingType' | 'purpose'
>;
