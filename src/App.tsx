/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import {
  AlertCircle,
  Calendar as CalendarIcon,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  LayoutDashboard,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocsFromServer,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import BookingModal from './components/BookingModal';
import {
  AdminLoginModal,
  ClearAllConfirmModal,
  DeleteConfirmModal,
  SeriesConfirmModal,
} from './components/Dialogs';
import MonthCalendar from './components/MonthCalendar';
import VenueDashboard from './components/VenueDashboard';
import {
  ADMIN_PASSWORD,
  ADMIN_SESSION_KEY,
  CHURCH_WIDE_TYPE_DEFAULT_PURPOSE,
  CHURCH_WIDE_VENUE,
  LATEST_START_TIME,
  MAX_BOOKING_TIME,
  MIN_BOOKING_TIME,
  VENUES,
} from './constants';
import { db, handleFirestoreError, OperationType } from './firebase';
import { useBookingsSync } from './hooks/useBookingsSync';
import type {
  Booking,
  BookingFormData,
  BookingType,
  CalendarContextMenuState,
  RepeatType,
} from './types';
import {
  addDaysToDateStr,
  getBookingType,
  getBookingVenueLabel,
  getConflictingBookings,
  getCurrentTimeStr,
  getEndTimeAfterMinutes,
  getEndTimeOneHourLater,
  getNextRepeatDate,
  getNextValidTime,
  getRepeatLimitDate,
  getTodayStr,
  getVenuesSortedByPopularity,
  isChurchWideBooking,
  isChurchWideBookingType,
  matchesRepeatPattern,
  normalizeTimeInput,
  parseDateStr,
  timeToMinutes,
} from './utils/bookingUtils';

const WRITE_TIMEOUT_MS = 12_000;

function withWriteTimeout<T>(promise: Promise<T>, timeoutMs = WRITE_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = window.setTimeout(() => reject(new Error('WRITE_TIMEOUT')), timeoutMs);
    promise.then(
      (val) => {
        window.clearTimeout(id);
        resolve(val);
      },
      (err) => {
        window.clearTimeout(id);
        reject(err);
      }
    );
  });
}

