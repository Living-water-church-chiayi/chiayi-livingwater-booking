import {
  BOOKING_TYPE_LABELS,
  CHURCH_WIDE_PURPOSE_PRESETS,
  CHURCH_WIDE_STYLE,
  CHURCH_WIDE_VENUE,
  DEFAULT_VENUE_STYLE,
  LATEST_START_TIME,
  MAX_BOOKING_TIME,
  MAX_REPEAT_MONTHS,
  MIN_BOOKING_TIME,
  PINNED_TOP_VENUES,
  PURPOSE_PRESETS,
  VENUES,
  VENUE_STYLES,
  WEEKDAYS,
  type VenueStyle,
} from '../constants';
import type { Booking, BookingType, ConflictCandidate, RepeatType } from '../types';

export const getTodayStr = (): string => {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const getCurrentTimeStr = (date = new Date()): string => {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

export const formatDateStr = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

export const parseDateStr = (dateStr: string): Date => {
  if (!dateStr || typeof dateStr !== 'string') return new Date();
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || Number.isNaN(year)) return new Date();
  return new Date(year, (month || 1) - 1, day || 1);
};

export const formatDateWithWeekday = (dateStr: string): string => {
  const date = parseDateStr(dateStr);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}/${day} (${WEEKDAYS[date.getDay()]})`;
};

export const formatDateShort = (dateStr: string): string => {
  const date = parseDateStr(dateStr);
  return `${date.getMonth() + 1}月${date.getDate()}日 (${WEEKDAYS[date.getDay()]})`;
};

export const timeToMinutes = (time: string): number => {
  if (!time || typeof time !== 'string') return 0;
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
};

export const minutesToTime = (totalMinutes: number): string => {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export const formatDurationLabel = (startTime: string, endTime: string): string => {
  const diff = timeToMinutes(endTime) - timeToMinutes(startTime);
  if (diff <= 0) return '';
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  if (hours > 0 && mins > 0) return `${hours}小時${mins}分`;
  if (hours > 0) return `${hours}小時`;
  return `${mins}分鐘`;
};

export const getNextRepeatDate = (dateStr: string, repeatType: RepeatType): string => {
  const d = parseDateStr(dateStr);
  if (repeatType === 'daily') d.setDate(d.getDate() + 1);
  else if (repeatType === 'weekly' || repeatType === 'odd-weeks' || repeatType === 'even-weeks') {
    d.setDate(d.getDate() + 7);
  } else if (repeatType === 'biweekly') {
    d.setDate(d.getDate() + 14);
  }
  return formatDateStr(d);
};

export const addMonthsToDateStr = (dateStr: string, months: number): string => {
  const source = parseDateStr(dateStr);
  const target = new Date(source);
  target.setDate(1);
  target.setMonth(target.getMonth() + months);
  const lastDayOfTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(source.getDate(), lastDayOfTargetMonth));
  return formatDateStr(target);
};

export const getRepeatLimitDate = (dateStr: string): string => addMonthsToDateStr(dateStr, MAX_REPEAT_MONTHS);

export const addDaysToDateStr = (dateStr: string, days: number): string => {
  const d = parseDateStr(dateStr);
  d.setDate(d.getDate() + days);
  return formatDateStr(d);
};

export const getWeekOfMonth = (dateStr: string): number => Math.ceil(parseDateStr(dateStr).getDate() / 7);

export const matchesRepeatPattern = (dateStr: string, repeatType: RepeatType): boolean => {
  const weekOfMonth = getWeekOfMonth(dateStr);
  if (repeatType === 'odd-weeks') return weekOfMonth === 1 || weekOfMonth === 3 || weekOfMonth === 5;
  if (repeatType === 'even-weeks') return weekOfMonth === 2 || weekOfMonth === 4;
  return true;
};

export const clampTime = (time: string, minTime: string, maxTime: string): string => {
  if (time < minTime) return minTime;
  if (time > maxTime) return maxTime;
  return time;
};

export const getEndTimeAfterMinutes = (startTime: string, addMinutes: number): string => {
  const startMin = timeToMinutes(startTime);
  const capped = Math.min(startMin + addMinutes, timeToMinutes(MAX_BOOKING_TIME));
  return minutesToTime(capped);
};

export const getEndTimeOneHourLater = (startTime: string): string => getEndTimeAfterMinutes(startTime, 60);

export const addHoursToTimeStr = (time: string, hoursToAdd: number): string | null => {
  const [hours, minutes] = time.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  const totalMinutes = hours * 60 + minutes + hoursToAdd * 60;
  if (totalMinutes < 0 || totalMinutes >= 24 * 60) return null;
  return minutesToTime(totalMinutes);
};

export const normalizeTimeInput = (
  time: string,
  minTime: string,
  maxTime: string,
  referenceTime?: string
): string => {
  if (time >= minTime && time <= maxTime && (!referenceTime || time > referenceTime)) {
    return time;
  }
  const plusTwelveHours = addHoursToTimeStr(time, 12);
  if (
    plusTwelveHours &&
    plusTwelveHours >= minTime &&
    plusTwelveHours <= maxTime &&
    (!referenceTime || plusTwelveHours > referenceTime)
  ) {
    return plusTwelveHours;
  }
  return time;
};

export const getNextValidTime = (dateStr: string): string => {
  const todayStr = getTodayStr();
  if (dateStr === todayStr) {
    const now = new Date();
    const nextHour = Math.min(23, now.getHours() + 1);
    return clampTime(`${String(nextHour).padStart(2, '0')}:00`, MIN_BOOKING_TIME, LATEST_START_TIME);
  }
  return clampTime('10:00', MIN_BOOKING_TIME, LATEST_START_TIME);
};

export const isTimeOverlap = (startA: string, endA: string, startB: string, endB: string): boolean => {
  return startA < endB && endA > startB;
};

export const isChurchWideBookingType = (bookingType?: BookingType): boolean => {
  return bookingType === 'sunday-service' || bookingType === 'special-service';
};

export const getBookingType = (booking: Pick<Booking, 'bookingType'>): BookingType => {
  return booking.bookingType || 'standard';
};

// Preserve exact church rule: Tuesday 愛家禱告會 does NOT lock all venues
const weekdayCache = new Map<string, number>();
const getDayOfWeekFast = (dateStr: string): number => {
  const cached = weekdayCache.get(dateStr);
  if (cached !== undefined) return cached;
  const day = parseDateStr(dateStr).getDay();
  weekdayCache.set(dateStr, day);
  return day;
};

export const isTuesdayHomePrayerMeeting = (booking: Pick<Booking, 'date' | 'purpose'>): boolean => {
  if (!booking.date || !booking.purpose || !booking.purpose.includes('愛家禱告會')) return false;
  return getDayOfWeekFast(booking.date) === 2;
};

export const isChurchWideBooking = (
  booking: Pick<Booking, 'bookingType' | 'date' | 'purpose'>
): boolean => {
  return isChurchWideBookingType(getBookingType(booking)) && !isTuesdayHomePrayerMeeting(booking);
};

export const getBookingTypeLabel = (bookingType?: BookingType): string => {
  return BOOKING_TYPE_LABELS[bookingType || 'standard'];
};

export const getBookingVenueLabel = (
  booking: Pick<Booking, 'bookingType' | 'venue' | 'date' | 'purpose'>
): string => {
  return isChurchWideBooking(booking) ? CHURCH_WIDE_VENUE : booking.venue;
};

export const getVenueStyle = (venue: string): VenueStyle => {
  return VENUE_STYLES[venue] || DEFAULT_VENUE_STYLE;
};

export const getBookingStyle = (
  booking: Pick<Booking, 'bookingType' | 'venue' | 'date' | 'purpose'>
): VenueStyle => {
  return isChurchWideBooking(booking) ? CHURCH_WIDE_STYLE : getVenueStyle(booking.venue);
};

export const compareBookingsForDisplay = (
  a: Pick<Booking, 'date' | 'startTime' | 'bookingType' | 'purpose'>,
  b: Pick<Booking, 'date' | 'startTime' | 'bookingType' | 'purpose'>
): number => {
  const dateA = a.date || '';
  const dateB = b.date || '';
  if (dateA !== dateB) return dateA.localeCompare(dateB);
  const startA = a.startTime || '';
  const startB = b.startTime || '';
  if (startA !== startB) return startA.localeCompare(startB);
  const aWide = isChurchWideBooking(a);
  const bWide = isChurchWideBooking(b);
  if (aWide !== bWide) return aWide ? -1 : 1;
  return 0;
};

export const getPurposePresetsByType = (bookingType: BookingType): string[] => {
  if (isChurchWideBookingType(bookingType)) {
    return CHURCH_WIDE_PURPOSE_PRESETS;
  }
  return PURPOSE_PRESETS;
};

export const getConflictingBookings = (
  bookingList: Booking[],
  candidate: ConflictCandidate,
  excludeId: string | null,
  ignoredIds: Set<string> = new Set()
): Booking[] => {
  const candidateIsChurchWide = isChurchWideBooking(candidate);

  return bookingList.filter((booking) => {
    if (booking.id === excludeId) return false;
    if (ignoredIds.has(booking.id)) return false;
    if (booking.date !== candidate.date) return false;
    if (!isTimeOverlap(candidate.startTime, candidate.endTime, booking.startTime, booking.endTime)) {
      return false;
    }

    if (candidateIsChurchWide || isChurchWideBooking(booking)) return true;
    return booking.venue === candidate.venue;
  });
};

export const computeRepeatOccurrenceCount = (
  baseDateStr: string,
  repeat: RepeatType,
  repeatUntil: string,
  repeatForever: boolean
): number => {
  if (!baseDateStr) return 1;
  if (repeat === 'none') return 1;
  const endDateStr = repeatForever ? getRepeatLimitDate(baseDateStr) : repeatUntil;
  if (!endDateStr || endDateStr < baseDateStr) return 1;

  let count = 1;
  let curr = getNextRepeatDate(baseDateStr, repeat);
  let safety = 0;
  while (curr <= endDateStr && safety < 100) {
    if (matchesRepeatPattern(curr, repeat)) {
      count++;
    }
    curr = getNextRepeatDate(curr, repeat);
    safety++;
  }
  return count;
};

/**
 * Sort venues dynamically by booking frequency (descending),
 * while strictly pinning 2F主堂 (#1) and 飛鷹堂 (#2) at the top.
 */
export const getVenuesSortedByPopularity = (
  bookingList: Pick<Booking, 'venue' | 'bookingType' | 'date' | 'purpose'>[]
): string[] => {
  const counts = new Map<string, number>();
  for (const b of bookingList) {
    if (!b.venue || isChurchWideBooking(b)) continue;
    counts.set(b.venue, (counts.get(b.venue) || 0) + 1);
  }

  const pinnedSet = new Set<string>(PINNED_TOP_VENUES);
  const pinned: string[] = PINNED_TOP_VENUES.filter((v) =>
    (VENUES as readonly string[]).includes(v)
  );
  const defaultIndex = new Map<string, number>(VENUES.map((v, i) => [v, i]));
  const others = (VENUES as readonly string[])
    .filter((v) => !pinnedSet.has(v))
    .sort((a, b) => {
      const diff = (counts.get(b) || 0) - (counts.get(a) || 0);
      if (diff !== 0) return diff;
      return (defaultIndex.get(a) ?? 0) - (defaultIndex.get(b) ?? 0);
    });

  return [...pinned, ...others];
};