// --- Error Boundary ---
interface ErrorBoundaryProps {
  children: ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = '發生了預期外的錯誤。';
      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error) errorMessage = `資料庫錯誤：${parsed.error}`;
        }
      } catch {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[#FAF8F4]">
          <div className="bg-white p-8 rounded-3xl shadow-xl border border-[#EAE3D8] max-w-md w-full text-center">
            <div className="w-14 h-14 bg-[#FDF1F1] text-[#C43E3E] rounded-2xl flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={28} />
            </div>
            <h2 className="text-xl font-bold text-[#1E1B18] mb-2">畫面暫時無法載入</h2>
            <p className="text-sm text-[#6E665C] mb-6">{errorMessage}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-[#B85A1F] text-white rounded-xl font-bold hover:bg-[#9E4B18] transition cursor-pointer"
            >
              重新整理頁面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </MotionConfig>
  );
}

const ALL_VENUES_LIST: string[] = [...VENUES];

function AppContent() {
  const { bookings, syncStatus, lastSyncedAt, refreshNow, fetchFreshBookings } = useBookingsSync();

  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    try {
      return window.sessionStorage.getItem(ADMIN_SESSION_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [adminLoginOpen, setAdminLoginOpen] = useState(false);
  const [clearAllOpen, setClearAllOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'calendar'>('calendar');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDateStr, setSelectedDateStr] = useState(getTodayStr);
  const lastKnownTodayRef = useRef(getTodayStr());
  const [selectedVenues, setSelectedVenues] = useState<string[]>(ALL_VENUES_LIST);
  const [searchQuery, setSearchQuery] = useState('');
  const orderedVenues = useMemo(() => getVenuesSortedByPopularity(bookings), [bookings]);

  // Auto-rollover selected date to the new "today" when an installed PWA stays open overnight
  useEffect(() => {
    const checkDateRollover = () => {
      if (document.visibilityState === 'hidden') return;
      const nowToday = getTodayStr();
      if (nowToday !== lastKnownTodayRef.current) {
        const prevToday = lastKnownTodayRef.current;
        lastKnownTodayRef.current = nowToday;
        setSelectedDateStr((prev) => (prev === prevToday ? nowToday : prev));
        setCurrentDate((prev) => {
          const prevDateObj = parseDateStr(prevToday);
          if (
            prev.getFullYear() === prevDateObj.getFullYear() &&
            prev.getMonth() === prevDateObj.getMonth()
          ) {
            return new Date();
          }
          return prev;
        });
      }
    };
    document.addEventListener('visibilitychange', checkDateRollover);
    window.addEventListener('pageshow', checkDateRollover);
    return () => {
      document.removeEventListener('visibilitychange', checkDateRollover);
      window.removeEventListener('pageshow', checkDateRollover);
    };
  }, []);

  // Modal & Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const [seriesConfirmModal, setSeriesConfirmModal] = useState<{
    isOpen: boolean;
    action: 'edit' | 'delete' | null;
    booking: Booking | null;
  }>({ isOpen: false, action: null, booking: null });

  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    isOpen: boolean;
    booking: Booking | null;
    applyToFuture: boolean;
    deleterName: string;
  }>({ isOpen: false, booking: null, applyToFuture: false, deleterName: '' });

  const [calendarContextMenu, setCalendarContextMenu] = useState<CalendarContextMenuState | null>(null);
  const [clipboardBooking, setClipboardBooking] = useState<Booking | null>(null);
  const pasteInFlightRef = useRef(false);
  const submitInFlightRef = useRef(false);
  const deleteInFlightRef = useRef(false);

  // Toast with proper timer cleanup (prevents overlapping dismissal race)
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error';
  }>({ show: false, message: '', type: 'success' });
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ show: true, message, type });
    toastTimerRef.current = window.setTimeout(
      () => {
        setToast((prev) => ({ ...prev, show: false }));
        toastTimerRef.current = null;
      },
      type === 'error' ? 4200 : 2600
    );
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Lock background scrolling when any modal is open
  const anyModalOpen =
    isModalOpen ||
    seriesConfirmModal.isOpen ||
    deleteConfirmModal.isOpen ||
    adminLoginOpen ||
    clearAllOpen;

  useEffect(() => {
    if (anyModalOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.overscrollBehavior = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.overscrollBehavior = '';
    };
  }, [anyModalOpen]);

  // Dismiss desktop context menu
  useEffect(() => {
    if (!calendarContextMenu) return;
    const close = () => setCalendarContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('click', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [calendarContextMenu]);

  // Form state
  const [formData, setFormData] = useState<BookingFormData>(() => {
    const today = getTodayStr();
    return {
      bookingType: 'standard',
      venue: VENUES[0],
      date: today,
      startTime: '10:00',
      endTime: '12:00',
      borrower: '',
      purpose: '',
      repeat: 'none',
      repeatUntil: today,
      repeatForever: false,
    };
  });

  const handlePatchForm = useCallback((patch: Partial<BookingFormData>) => {
    setFormData((prev) => {
      const next = { ...prev, ...patch };
      if (patch.date && next.repeatUntil < next.date) {
        next.repeatUntil = next.date;
      }
      if (next.repeat !== 'none' && !next.repeatForever) {
        const limit = getRepeatLimitDate(next.date);
        if (next.repeatUntil < next.date) next.repeatUntil = next.date;
        if (next.repeatUntil > limit) next.repeatUntil = limit;
      }
      return next;
    });
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const target = e.target;
      const name = target.name;
      const value =
        target.type === 'checkbox' ? (target as HTMLInputElement).checked : target.value;

      setFormData((prev) => {
        const next = { ...prev, [name]: value } as BookingFormData;

        if (name === 'bookingType') {
          const nextType = value as BookingType;
          const prevDefault = CHURCH_WIDE_TYPE_DEFAULT_PURPOSE[prev.bookingType];
          const nextDefault = CHURCH_WIDE_TYPE_DEFAULT_PURPOSE[nextType];
          if (isChurchWideBookingType(nextType)) {
            next.venue = CHURCH_WIDE_VENUE;
          } else if (prev.venue === CHURCH_WIDE_VENUE) {
            next.venue = selectedVenues.length === 1 ? selectedVenues[0] : VENUES[0];
          }
          if (!prev.purpose || prev.purpose === prevDefault) {
            next.purpose = nextDefault;
          }
        }
        if (name === 'startTime' && typeof value === 'string') {
          const normalizedStart = normalizeTimeInput(value, MIN_BOOKING_TIME, LATEST_START_TIME);
          const prevDuration = timeToMinutes(prev.endTime) - timeToMinutes(prev.startTime);
          const keepDuration = prevDuration >= 30 && prevDuration <= 600 ? prevDuration : 60;
          next.startTime = normalizedStart;
          next.endTime = getEndTimeAfterMinutes(normalizedStart, keepDuration);
          if (next.endTime <= normalizedStart) {
            next.endTime = getEndTimeOneHourLater(normalizedStart);
          }
        }
        if (name === 'endTime' && typeof value === 'string') {
          next.endTime = normalizeTimeInput(value, MIN_BOOKING_TIME, MAX_BOOKING_TIME, next.startTime);
        }
        if (name === 'date' && next.repeatUntil < String(value)) {
          next.repeatUntil = String(value);
        }
        if (name === 'repeat' && value === 'none') {
          next.repeatForever = false;
          next.repeatUntil = next.date;
        }
        if (next.repeat !== 'none' && !next.repeatForever) {
          const limit = getRepeatLimitDate(next.date);
          if (next.repeatUntil < next.date) next.repeatUntil = next.date;
          if (next.repeatUntil > limit) next.repeatUntil = limit;
        }
        return next;
      });
    },
    [selectedVenues]
  );

  // Auto-advance start time only when switching the date to today and current startTime is already in the past
  useEffect(() => {
    if (!isModalOpen || editingId) return;
    const todayStr = getTodayStr();
    if (formData.date === todayStr) {
      const nowTime = getCurrentTimeStr();
      if (formData.startTime < nowTime) {
        const nextStart = getNextValidTime(todayStr);
        const nextEnd = getEndTimeOneHourLater(nextStart);
        setFormData((prev) => ({ ...prev, startTime: nextStart, endTime: nextEnd }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.date, editingId, isModalOpen]);

  const openBookingModal = useCallback(
    (venueOrBooking?: string | Booking, isEditing = false, specificDate: string | null = null) => {
      if (specificDate) setSelectedDateStr(specificDate);

      if (isEditing && typeof venueOrBooking === 'object') {
        const sameSeriesBookings = venueOrBooking.groupId
          ? bookings
              .filter((b) => b.groupId === venueOrBooking.groupId)
              .sort((a, b) =>
                a.date !== b.date
                  ? a.date.localeCompare(b.date)
                  : a.startTime.localeCompare(b.startTime)
              )
          : [venueOrBooking];

        let inferredRepeat: RepeatType = venueOrBooking.repeat || 'none';
        if (inferredRepeat === 'none' && sameSeriesBookings.length >= 2) {
          const allOdd = sameSeriesBookings.every((b) => matchesRepeatPattern(b.date, 'odd-weeks'));
          const allEven = sameSeriesBookings.every((b) => matchesRepeatPattern(b.date, 'even-weeks'));
          if (allOdd) inferredRepeat = 'odd-weeks';
          else if (allEven) inferredRepeat = 'even-weeks';
          else {
            const diffDays = Math.round(
              (parseDateStr(sameSeriesBookings[1].date).getTime() -
                parseDateStr(sameSeriesBookings[0].date).getTime()) /
                86_400_000
            );
            if (diffDays === 1) inferredRepeat = 'daily';
            else if (diffDays === 7) inferredRepeat = 'weekly';
            else if (diffDays === 14) inferredRepeat = 'biweekly';
          }
        }

        const seriesLastDate = sameSeriesBookings.reduce(
          (latest, b) => (b.date > latest ? b.date : latest),
          venueOrBooking.date
        );
        const limitDate = getRepeatLimitDate(venueOrBooking.date);
        const baseUntil =
          inferredRepeat === 'none'
            ? venueOrBooking.date
            : venueOrBooking.repeatUntil && venueOrBooking.repeatUntil >= venueOrBooking.date
            ? venueOrBooking.repeatUntil > seriesLastDate
              ? venueOrBooking.repeatUntil
              : seriesLastDate
            : seriesLastDate;
        const clampedUntil =
          inferredRepeat === 'none' ? baseUntil : baseUntil > limitDate ? limitDate : baseUntil;

        setFormData({
          bookingType: getBookingType(venueOrBooking),
          venue: venueOrBooking.venue,
          date: venueOrBooking.date,
          startTime: venueOrBooking.startTime,
          endTime: venueOrBooking.endTime,
          borrower: venueOrBooking.borrower,
          purpose: venueOrBooking.purpose,
          repeat: inferredRepeat,
          repeatUntil: clampedUntil,
          repeatForever: false,
        });
        setEditingId(venueOrBooking.id);
      } else {
        const todayStr = getTodayStr();
        const nowTime = getCurrentTimeStr();
        const requestedDate = specificDate || selectedDateStr || todayStr;
        let safeDate = requestedDate < todayStr ? todayStr : requestedDate;
        // If booking late at night (>= 21:00) for today, automatically advance to tomorrow morning so it's immediately valid!
        if (safeDate === todayStr && nowTime >= LATEST_START_TIME) {
          safeDate = addDaysToDateStr(todayStr, 1);
        }
        const defaultStart = getNextValidTime(safeDate);
        const defaultEnd = getEndTimeOneHourLater(defaultStart);
        const defaultVenue = selectedVenues.length === 1 ? selectedVenues[0] : VENUES[0];

        setFormData({
          bookingType: 'standard',
          venue: typeof venueOrBooking === 'string' ? venueOrBooking : defaultVenue,
          date: safeDate,
          startTime: defaultStart,
          endTime: defaultEnd,
          borrower: '',
          purpose: '',
          repeat: 'none',
          repeatUntil: safeDate,
          repeatForever: false,
        });
        setEditingId(null);
      }
      setIsModalOpen(true);
    },
    [bookings, selectedDateStr, selectedVenues]
  );

  // Admin auth
  const handleAdminButtonClick = () => {
    if (isAdminAuthenticated) {
      setIsAdminAuthenticated(false);
      try {
        window.sessionStorage.removeItem(ADMIN_SESSION_KEY);
      } catch {
        // ignore
      }
      showToast('已登出管理模式');
    } else {
      setAdminLoginOpen(true);
    }
  };

  const verifyAdminPassword = (input: string): boolean => {
    if (input === ADMIN_PASSWORD) {
      setIsAdminAuthenticated(true);
      try {
        window.sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
      } catch {
        // ignore
      }
      showToast('管理模式已啟用');
      return true;
    }
    return false;
  };

  const executeClearAllBookings = async () => {
    try {
      setIsClearing(true);
      const snapshot = await getDocsFromServer(collection(db, 'bookings'));
      const docs = snapshot.docs;
      if (docs.length === 0) {
        showToast('目前沒有任何預約可供清空。', 'error');
        setClearAllOpen(false);
        return;
      }

      const batchSize = 450;
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = writeBatch(db);
        docs.slice(i, i + batchSize).forEach((d) => batch.delete(d.ref));
        await withWriteTimeout(batch.commit(), 15000);
      }

      setClearAllOpen(false);
      showToast(`已清空 ${docs.length} 筆預約`);
    } catch (error) {
      console.error(error);
      showToast('清空失敗，請稍後再試！', 'error');
    } finally {
      setIsClearing(false);
    }
  };

  // Venue Filter
  const toggleVenueFilter = useCallback((venue: string) => {
    setSelectedVenues((prev) => {
      if (prev.length === VENUES.length) return [venue];
      if (prev.length === 1 && prev[0] === venue) return ALL_VENUES_LIST;
      const next = prev.includes(venue) ? prev.filter((v) => v !== venue) : [...prev, venue];
      return next.length === 0 ? ALL_VENUES_LIST : next;
    });
  }, []);

  const selectAllVenues = useCallback(() => {
    setSelectedVenues(ALL_VENUES_LIST);
  }, []);

  // Copy / Paste
  const handleCopy = useCallback(
    (booking: Booking) => {
      setClipboardBooking(booking);
      showToast(`已複製「${getBookingVenueLabel(booking)} ${booking.startTime}–${booking.endTime}」，點選目標日期即可貼上`);
    },
    [showToast]
  );

  const handlePaste = useCallback(
    async (dateStr: string) => {
      if (!clipboardBooking || pasteInFlightRef.current) return;
      const todayStr = getTodayStr();
      if (dateStr < todayStr) {
        showToast('無法預約過去的日期！', 'error');
        return;
      }
      if (dateStr === todayStr && clipboardBooking.startTime < getCurrentTimeStr()) {
        showToast('無法預約過去的時間！', 'error');
        return;
      }

      pasteInFlightRef.current = true;
      try {
        const liveBookings = await fetchFreshBookings();
        const conflicts = getConflictingBookings(
          liveBookings,
          {
            bookingType: getBookingType(clipboardBooking),
            venue: clipboardBooking.venue,
            date: dateStr,
            startTime: clipboardBooking.startTime,
            endTime: clipboardBooking.endTime,
            purpose: clipboardBooking.purpose,
          },
          null
        );

        if (conflicts.length > 0) {
          const churchWideConflict = conflicts.find(isChurchWideBooking);
          showToast(
            churchWideConflict
              ? `貼上失敗：${dateStr} 有全教會封鎖時段！`
              : `貼上失敗：${dateStr} 的時段已有衝突！`,
            'error'
          );
          return;
        }

        const { id: _id, groupId: _groupId, ...data } = clipboardBooking;
        await withWriteTimeout(
          addDoc(collection(db, 'bookings'), {
            ...data,
            borrower: data.borrower.trim(),
            purpose: data.purpose.trim(),
            date: dateStr,
            groupId: null,
            uid: isAdminAuthenticated ? 'admin-password' : 'anonymous',
            authorName: isAdminAuthenticated ? '管理員' : '訪客',
            createdAt: serverTimestamp(),
          })
        );
        showToast(`已貼上預約至 ${dateStr}`);
      } catch (error) {
        const isTimeout = error instanceof Error && error.message === 'WRITE_TIMEOUT';
        showToast(isTimeout ? '網路訊號不穩，貼上逾時，請再試一次！' : '貼上失敗，請確認網路後再試！', 'error');
        try {
          handleFirestoreError(error, OperationType.CREATE, 'bookings');
        } catch {
          // logged
        }
      } finally {
        pasteInFlightRef.current = false;
      }
    },
    [clipboardBooking, fetchFreshBookings, isAdminAuthenticated, showToast]
  );

  // Submit & Repeat Write
  const executeSubmit = async (applyToFuture: boolean) => {
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    try {
      setIsSubmitting(true);
      const batch = writeBatch(db);

      const liveBookings = await fetchFreshBookings();
      const originalBooking = editingId
        ? liveBookings.find((b) => b.id === editingId) || null
        : null;

      // Guard against concurrent deletion by another church member while editing
      if (editingId && !originalBooking) {
        showToast('這筆預約剛已被其他人刪除，畫面已同步更新。', 'error');
        setIsModalOpen(false);
        setEditingId(null);
        setSeriesConfirmModal({ isOpen: false, action: null, booking: null });
        return;
      }

      const deletedFutureIds = new Set<string>();
      if (applyToFuture && originalBooking?.groupId) {
        liveBookings
          .filter(
            (b) =>
              b.groupId === originalBooking.groupId &&
              b.date >= originalBooking.date &&
              b.id !== editingId
          )
          .forEach((b) => deletedFutureIds.add(b.id));
      }

      const cleanFormData: BookingFormData = {
        ...formData,
        borrower: formData.borrower.trim(),
        purpose: formData.purpose.trim(),
      };

      const checkConflict = (
        date: string,
        start: string,
        end: string,
        excludeId: string | null
      ) =>
        getConflictingBookings(
          liveBookings,
          {
            bookingType: cleanFormData.bookingType,
            venue: cleanFormData.venue,
            date,
            startTime: start,
            endTime: end,
            purpose: cleanFormData.purpose,
          },
          excludeId,
          deletedFutureIds
        );

      const mainConflicts = checkConflict(
        cleanFormData.date,
        cleanFormData.startTime,
        cleanFormData.endTime,
        editingId
      );
      if (mainConflicts.length > 0) {
        const churchWideConflict = mainConflicts.find(isChurchWideBooking);
        showToast(
          churchWideConflict
            ? `預約失敗：${cleanFormData.date} 有全教會封鎖時段，全空間暫停借用！`
            : `預約失敗：${cleanFormData.date} 的時段已有衝突！`,
          'error'
        );
        return;
      }

      let currentGroupId = originalBooking?.groupId || null;
      if (applyToFuture && cleanFormData.repeat === 'none') {
        // Detach cleanly when user converts a series into a single non-repeating booking
        currentGroupId = null;
      } else if (!currentGroupId && cleanFormData.repeat !== 'none') {
        currentGroupId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      }

      const newBookingsData: Omit<Booking, 'id'>[] = [];
      if (cleanFormData.repeat !== 'none' && (!editingId || applyToFuture || !originalBooking?.groupId)) {
        let currDateStr = getNextRepeatDate(cleanFormData.date, cleanFormData.repeat);
        const endDateStr = cleanFormData.repeatForever
          ? getRepeatLimitDate(cleanFormData.date)
          : cleanFormData.repeatUntil;

        let safetyCounter = 0;
        while (currDateStr <= endDateStr && safetyCounter < 100) {
          if (!matchesRepeatPattern(currDateStr, cleanFormData.repeat)) {
            currDateStr = getNextRepeatDate(currDateStr, cleanFormData.repeat);
            safetyCounter++;
            continue;
          }

          const conflicts = checkConflict(
            currDateStr,
            cleanFormData.startTime,
            cleanFormData.endTime,
            null
          );
          if (conflicts.length > 0) {
            const churchWideConflict = conflicts.find(isChurchWideBooking);
            showToast(
              churchWideConflict
                ? `預約失敗：重複日程 ${currDateStr} 有全教會封鎖時段！`
                : `預約失敗：重複日程 ${currDateStr} 已有衝突！`,
              'error'
            );
            return;
          }

          newBookingsData.push({
            ...cleanFormData,
            date: currDateStr,
            groupId: currentGroupId,
            uid: isAdminAuthenticated ? 'admin-password' : 'anonymous',
            authorName: isAdminAuthenticated ? '管理員' : '訪客',
            createdAt: serverTimestamp(),
          });
          currDateStr = getNextRepeatDate(currDateStr, cleanFormData.repeat);
          safetyCounter++;
        }
      }

      if (editingId) {
        if (applyToFuture && originalBooking?.groupId) {
          deletedFutureIds.forEach((id) => batch.delete(doc(db, 'bookings', id)));
        }
        batch.update(doc(db, 'bookings', editingId), {
          ...cleanFormData,
          groupId:
            applyToFuture || !originalBooking?.groupId
              ? currentGroupId
              : originalBooking?.groupId || null,
          uid: isAdminAuthenticated ? 'admin-password' : 'anonymous',
          authorName: isAdminAuthenticated ? '管理員' : '訪客',
        });
      } else {
        const newDocRef = doc(collection(db, 'bookings'));
        batch.set(newDocRef, {
          ...cleanFormData,
          groupId: currentGroupId || null,
          uid: isAdminAuthenticated ? 'admin-password' : 'anonymous',
          authorName: isAdminAuthenticated ? '管理員' : '訪客',
          createdAt: serverTimestamp(),
        });
      }

      newBookingsData.forEach((data) => {
        const newDocRef = doc(collection(db, 'bookings'));
        batch.set(newDocRef, data);
      });

      await withWriteTimeout(batch.commit());

      if (newBookingsData.length > 0) {
        showToast(`已儲存並建立共 ${newBookingsData.length + 1} 筆預約！`);
      } else {
        showToast(editingId ? '已更新預約內容' : '新增預約成功！');
      }

      setIsModalOpen(false);
      setEditingId(null);
      setSeriesConfirmModal({ isOpen: false, action: null, booking: null });
    } catch (error) {
      const isTimeout = error instanceof Error && error.message === 'WRITE_TIMEOUT';
      showToast(
        isTimeout ? '網路訊號不穩，儲存逾時，請確認網路後再試！' : '儲存失敗，請確認網路連線後再試！',
        'error'
      );
      try {
        handleFirestoreError(error, editingId ? OperationType.UPDATE : OperationType.CREATE, 'bookings');
      } catch {
        // logged
      }
    } finally {
      submitInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.borrower.trim()) {
      showToast('請填寫借用人 / 單位！', 'error');
      return;
    }
    if (formData.borrower.trim().length >= 100) {
      showToast('借用人名稱請控制在 90 字以內！', 'error');
      return;
    }
    if (!formData.date) {
      showToast('請選擇日期！', 'error');
      return;
    }
    if (!formData.startTime || !formData.endTime) {
      showToast('請選擇開始與結束時間！', 'error');
      return;
    }
    if (!formData.purpose.trim()) {
      showToast('請填寫借用用途！', 'error');
      return;
    }
    if (formData.purpose.trim().length >= 500) {
      showToast('借用用途請控制在 400 字以內！', 'error');
      return;
    }
    if (formData.repeat !== 'none' && !formData.repeatForever && !formData.repeatUntil) {
      showToast('請選擇重複截止日期！', 'error');
      return;
    }

    const originalBooking = editingId ? bookings.find((b) => b.id === editingId) : null;
    const isTimeChanged =
      !originalBooking ||
      originalBooking.date !== formData.date ||
      originalBooking.startTime !== formData.startTime;

    if (isTimeChanged) {
      const todayStr = getTodayStr();
      if (formData.date < todayStr) {
        showToast('無法預約過去的日期！', 'error');
        return;
      }
      if (formData.date === todayStr && formData.startTime < getCurrentTimeStr()) {
        showToast('無法預約過去的時間！', 'error');
        return;
      }
    }

    if (
      formData.startTime < MIN_BOOKING_TIME ||
      formData.startTime > LATEST_START_TIME ||
      formData.endTime < MIN_BOOKING_TIME ||
      formData.endTime > MAX_BOOKING_TIME
    ) {
      showToast('借用時間需介於 05:00 至 22:00，開始時間最晚為 21:00。', 'error');
      return;
    }
    if (formData.startTime >= formData.endTime) {
      showToast('結束時間必須晚於開始時間！', 'error');
      return;
    }
    if (formData.repeat !== 'none' && !formData.repeatForever && formData.repeatUntil < formData.date) {
      showToast('重複截止日期不能早於開始日期！', 'error');
      return;
    }
    if (
      formData.repeat !== 'none' &&
      !formData.repeatForever &&
      formData.repeatUntil > getRepeatLimitDate(formData.date)
    ) {
      showToast(`重複預約最長只能建立三個月內（至 ${getRepeatLimitDate(formData.date)}）。`, 'error');
      return;
    }
    if (
      (formData.repeat === 'odd-weeks' || formData.repeat === 'even-weeks') &&
      !matchesRepeatPattern(formData.date, formData.repeat)
    ) {
      showToast(
        formData.repeat === 'odd-weeks'
          ? '起始日期必須落在當月第 1、3、5 週。'
          : '起始日期必須落在當月第 2、4 週。',
        'error'
      );
      return;
    }

    if (originalBooking?.groupId) {
      setSeriesConfirmModal({ isOpen: true, action: 'edit', booking: originalBooking });
      return;
    }

    await executeSubmit(false);
  };

  // Delete flow
  const openDeleteConfirmModal = (booking: Booking, applyToFuture: boolean) => {
    setSeriesConfirmModal({ isOpen: false, action: null, booking: null });
    setDeleteConfirmModal({
      isOpen: true,
      booking,
      applyToFuture,
      deleterName: '',
    });
  };

  const handleDelete = () => {
    if (!editingId) return;
    const originalBooking = bookings.find((b) => b.id === editingId) || null;
    if (!originalBooking) {
      showToast('找不到要刪除的預約，請重新整理後再試。', 'error');
      return;
    }
    if (originalBooking.groupId) {
      setSeriesConfirmModal({ isOpen: true, action: 'delete', booking: originalBooking });
      return;
    }
    openDeleteConfirmModal(originalBooking, false);
  };

  const executeDelete = async () => {
    if (deleteInFlightRef.current) return;
    const { booking, applyToFuture, deleterName } = deleteConfirmModal;
    const trimmedName = deleterName.trim();
    if (!booking || !trimmedName) {
      showToast('請先輸入刪除者姓名！', 'error');
      return;
    }

    deleteInFlightRef.current = true;
    try {
      setIsSubmitting(true);
      if (applyToFuture && booking.groupId) {
        // Fetch live server list so newly created/synced series records are never missed; chunk safely under 500-op Firestore limit
        const liveBookings = await fetchFreshBookings();
        const futureBookings = liveBookings.filter(
          (b) => b.groupId === booking.groupId && b.date >= booking.date
        );
        const batchSize = 450;
        for (let i = 0; i < futureBookings.length; i += batchSize) {
          const batch = writeBatch(db);
          futureBookings.slice(i, i + batchSize).forEach((b) => batch.delete(doc(db, 'bookings', b.id)));
          await withWriteTimeout(batch.commit());
        }
      } else {
        await withWriteTimeout(deleteDoc(doc(db, 'bookings', booking.id)));
      }
      setIsModalOpen(false);
      setEditingId(null);
      setDeleteConfirmModal({ isOpen: false, booking: null, applyToFuture: false, deleterName: '' });
      setSeriesConfirmModal({ isOpen: false, action: null, booking: null });
      showToast(`已刪除預約（刪除者：${trimmedName}）`);
    } catch (error) {
      const isTimeout = error instanceof Error && error.message === 'WRITE_TIMEOUT';
      showToast(isTimeout ? '網路訊號不穩，刪除逾時，請再試一次！' : '刪除失敗，請稍後再試！', 'error');
      try {
        handleFirestoreError(error, OperationType.DELETE, `bookings/${booking.id}`);
      } catch {
        // logged
      }
    } finally {
      deleteInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Calendar navigation (keep state updaters pure — no nested setState inside updater)
  const prevMonth = useCallback(() => {
    const next = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    const todayStr = getTodayStr();
    const nextPrefix = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    setCurrentDate(next);
    setSelectedDateStr(todayStr.startsWith(nextPrefix) ? todayStr : `${nextPrefix}-01`);
  }, [currentDate]);

  const nextMonth = useCallback(() => {
    const next = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    const todayStr = getTodayStr();
    const nextPrefix = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    setCurrentDate(next);
    setSelectedDateStr(todayStr.startsWith(nextPrefix) ? todayStr : `${nextPrefix}-01`);
  }, [currentDate]);

  const goToToday = useCallback(() => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDateStr(getTodayStr());
  }, []);

  const handleSelectDate = useCallback((dateStr: string) => {
    setSelectedDateStr(dateStr);
    setCalendarContextMenu(null);
    const parsed = parseDateStr(dateStr);
    setCurrentDate((prev) =>
      prev.getFullYear() === parsed.getFullYear() && prev.getMonth() === parsed.getMonth()
        ? prev
        : new Date(parsed.getFullYear(), parsed.getMonth(), 1)
    );
  }, []);

  const handleContextMenuDate = useCallback((event: React.MouseEvent<HTMLDivElement>, dateStr: string) => {
    event.preventDefault();
    setSelectedDateStr(dateStr);
    const menuWidth = 220;
    const menuHeight = 132;
    setCalendarContextMenu({
      dateStr,
      x: Math.max(12, Math.min(event.clientX, window.innerWidth - menuWidth - 12)),
      y: Math.max(12, Math.min(event.clientY, window.innerHeight - menuHeight - 12)),
    });
  }, []);

  // Desktop keyboard calendar navigation
  useEffect(() => {
    if (activeTab !== 'calendar' || anyModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      let nextStr: string | null = null;
      if (event.key === 'ArrowLeft') nextStr = addDaysToDateStr(selectedDateStr, -1);
      else if (event.key === 'ArrowRight') nextStr = addDaysToDateStr(selectedDateStr, 1);
      else if (event.key === 'ArrowUp') nextStr = addDaysToDateStr(selectedDateStr, -7);
      else if (event.key === 'ArrowDown') nextStr = addDaysToDateStr(selectedDateStr, 7);
      else if (event.key === 'Enter') {
        event.preventDefault();
        openBookingModal(undefined, false, selectedDateStr);
        return;
      } else return;

      event.preventDefault();
      const nextDate = parseDateStr(nextStr);
      setCurrentDate(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
      setSelectedDateStr(nextStr);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTab, anyModalOpen, selectedDateStr, openBookingModal]);

  const isInitialLoading = bookings.length === 0 && (syncStatus === 'loading' || syncStatus === 'reconnecting');
  const isBusySync = syncStatus === 'loading' || syncStatus === 'syncing' || syncStatus === 'reconnecting';
  const lastSyncTimeLabel = lastSyncedAt ? getCurrentTimeStr(lastSyncedAt) : null;

  return (
    <div className="min-h-screen bg-[#FAF8F4] text-[#1E1B18] pb-24 sm:pb-16 relative overflow-x-hidden">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast.show && (
          <motion.div
            initial={{ opacity: 0, y: -16, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -16, x: '-50%' }}
            className="fixed top-4 left-1/2 z-[120] w-[calc(100%-2rem)] max-w-md pointer-events-auto"
          >
            <div
              className={`px-4 py-2.5 rounded-2xl shadow-lg flex items-center justify-between gap-2.5 text-xs sm:text-sm font-semibold text-white ${
                toast.type === 'success' ? 'bg-[#2B7A62]' : 'bg-[#C43E3E]'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {toast.type === 'success' ? (
                  <CheckCircle2 size={16} className="shrink-0" />
                ) : (
                  <AlertCircle size={16} className="shrink-0" />
                )}
                <span className="leading-snug">{toast.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setToast((prev) => ({ ...prev, show: false }))}
                className="p-0.5 hover:bg-white/15 rounded-lg shrink-0 cursor-pointer"
                aria-label="關閉提示"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Warm Sanctuary Sticky Header */}
      <header className="sticky top-0 z-20 bg-[#FAF8F4]/92 backdrop-blur-md border-b border-[#E8E1D6] pt-safe">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 h-15 flex items-center justify-between gap-2">
          {/* Brand */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-white border border-[#EAE3D8] shadow-2xs p-1 flex items-center justify-center overflow-hidden">
              <img
                src={`${import.meta.env.BASE_URL}logo.svg`}
                alt="嘉義活水貴格會"
                className="w-full h-full object-contain"
                onError={(e) => {
                  const img = e.currentTarget;
                  img.style.display = 'none';
                }}
              />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-lg font-bold tracking-tight text-[#1E1B18] truncate leading-tight">
                嘉義活水場地借用
              </h1>
              <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-[#7A7167]">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    syncStatus === 'live'
                      ? 'bg-[#2B7A62]'
                      : syncStatus === 'error'
                      ? 'bg-[#C43E3E]'
                      : 'bg-[#D98A2B] animate-pulse'
                  }`}
                />
                <span>
                  {syncStatus === 'live'
                    ? lastSyncTimeLabel
                      ? `已同步 ${lastSyncTimeLabel}`
                      : '即時連線'
                    : syncStatus === 'reconnecting'
                    ? '重新連線中...'
                    : syncStatus === 'error'
                    ? '連線異常'
                    : '同步中...'}
                </span>
              </div>
            </div>
          </div>

          {/* Right Controls: Refresh + Admin + Segmented Tabs */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => void refreshNow(true)}
              disabled={isBusySync}
              className="p-2 rounded-xl text-[#6E665C] hover:text-[#B85A1F] hover:bg-white border border-transparent hover:border-[#E8E1D6] transition cursor-pointer disabled:opacity-50"
              title="重新整理最新預約資料"
              aria-label="重新整理"
            >
              <RefreshCw size={16} className={isBusySync ? 'animate-spin text-[#B85A1F]' : ''} />
            </button>

            <button
              type="button"
              onClick={handleAdminButtonClick}
              className={`p-2 rounded-xl transition border cursor-pointer ${
                isAdminAuthenticated
                  ? 'text-[#C43E3E] bg-[#FDF1F1] border-[#EFC2C2]'
                  : 'text-[#8A8177] hover:text-[#1E1B18] hover:bg-white border-transparent hover:border-[#E8E1D6]'
              }`}
              title={isAdminAuthenticated ? '登出管理模式' : '管理員登入'}
            >
              {isAdminAuthenticated ? <LogOut size={16} /> : <LogIn size={16} />}
            </button>

            {isAdminAuthenticated && (
              <button
                type="button"
                onClick={() => setClearAllOpen(true)}
                disabled={isClearing}
                className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-[#FDF1F1] text-[#C43E3E] hover:bg-[#FBE2E2] border border-[#EFC2C2] transition cursor-pointer"
              >
                <Trash2 size={13} />
                清空
              </button>
            )}

            {/* Primary View Switcher + New Booking CTA (Tablet & Desktop header; Phone uses native bottom bar!) */}
            <div className="hidden sm:flex items-center gap-2">
              <div className="flex items-center gap-0.5 bg-[#EFEAE1] p-1 rounded-xl border border-[#E5DDD1]">
                {(
                  [
                    { id: 'calendar', label: '月曆', icon: CalendarIcon },
                    { id: 'dashboard', label: '今日狀態', icon: LayoutDashboard },
                  ] as const
                ).map(({ id, label, icon: Icon }) => {
                  const active = activeTab === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActiveTab(id)}
                      className={`relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                        active ? 'text-[#B85A1F]' : 'text-[#6E665C] hover:text-[#1E1B18]'
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="header-tab-pill"
                          transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                          className="absolute inset-0 bg-white rounded-lg shadow-xs"
                        />
                      )}
                      <span className="relative z-10 inline-flex items-center gap-1.5">
                        <Icon size={14} className="shrink-0" />
                        <span>{label}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <motion.button
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => openBookingModal(undefined, false, selectedDateStr)}
                className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl bg-[#B85A1F] hover:bg-[#9E4B18] text-white font-semibold text-sm shadow-xs transition-colors cursor-pointer whitespace-nowrap"
              >
                <Plus size={16} />
                <span>新增預約</span>
              </motion.button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4">
        {/* Offline / Reconnect Recovery Banner (replaces blank screen traps!) */}
        {syncStatus === 'error' && (
          <div className="rounded-2xl border border-[#F0CFAF] bg-[#FFF6EB] px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs sm:text-sm text-[#8E4716] min-w-0">
              <WifiOff size={16} className="shrink-0" />
              <span className="truncate">
                {bookings.length > 0
                  ? '暫時無法連線至雲端，目前顯示先前快取資料。'
                  : '目前無法連線至雲端資料庫，請檢查網路後重試。'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void refreshNow(true)}
              className="px-3 py-1.5 rounded-xl bg-[#B85A1F] text-white text-xs font-semibold hover:bg-[#9E4B18] transition shrink-0 cursor-pointer"
            >
              立即重連
            </button>
          </div>
        )}

        {/* Active Clipboard Floating Strip (Clear & Dismissible) */}
        {clipboardBooking && (
          <div className="rounded-2xl bg-[#1E1B18] text-[#FAF8F4] px-4 py-2.5 flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs sm:text-sm min-w-0">
              <Copy size={14} className="text-[#E8B16A] shrink-0" />
              <span className="truncate">
                已複製：<strong>{getBookingVenueLabel(clipboardBooking)}</strong>{' '}
                <span className="tabular-nums">
                  {clipboardBooking.startTime}–{clipboardBooking.endTime}
                </span>{' '}
                ({clipboardBooking.purpose})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setClipboardBooking(null)}
              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium shrink-0 cursor-pointer"
            >
              取消複製
            </button>
          </div>
        )}

        <AnimatePresence mode="wait" initial={false}>
          {activeTab === 'dashboard' ? (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <VenueDashboard
                bookings={bookings}
                orderedVenues={orderedVenues}
                isInitialLoading={isInitialLoading}
                onQuickBook={(venue) => openBookingModal(venue, false, getTodayStr())}
                onEditBooking={(b) => openBookingModal(b, true)}
                onCopyBooking={handleCopy}
              />
            </motion.div>
          ) : (
            <motion.div
              key="calendar"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <MonthCalendar
                bookings={bookings}
                orderedVenues={orderedVenues}
                isInitialLoading={isInitialLoading}
                currentDate={currentDate}
                selectedDateStr={selectedDateStr}
                selectedVenues={selectedVenues}
                searchQuery={searchQuery}
                clipboardBooking={clipboardBooking}
                onSearchChange={setSearchQuery}
                onToggleVenue={toggleVenueFilter}
                onSelectAllVenues={selectAllVenues}
                onPrevMonth={prevMonth}
                onNextMonth={nextMonth}
                onGoToToday={goToToday}
                onSelectDate={handleSelectDate}
                onContextMenuDate={handleContextMenuDate}
                onNewBooking={(dateStr) => openBookingModal(undefined, false, dateStr)}
                onEditBooking={(b) => openBookingModal(b, true)}
                onCopyBooking={handleCopy}
                onPasteToDate={(dateStr) => void handlePaste(dateStr)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Desktop Right-Click Context Menu */}
      <AnimatePresence>
        {calendarContextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="fixed z-[60] w-56 rounded-2xl border border-[#E6DFD3] bg-white p-2 shadow-2xl"
            style={{ left: calendarContextMenu.x, top: calendarContextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-2.5 py-1.5 text-[11px] font-bold tracking-wider text-[#8A8177] tabular-nums">
              {calendarContextMenu.dateStr}
            </div>
            <button
              type="button"
              onClick={() => {
                if (!clipboardBooking) return;
                setCalendarContextMenu(null);
                void handlePaste(calendarContextMenu.dateStr);
              }}
              disabled={!clipboardBooking}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${
                clipboardBooking
                  ? 'text-[#1E1B18] hover:bg-[#FFF3E3] hover:text-[#8E4716] cursor-pointer'
                  : 'text-[#C2B7A9] cursor-not-allowed'
              }`}
            >
              <ClipboardPaste size={15} />
              {clipboardBooking ? '貼上到這一天' : '請先複製一筆預約'}
            </button>
            <button
              type="button"
              onClick={() => {
                setCalendarContextMenu(null);
                openBookingModal(undefined, false, calendarContextMenu.dateStr);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[#1E1B18] hover:bg-[#F5F1EA] transition cursor-pointer"
            >
              <Plus size={15} />
              新增這一天的預約
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Native-App Style Mobile Bottom Navigation Bar (Thumb-zone ergonomics + Safe Area!) */}
      <nav
        aria-label="主要導覽"
        className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-[#FAF8F4]/95 backdrop-blur-md border-t border-[#E6DFD3] px-4 pt-2 pb-safe shadow-[0_-4px_18px_rgba(30,27,24,0.06)]"
      >
        <div className="grid grid-cols-3 items-center gap-2 max-w-md mx-auto">
          <button
            type="button"
            onClick={() => setActiveTab('calendar')}
            className={`relative flex flex-col items-center justify-center py-1.5 rounded-xl transition active:scale-95 cursor-pointer ${
              activeTab === 'calendar' ? 'text-[#B85A1F] font-bold' : 'text-[#7A7167] font-medium'
            }`}
          >
            {activeTab === 'calendar' && (
              <motion.span
                layoutId="mobile-nav-pill"
                transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                className="absolute inset-x-3 inset-y-0.5 rounded-xl bg-[#FFF3E3]"
              />
            )}
            <CalendarIcon size={20} strokeWidth={activeTab === 'calendar' ? 2.4 : 2} className="relative z-10" />
            <span className="text-[11px] mt-0.5 relative z-10">月曆</span>
          </button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={() => openBookingModal(undefined, false, selectedDateStr)}
            className="flex items-center justify-center gap-1.5 h-11 rounded-2xl bg-[#B85A1F] hover:bg-[#9E4B18] text-white font-bold text-sm shadow-[0_4px_14px_rgba(184,90,31,0.32)] transition-colors cursor-pointer"
          >
            <Plus size={18} />
            <span>新增</span>
          </motion.button>

          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`relative flex flex-col items-center justify-center py-1.5 rounded-xl transition active:scale-95 cursor-pointer ${
              activeTab === 'dashboard' ? 'text-[#B85A1F] font-bold' : 'text-[#7A7167] font-medium'
            }`}
          >
            {activeTab === 'dashboard' && (
              <motion.span
                layoutId="mobile-nav-pill"
                transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                className="absolute inset-x-3 inset-y-0.5 rounded-xl bg-[#FFF3E3]"
              />
            )}
            <LayoutDashboard size={20} strokeWidth={activeTab === 'dashboard' ? 2.4 : 2} className="relative z-10" />
            <span className="text-[11px] mt-0.5 relative z-10">今日狀態</span>
          </button>
        </div>
      </nav>

      {/* Modals */}
      <BookingModal
        isOpen={isModalOpen}
        editingId={editingId}
        formData={formData}
        bookings={bookings}
        orderedVenues={orderedVenues}
        isSubmitting={isSubmitting}
        disableEscape={seriesConfirmModal.isOpen || deleteConfirmModal.isOpen}
        onClose={() => setIsModalOpen(false)}
        onInputChange={handleInputChange}
        onPatchForm={handlePatchForm}
        onSubmit={handleSubmit}
        onDelete={handleDelete}
      />

      <SeriesConfirmModal
        isOpen={seriesConfirmModal.isOpen}
        action={seriesConfirmModal.action}
        booking={seriesConfirmModal.booking}
        isSubmitting={isSubmitting}
        onClose={() => setSeriesConfirmModal({ isOpen: false, action: null, booking: null })}
        onSelectSingle={() => {
          if (seriesConfirmModal.action === 'edit') {
            void executeSubmit(false);
          } else if (seriesConfirmModal.booking) {
            openDeleteConfirmModal(seriesConfirmModal.booking, false);
          }
        }}
        onSelectFuture={() => {
          if (seriesConfirmModal.action === 'edit') {
            void executeSubmit(true);
          } else if (seriesConfirmModal.booking) {
            openDeleteConfirmModal(seriesConfirmModal.booking, true);
          }
        }}
      />

      <DeleteConfirmModal
        isOpen={deleteConfirmModal.isOpen}
        applyToFuture={deleteConfirmModal.applyToFuture}
        deleterName={deleteConfirmModal.deleterName}
        isSubmitting={isSubmitting}
        onChangeName={(name) => setDeleteConfirmModal((prev) => ({ ...prev, deleterName: name }))}
        onClose={() =>
          setDeleteConfirmModal({ isOpen: false, booking: null, applyToFuture: false, deleterName: '' })
        }
        onConfirm={() => void executeDelete()}
      />

      <AdminLoginModal
        isOpen={adminLoginOpen}
        onClose={() => setAdminLoginOpen(false)}
        onVerify={verifyAdminPassword}
      />

      <ClearAllConfirmModal
        isOpen={clearAllOpen}
        isClearing={isClearing}
        bookingCount={bookings.length}
        onClose={() => setClearAllOpen(false)}
        onConfirm={() => void executeClearAllBookings()}
      />
    </div>
  );
}
