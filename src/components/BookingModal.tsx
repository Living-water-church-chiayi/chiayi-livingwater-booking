import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Calendar as CalendarIcon,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  Repeat,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CHURCH_WIDE_VENUE,
  LATEST_START_TIME,
  MAX_BOOKING_TIME,
  MIN_BOOKING_TIME,
  RECENT_BORROWERS_KEY,
  VENUES,
} from '../constants';
import type { Booking, BookingFormData, RepeatType } from '../types';
import {
  addDaysToDateStr,
  compareBookingsForDisplay,
  computeRepeatOccurrenceCount,
  formatDateWithWeekday,
  formatDurationLabel,
  getBookingVenueLabel,
  getConflictingBookings,
  getCurrentTimeStr,
  getEndTimeAfterMinutes,
  getPurposePresetsByType,
  getRepeatLimitDate,
  getTodayStr,
  getVenueStyle,
  isChurchWideBooking,
  isChurchWideBookingType,
  isTimeOverlap,
  minutesToTime,
  parseDateStr,
  timeToMinutes,
} from '../utils/bookingUtils';

interface BookingModalProps {
  isOpen: boolean;
  editingId: string | null;
  formData: BookingFormData;
  bookings: Booking[];
  orderedVenues?: string[];
  isSubmitting: boolean;
  disableEscape?: boolean;
  onClose: () => void;
  onInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onPatchForm: (patch: Partial<BookingFormData>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onDelete: () => void;
}

const TIME_SLOT_PRESETS = [
  { label: '早上 09:00', start: '09:00', end: '12:00' },
  { label: '下午 14:00', start: '14:00', end: '17:00' },
  { label: '晚上 19:00', start: '19:00', end: '21:30' },
];

const DURATION_CHIPS = [
  { label: '1小時', mins: 60 },
  { label: '1.5小時', mins: 90 },
  { label: '2小時', mins: 120 },
  { label: '3小時', mins: 180 },
];

const REPEAT_OPTIONS: Array<{ value: RepeatType; label: string }> = [
  { value: 'none', label: '不重複' },
  { value: 'weekly', label: '每週' },
  { value: 'biweekly', label: '每兩週' },
  { value: 'odd-weeks', label: '單數週' },
  { value: 'even-weeks', label: '雙數週' },
  { value: 'daily', label: '每天' },
];

// 5-minute increments (supports real church schedules like 08:20, 11:50, 15:50, 18:45, 21:15!)
const BASE_START_OPTIONS: string[] = [];
for (let m = timeToMinutes(MIN_BOOKING_TIME); m <= timeToMinutes(LATEST_START_TIME); m += 5) {
  BASE_START_OPTIONS.push(minutesToTime(m));
}

const BASE_END_OPTIONS: string[] = [];
for (let m = timeToMinutes(MIN_BOOKING_TIME) + 5; m <= timeToMinutes(MAX_BOOKING_TIME); m += 5) {
  BASE_END_OPTIONS.push(minutesToTime(m));
}

const TIMELINE_START_MIN = timeToMinutes(MIN_BOOKING_TIME);
const TIMELINE_END_MIN = timeToMinutes(MAX_BOOKING_TIME);
const TIMELINE_SPAN = TIMELINE_END_MIN - TIMELINE_START_MIN;

function readRecentBorrowers(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_BORROWERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function saveRecentBorrower(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  try {
    const prev = readRecentBorrowers().filter((x) => x !== trimmed);
    window.localStorage.setItem(RECENT_BORROWERS_KEY, JSON.stringify([trimmed, ...prev].slice(0, 6)));
  } catch {
    // ignore
  }
}

function getNextSundayStr(fromDateStr: string): string {
  const d = parseDateStr(fromDateStr);
  const diff = (7 - d.getDay()) % 7;
  return addDaysToDateStr(fromDateStr, diff === 0 ? 7 : diff);
}

interface AutocompleteOption {
  value: string;
  tag?: string;
}

interface SmartAutocompleteInputProps {
  inputRef?: React.RefObject<HTMLInputElement | null>;
  name: string;
  value: string;
  placeholder: string;
  maxLength?: number;
  enterKeyHint?: 'next' | 'done';
  dropdownDirection?: 'down' | 'up';
  hasError?: boolean;
  options: AutocompleteOption[];
  onChange: (value: string) => void;
  onEnterNext?: () => void;
}

function renderHighlightedText(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-[#B85A1F] font-bold bg-[#FFF3E3] rounded-xs px-0.5">
        {text.slice(idx, idx + q.length)}
      </span>
      {text.slice(idx + q.length)}
    </>
  );
}

function SmartAutocompleteInput({
  inputRef,
  name,
  value,
  placeholder,
  maxLength,
  enterKeyHint = 'done',
  dropdownDirection = 'down',
  hasError = false,
  options,
  onChange,
  onEnterNext,
}: SmartAutocompleteInputProps) {
  const localRef = useRef<HTMLInputElement | null>(null);
  const resolvedRef = inputRef ?? localRef;
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options.slice(0, 8);
    const prefix: AutocompleteOption[] = [];
    const contains: AutocompleteOption[] = [];
    for (const opt of options) {
      const lower = opt.value.toLowerCase();
      if (lower === q) continue;
      if (lower.startsWith(q)) prefix.push(opt);
      else if (lower.includes(q)) contains.push(opt);
    }
    return [...prefix, ...contains].slice(0, 8);
  }, [value, options]);

  const showMenu = open && matches.length > 0;

  return (
    <div className="relative">
      <input
        ref={resolvedRef}
        type="text"
        name={name}
        required
        maxLength={maxLength}
        autoComplete="off"
        enterKeyHint={enterKeyHint}
        value={value}
        onFocus={(e) => {
          setOpen(true);
          setActiveIdx(-1);
          const el = e.currentTarget;
          // Scroll focused field into the sweet spot above iOS/Android virtual keyboard
          window.setTimeout(() => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 180);
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 140);
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIdx(-1);
        }}
        onKeyDown={(e) => {
          if (showMenu) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIdx((i) => (i + 1) % matches.length);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIdx((i) => (i <= 0 ? matches.length - 1 : i - 1));
              return;
            }
            if (e.key === 'Enter' && activeIdx >= 0 && matches[activeIdx]) {
              e.preventDefault();
              onChange(matches[activeIdx].value);
              setOpen(false);
              return;
            }
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
              return;
            }
          }
          if (e.key === 'Enter' && onEnterNext) {
            e.preventDefault();
            setOpen(false);
            onEnterNext();
          }
        }}
        placeholder={placeholder}
        className={`w-full h-11 px-3.5 pr-10 rounded-xl border transition outline-none text-[16px] sm:text-sm ${
          hasError
            ? 'bg-[#FFF8F8] border-[#C43E3E] ring-2 ring-[#C43E3E]/15'
            : 'bg-[#FAF8F4] border-[#E3DBD0] focus:bg-white focus:ring-2 focus:ring-[#B85A1F]/15 focus:border-[#B85A1F]'
        }`}
      />

      {value && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onChange('');
            setOpen(true);
            resolvedRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full text-[#9A9085] hover:text-[#1E1B18] hover:bg-[#EFEAE1] flex items-center justify-center transition cursor-pointer"
          aria-label="清除輸入"
        >
          <X size={14} />
        </button>
      )}

      <AnimatePresence>
        {showMenu && (
          <motion.div
            initial={{ opacity: 0, y: dropdownDirection === 'up' ? 4 : -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: dropdownDirection === 'up' ? 4 : -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className={`absolute left-0 right-0 z-40 bg-white rounded-2xl border border-[#E6DFD3] shadow-[0_10px_30px_rgba(30,27,24,0.16)] overflow-hidden py-1 max-h-52 overflow-y-auto custom-scrollbar ${
              dropdownDirection === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
            }`}
          >
            {matches.map((opt, idx) => (
              <button
                key={opt.value}
                type="button"
                onMouseDown={(e) => {
                  // Prevent input blur before click finishes, while still allowing touch scroll without accidental tap!
                  e.preventDefault();
                }}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full px-3.5 py-2.5 min-h-[42px] text-left text-sm flex items-center justify-between gap-2 transition cursor-pointer ${
                  idx === activeIdx
                    ? 'bg-[#FFF3E3] text-[#8E4716]'
                    : 'text-[#2E2924] hover:bg-[#FAF6F0] active:bg-[#FFF3E3]'
                }`}
              >
                <span className="truncate">{renderHighlightedText(opt.value, value)}</span>
                {opt.tag && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-[#F3EFE8] text-[#7A7167] shrink-0">
                    {opt.tag}
                  </span>
                )}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function BookingModal({
  isOpen,
  editingId,
  formData,
  bookings,
  orderedVenues,
  isSubmitting,
  disableEscape = false,
  onClose,
  onInputChange,
  onPatchForm,
  onSubmit,
  onDelete,
}: BookingModalProps) {
  const [showAllPurposes, setShowAllPurposes] = useState(false);
  const [showAllBorrowers, setShowAllBorrowers] = useState(false);
  const [recentBorrowers, setRecentBorrowers] = useState<string[]>([]);
  const [missingField, setMissingField] = useState<'borrower' | 'purpose' | null>(null);
  const [viewportMaxHeight, setViewportMaxHeight] = useState<number | null>(null);

  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const repeatUntilInputRef = useRef<HTMLInputElement | null>(null);
  const borrowerInputRef = useRef<HTMLInputElement | null>(null);
  const purposeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setRecentBorrowers(readRecentBorrowers());
    setShowAllPurposes(false);
    setShowAllBorrowers(false);
    setMissingField(null);
  }, [isOpen]);

  // Dynamically adapt modal max-height to iOS/Android visualViewport when software keyboard opens!
  useEffect(() => {
    if (!isOpen) {
      setViewportMaxHeight(null);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;
    const updateHeight = () => {
      // Only constrain when viewport shrinks noticeably (mobile keyboard open)
      setViewportMaxHeight(Math.round(vv.height * 0.94));
    };
    updateHeight();
    vv.addEventListener('resize', updateHeight);
    return () => vv.removeEventListener('resize', updateHeight);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || disableEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, disableEscape, isSubmitting, onClose]);

  const todayStr = getTodayStr();
  const tomorrowStr = addDaysToDateStr(todayStr, 1);
  const nextSundayStr = getNextSundayStr(todayStr);
  const sundayChipLabel = parseDateStr(todayStr).getDay() === 0 ? '下週日' : '本週日';

  const repeatLimitDate = useMemo(() => getRepeatLimitDate(formData.date), [formData.date]);
  const isFormChurchWideType = isChurchWideBookingType(formData.bookingType);
  const isFormChurchWideLocking = isChurchWideBooking(formData);

  const startOptions = useMemo(() => {
    if (!formData.startTime || BASE_START_OPTIONS.includes(formData.startTime)) {
      return BASE_START_OPTIONS;
    }
    return [...BASE_START_OPTIONS, formData.startTime].sort();
  }, [formData.startTime]);

  const endOptions = useMemo(() => {
    const filtered = BASE_END_OPTIONS.filter((t) => t > formData.startTime);
    if (formData.endTime && !filtered.includes(formData.endTime)) {
      return [...filtered, formData.endTime].sort();
    }
    return filtered.length > 0 ? filtered : [MAX_BOOKING_TIME];
  }, [formData.startTime, formData.endTime]);

  const busyVenuesAtSelectedSlot = useMemo(() => {
    const busy = new Set<string>();
    if (!isOpen || !formData.date || !formData.startTime || !formData.endTime) return busy;
    for (const b of bookings) {
      if (b.id === editingId) continue;
      if (b.date !== formData.date) continue;
      if (!isTimeOverlap(formData.startTime, formData.endTime, b.startTime, b.endTime)) continue;
      if (isChurchWideBooking(b)) {
        VENUES.forEach((v) => busy.add(v));
      } else {
        busy.add(b.venue);
      }
    }
    return busy;
  }, [isOpen, bookings, editingId, formData.date, formData.startTime, formData.endTime]);

  const mergedPurposes = useMemo(() => {
    const base = getPurposePresetsByType(formData.bookingType);
    const seen = new Set(base);
    if (!isOpen) return base;

    const counts = new Map<string, number>();
    for (const b of bookings) {
      const sameCategory = isChurchWideBookingType(b.bookingType) === isFormChurchWideType;
      if (!sameCategory) continue;
      const p = b.purpose?.trim();
      if (!p || p.length > 14 || seen.has(p)) continue;
      counts.set(p, (counts.get(p) || 0) + 1);
    }

    const dynamicExtras = [...counts.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => name);

    return [...base, ...dynamicExtras];
  }, [isOpen, bookings, formData.bookingType, isFormChurchWideType]);

  const { mergedBorrowers, allBorrowerOptions } = useMemo(() => {
    if (!isOpen) {
      return {
        mergedBorrowers: recentBorrowers,
        allBorrowerOptions: recentBorrowers.map((value) => ({ value, tag: '最近' })),
      };
    }

    const counts = new Map<string, number>();
    const allCounts = new Map<string, number>();
    for (const b of bookings) {
      const name = b.borrower?.trim();
      if (!name) continue;
      allCounts.set(name, (allCounts.get(name) || 0) + 1);
      const sameCategory = isChurchWideBookingType(b.bookingType) === isFormChurchWideType;
      if (sameCategory && name.length <= 18) {
        counts.set(name, (counts.get(name) || 0) + 1);
      }
    }

    const sortedPopular = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)
      .map(([name]) => name);

    const seen = new Set<string>();
    const combined: string[] = [];
    for (const name of [...recentBorrowers, ...sortedPopular]) {
      if (!seen.has(name)) {
        seen.add(name);
        combined.push(name);
      }
    }

    const recentSet = new Set(recentBorrowers);
    const optSeen = new Set<string>();
    const options: AutocompleteOption[] = [];
    for (const name of recentBorrowers) {
      optSeen.add(name);
      options.push({ value: name, tag: '最近' });
    }
    [...allCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([name, cnt]) => {
        if (optSeen.has(name)) return;
        optSeen.add(name);
        options.push({
          value: name,
          tag: recentSet.has(name) ? '最近' : cnt >= 10 ? '常用' : undefined,
        });
      });

    return { mergedBorrowers: combined, allBorrowerOptions: options };
  }, [isOpen, bookings, recentBorrowers, isFormChurchWideType]);

  const allPurposeOptions = useMemo<AutocompleteOption[]>(() => {
    const base = getPurposePresetsByType(formData.bookingType);
    const baseSet = new Set(base);
    const seen = new Set<string>();
    const options: AutocompleteOption[] = [];

    for (const p of mergedPurposes) {
      if (seen.has(p)) continue;
      seen.add(p);
      options.push({ value: p, tag: baseSet.has(p) ? '常用' : undefined });
    }

    if (isOpen) {
      const counts = new Map<string, number>();
      for (const b of bookings) {
        const p = b.purpose?.trim();
        if (!p || seen.has(p)) continue;
        counts.set(p, (counts.get(p) || 0) + 1);
      }
      [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .forEach(([p, cnt]) => {
          if (seen.has(p)) return;
          seen.add(p);
          options.push({ value: p, tag: cnt >= 5 ? '常用' : undefined });
        });
    }
    return options;
  }, [isOpen, bookings, formData.bookingType, mergedPurposes]);

  const filteredBorrowers = useMemo(() => {
    const q = formData.borrower.trim().toLowerCase();
    if (!q || mergedBorrowers.includes(formData.borrower.trim())) {
      return mergedBorrowers;
    }
    const matches = mergedBorrowers.filter((name) => name.toLowerCase().includes(q));
    return matches.length > 0 ? matches : mergedBorrowers;
  }, [mergedBorrowers, formData.borrower]);

  const visibleBorrowers = showAllBorrowers ? filteredBorrowers : filteredBorrowers.slice(0, 8);
  const hasMoreBorrowers = filteredBorrowers.length > 8;

  const conflicts = useMemo(() => {
    if (!isOpen) return [];
    return getConflictingBookings(
      bookings,
      {
        bookingType: formData.bookingType,
        venue: formData.venue,
        date: formData.date,
        startTime: formData.startTime,
        endTime: formData.endTime,
        purpose: formData.purpose,
      },
      editingId
    );
  }, [isOpen, bookings, formData, editingId]);

  const existingDaySlots = useMemo(() => {
    if (!isOpen || !formData.date) return [];
    return bookings
      .filter((b) => {
        if (b.id === editingId) return false;
        if (b.date !== formData.date) return false;
        if (isFormChurchWideLocking) return true;
        return isChurchWideBooking(b) || b.venue === formData.venue;
      })
      .sort(compareBookingsForDisplay);
  }, [isOpen, bookings, editingId, formData.date, formData.venue, isFormChurchWideLocking]);

  const repeatCount = useMemo(
    () =>
      computeRepeatOccurrenceCount(
        formData.date,
        formData.repeat,
        formData.repeatUntil,
        formData.repeatForever
      ),
    [formData.date, formData.repeat, formData.repeatUntil, formData.repeatForever]
  );

  const isConflict = conflicts.length > 0;
  const hasChurchWideConflict = conflicts.some(isChurchWideBooking);
  const durationLabel = formatDurationLabel(formData.startTime, formData.endTime);

  const visiblePurposes = showAllPurposes ? mergedPurposes : mergedPurposes.slice(0, 8);
  const hasMorePurposes = mergedPurposes.length > 8;

  const toTimelinePct = (timeStr: string) => {
    const mins = timeToMinutes(timeStr);
    return Math.max(0, Math.min(100, ((mins - TIMELINE_START_MIN) / TIMELINE_SPAN) * 100));
  };
  const selLeft = toTimelinePct(formData.startTime);
  const selWidth = Math.max(2, toTimelinePct(formData.endTime) - selLeft);

  const openNativeDatePicker = (ref: React.RefObject<HTMLInputElement | null>) => {
    const el = ref.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === 'function') {
        el.showPicker();
        return;
      }
    } catch {
      // Safari / iOS opens automatically via native tap on the transparent overlay input
    }
    el.focus();
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    if (!formData.borrower.trim()) {
      setMissingField('borrower');
      borrowerInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      borrowerInputRef.current?.focus();
    } else if (!formData.purpose.trim()) {
      setMissingField('purpose');
      purposeInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      purposeInputRef.current?.focus();
    } else {
      setMissingField(null);
      saveRecentBorrower(formData.borrower);
    }
    onSubmit(e);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={() => {
            if (!isSubmitting) onClose();
          }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-[#1E1B18]/45 backdrop-blur-xs"
        >
          <motion.div
            initial={{ opacity: 0, y: 36, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 28, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            style={viewportMaxHeight ? { maxHeight: `${viewportMaxHeight}px` } : undefined}
            className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[92dvh] border border-[#EAE3D8]"
          >
            {/* Mobile Bottom-Sheet Drag Handle */}
            <div className="sm:hidden flex justify-center pt-2.5 pb-0.5 bg-white shrink-0">
              <span className="w-10 h-1 rounded-full bg-[#DDD4C7]" />
            </div>

            {/* Header + Always-Visible Live Summary Strip */}
            <div className="px-4 py-3 sm:px-6 sm:py-3.5 border-b border-[#EFEAE1] bg-white shrink-0 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-[#FFF3E3] text-[#B85A1F] flex items-center justify-center shrink-0">
                    <CalendarIcon size={16} />
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-[#1E1B18] truncate">
                    {editingId ? '編輯場地預約' : '新增場地預約'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="w-9 h-9 flex items-center justify-center text-[#8A8177] hover:text-[#1E1B18] hover:bg-[#F5F1EA] rounded-full transition cursor-pointer shrink-0"
                  aria-label="關閉"
                >
                  <X size={18} />
                </button>
              </div>

              <div
                className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                  isConflict
                    ? 'bg-[#FDF1F1] border-[#EFC2C2] text-[#9A2B2B]'
                    : 'bg-[#FAF8F4] border-[#ECE5DA] text-[#4A433C]'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate tabular-nums">
                  <span className="font-bold text-[#1E1B18]">
                    {isFormChurchWideType ? CHURCH_WIDE_VENUE : formData.venue}
                  </span>
                  <span className="opacity-40">·</span>
                  <span>{formData.date ? formatDateWithWeekday(formData.date) : '選擇日期'}</span>
                  <span className="opacity-40">·</span>
                  <span className="font-bold">
                    {formData.startTime}–{formData.endTime}
                  </span>
                  {durationLabel && <span className="opacity-70">({durationLabel})</span>}
                </div>
                {isConflict ? (
                  <span className="shrink-0 text-[11px] font-bold text-[#C43E3E]">有衝突</span>
                ) : (
                  <span className="shrink-0 text-[11px] font-bold text-[#2B7A62]">可借用</span>
                )}
              </div>
            </div>

            {/* Scrollable Body (Extra bottom breathing room for iOS/Android software keyboard!) */}
            <div className="px-4 py-4 sm:p-6 overflow-y-auto custom-scrollbar space-y-5 flex-1">
              <form id="booking-form" noValidate onSubmit={handleFormSubmit} className="space-y-5 pb-6 sm:pb-2 w-full">
                {/* Unified Conflict Alert */}
                <AnimatePresence initial={false}>
                  {!isSubmitting && isConflict && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <div className="p-3.5 bg-[#FDF1F1] border border-[#EFC2C2] rounded-2xl flex items-start gap-2.5">
                        <AlertCircle className="text-[#C43E3E] shrink-0 mt-0.5" size={17} />
                        <div className="text-xs sm:text-sm text-[#8F2424] min-w-0">
                          <p className="font-bold">此時段已有衝突</p>
                          <p className="mt-0.5 opacity-90">
                            {hasChurchWideConflict
                              ? '此時段為全教會聚會時段，全空間暫停借用。'
                              : '此時段該場地已有其他預約，可直接點選下方其他空閒場地或調整時間。'}
                          </p>
                          <div className="mt-1.5 space-y-0.5 text-xs">
                            {conflicts.slice(0, 3).map((c) => (
                              <p key={c.id} className="truncate">
                                • {getBookingVenueLabel(c)} · {c.startTime}–{c.endTime} · {c.borrower}
                              </p>
                            ))}
                            {conflicts.length > 3 && <p>• 另外還有 {conflicts.length - 3} 筆衝突</p>}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* SECTION 1: Type & Visual 1-Tap Venue Picker */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#7A7167] inline-flex items-center gap-1.5">
                      <MapPin size={13} className="text-[#B85A1F]" />
                      場地與類型
                    </label>
                    <div className="inline-flex p-0.5 rounded-lg bg-[#F3EFE8] border border-[#E6DFD3]">
                      <button
                        type="button"
                        onClick={() =>
                          onPatchForm({
                            bookingType: 'standard',
                            venue: formData.venue === CHURCH_WIDE_VENUE ? VENUES[0] : formData.venue,
                            purpose:
                              formData.purpose === '主日崇拜' || formData.purpose === '特別聚會'
                                ? ''
                                : formData.purpose,
                          })
                        }
                        className={`px-2.5 py-1.5 sm:py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                          formData.bookingType === 'standard'
                            ? 'bg-white text-[#1E1B18] shadow-2xs'
                            : 'text-[#7A7167] hover:text-[#1E1B18]'
                        }`}
                      >
                        一般借用
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onPatchForm({
                            bookingType: 'sunday-service',
                            venue: CHURCH_WIDE_VENUE,
                            purpose: formData.purpose || '主日崇拜',
                          })
                        }
                        className={`px-2.5 py-1.5 sm:py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                          isFormChurchWideType
                            ? 'bg-[#C43E3E] text-white shadow-2xs'
                            : 'text-[#7A7167] hover:text-[#9A2B2B]'
                        }`}
                      >
                        全教會時段
                      </button>
                    </div>
                  </div>

                  {isFormChurchWideType ? (
                    <div
                      className={`p-3 rounded-2xl border text-xs sm:text-sm font-medium ${
                        isFormChurchWideLocking
                          ? 'border-[#EFC2C2] bg-[#FDF5F5] text-[#8F2424]'
                          : 'border-[#F0D4B2] bg-[#FFF8EE] text-[#7D4A14]'
                      }`}
                    >
                      {isFormChurchWideLocking
                        ? '全教會聚會時段：僅封鎖所選時間段，當日其他時段仍可自由借用。'
                        : '週二愛家禱告會（例外設定）：保留聚會紀錄，不封鎖其他場地。'}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                      {(orderedVenues ?? VENUES).map((v) => {
                        const isSelected = formData.venue === v;
                        const isBusy = busyVenuesAtSelectedSlot.has(v);
                        const style = getVenueStyle(v);
                        return (
                          <button
                            key={v}
                            type="button"
                            onClick={() => onPatchForm({ venue: v })}
                            className={`relative px-2.5 min-h-[40px] sm:min-h-[36px] rounded-xl text-xs font-semibold border text-left transition active:scale-95 flex items-center justify-between gap-1 cursor-pointer ${
                              isSelected
                                ? isBusy
                                  ? 'bg-[#FDF1F1] border-[#C43E3E] text-[#9A2B2B] ring-1 ring-[#C43E3E]'
                                  : 'bg-[#FFF5EA] border-[#B85A1F] text-[#8E4716] ring-1 ring-[#B85A1F]'
                                : isBusy
                                ? 'bg-[#FAF8F6] border-[#EDE7DF] text-[#A89F95] hover:border-[#DFC6C6]'
                                : 'bg-white border-[#E6DFD3] text-[#3D3731] hover:border-[#C8B9A6] hover:bg-[#FCFBF8]'
                            }`}
                          >
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  isBusy ? 'bg-[#D67C7C]' : style.dot
                                }`}
                              />
                              <span className="truncate">{v}</span>
                            </span>
                            {isBusy && (
                              <span className="text-[9px] font-bold text-[#C43E3E] shrink-0">滿</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* SECTION 2: Date & Time (All 3 pickers use identical 44px touch-friendly flex overlay!) */}
                <div className="bg-[#FAF8F4] p-3.5 sm:p-4 rounded-2xl border border-[#ECE5DA] space-y-3.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#7A7167] inline-flex items-center gap-1.5">
                      <Clock size={13} className="text-[#B85A1F]" />
                      日期與時段
                    </label>
                    <div className="flex items-center gap-1">
                      {[
                        { label: '今天', val: todayStr },
                        { label: '明天', val: tomorrowStr },
                        { label: sundayChipLabel, val: nextSundayStr },
                      ].map((chip) => {
                        const active = formData.date === chip.val;
                        return (
                          <button
                            key={chip.label}
                            type="button"
                            onClick={() => onPatchForm({ date: chip.val })}
                            className={`px-2.5 py-1.5 sm:py-1 rounded-lg text-[11px] font-semibold border active:scale-95 transition cursor-pointer ${
                              active
                                ? 'bg-[#1E1B18] text-white border-[#1E1B18]'
                                : 'bg-white text-[#5C554C] border-[#E3DBD0] hover:border-[#B85A1F]'
                            }`}
                          >
                            {chip.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Unified 44px Pixel-Aligned Pickers (Identical look & feel on iPhone, iPad, Mac, Windows!) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {/* Date Picker with consistent custom display + native picker overlay */}
                    <div className="space-y-1.5 min-w-0">
                      <div className="h-4 flex items-center">
                        <span className="text-[11px] font-semibold text-[#6E665C] leading-none">日期 *</span>
                      </div>
                      <div className="relative h-[44px] sm:h-[42px] flex items-center justify-between px-3 overflow-hidden rounded-xl border border-[#E3DBD0] bg-white focus-within:border-[#B85A1F] focus-within:ring-2 focus-within:ring-[#B85A1F]/15 transition cursor-pointer">
                        <span className="text-[15px] sm:text-sm font-semibold text-[#1E1B18] tabular-nums leading-none truncate">
                          {formData.date ? formatDateWithWeekday(formData.date) : '選擇日期'}
                        </span>
                        <CalendarIcon size={14} className="text-[#8A8177] shrink-0 pointer-events-none" />
                        <input
                          ref={dateInputRef}
                          type="date"
                          name="date"
                          aria-label="預約日期"
                          required
                          value={formData.date}
                          onClick={() => openNativeDatePicker(dateInputRef)}
                          onChange={onInputChange}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-[16px]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:col-span-2 gap-2.5">
                      <div className="space-y-1.5 min-w-0">
                        <div className="h-4 flex items-center">
                          <span className="text-[11px] font-semibold text-[#6E665C] leading-none">開始 *</span>
                        </div>
                        <div className="relative h-[44px] sm:h-[42px] flex items-center justify-between px-3 overflow-hidden rounded-xl border border-[#E3DBD0] bg-white focus-within:border-[#B85A1F] focus-within:ring-2 focus-within:ring-[#B85A1F]/15 transition">
                          <span className="text-[15px] sm:text-sm font-semibold text-[#1E1B18] tabular-nums leading-none">
                            {formData.startTime}
                          </span>
                          <ChevronDown size={14} className="text-[#8A8177] shrink-0 pointer-events-none" />
                          <select
                            name="startTime"
                            aria-label="開始時間"
                            value={formData.startTime}
                            onChange={onInputChange}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-[16px]"
                          >
                            {startOptions.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1.5 min-w-0">
                        <div className="h-4 flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-[#6E665C] leading-none">結束 *</span>
                          {durationLabel && (
                            <span className="text-[10px] font-bold text-[#B85A1F] leading-none">{durationLabel}</span>
                          )}
                        </div>
                        <div className="relative h-[44px] sm:h-[42px] flex items-center justify-between px-3 overflow-hidden rounded-xl border border-[#E3DBD0] bg-white focus-within:border-[#B85A1F] focus-within:ring-2 focus-within:ring-[#B85A1F]/15 transition">
                          <span className="text-[15px] sm:text-sm font-semibold text-[#1E1B18] tabular-nums leading-none">
                            {formData.endTime}
                          </span>
                          <ChevronDown size={14} className="text-[#8A8177] shrink-0 pointer-events-none" />
                          <select
                            name="endTime"
                            aria-label="結束時間"
                            value={formData.endTime}
                            onChange={onInputChange}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-[16px]"
                          >
                            {endOptions.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Balanced Symmetric Quick Grids (Zero orphan wrapping on phone, tablet, or desktop!) */}
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-4 gap-1.5">
                      {DURATION_CHIPS.map((chip) => {
                        const startMins = timeToMinutes(formData.startTime);
                        const endMins = timeToMinutes(formData.endTime);
                        const exceedsLimit = startMins + chip.mins > TIMELINE_END_MIN;
                        const active = !exceedsLimit && endMins - startMins === chip.mins;
                        const targetEnd = getEndTimeAfterMinutes(formData.startTime, chip.mins);
                        return (
                          <button
                            key={chip.label}
                            type="button"
                            disabled={exceedsLimit}
                            title={exceedsLimit ? '超過 22:00 開放上限' : `結束於 ${targetEnd}`}
                            onClick={() => onPatchForm({ endTime: targetEnd })}
                            className={`h-8 sm:h-7 rounded-lg text-xs sm:text-[11px] font-semibold border whitespace-nowrap transition flex items-center justify-center ${
                              exceedsLimit
                                ? 'bg-[#F5F2EC] text-[#C2B8AA] border-[#EAE3D8] cursor-not-allowed'
                                : active
                                ? 'bg-[#FFF3E3] text-[#8E4716] border-[#E5BF92] active:scale-95 cursor-pointer'
                                : 'bg-white text-[#5C554C] border-[#E3DBD0] hover:border-[#C8B9A6] active:scale-95 cursor-pointer'
                            }`}
                          >
                            +{chip.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      {TIME_SLOT_PRESETS.map((preset) => {
                        const isPastToday =
                          !editingId &&
                          formData.date === todayStr &&
                          preset.start < getCurrentTimeStr();
                        const isActive =
                          formData.startTime === preset.start && formData.endTime === preset.end;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            disabled={isPastToday}
                            title={isPastToday ? '今日該時段已過' : `${preset.start}–${preset.end}`}
                            onClick={() =>
                              onPatchForm({ startTime: preset.start, endTime: preset.end })
                            }
                            className={`h-8 sm:h-7 rounded-lg text-xs sm:text-[11px] font-medium border whitespace-nowrap transition flex items-center justify-center ${
                              isPastToday
                                ? 'bg-[#F5F2EC] text-[#BDB4A8] border-[#EAE3D8] cursor-not-allowed line-through'
                                : isActive
                                ? 'bg-[#FFF3E3] text-[#8E4716] border-[#E5BF92] cursor-pointer font-semibold'
                                : 'bg-white text-[#5C554C] border-[#E3DBD0] hover:border-[#C86D2D] hover:text-[#8E4716] active:scale-95 cursor-pointer'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Visual Day Timeline Bar (05:00 - 22:00) */}
                  <div className="pt-0.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] text-[#8A8177]">
                      <span>當日時段分布（{isFormChurchWideType ? CHURCH_WIDE_VENUE : formData.venue}）</span>
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-flex items-center gap-1">
                          <span className="w-2 h-2 rounded-xs bg-[#D6CEC2]" /> 已預約
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className={`w-2 h-2 rounded-xs ${isConflict ? 'bg-[#C43E3E]' : 'bg-[#B85A1F]'}`} /> 本次選擇
                        </span>
                      </span>
                    </div>

                    <div className="relative h-3 w-full rounded-full bg-[#EAE3D8] overflow-hidden">
                      {existingDaySlots.map((slot) => {
                        const left = toTimelinePct(slot.startTime);
                        const width = Math.max(1.5, toTimelinePct(slot.endTime) - left);
                        const wide = isChurchWideBooking(slot);
                        return (
                          <div
                            key={slot.id}
                            title={`${slot.startTime}–${slot.endTime} ${wide ? '全教會' : slot.borrower}`}
                            className={`absolute top-0 bottom-0 ${wide ? 'bg-[#E5A3A3]' : 'bg-[#CFC5B7]'}`}
                            style={{ left: `${left}%`, width: `${width}%` }}
                          />
                        );
                      })}
                      <div
                        className={`absolute top-0 bottom-0 rounded-full transition-all duration-150 ${
                          isConflict ? 'bg-[#C43E3E]/85' : 'bg-[#B85A1F]/85'
                        }`}
                        style={{ left: `${selLeft}%`, width: `${selWidth}%` }}
                      />
                    </div>

                    <div className="flex justify-between text-[9px] text-[#9A9085] tabular-nums px-0.5">
                      <span>05:00</span>
                      <span>09:00</span>
                      <span>13:00</span>
                      <span>17:00</span>
                      <span>22:00</span>
                    </div>

                    {existingDaySlots.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {existingDaySlots.map((slot) => (
                          <span
                            key={slot.id}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-medium tabular-nums border ${
                              isChurchWideBooking(slot)
                                ? 'bg-[#FDF1F1] text-[#9A2B2B] border-[#EFC2C2]'
                                : 'bg-white text-[#6E665C] border-[#E5DDD1]'
                            }`}
                          >
                            {slot.startTime}–{slot.endTime} {isChurchWideBooking(slot) ? '全教會' : slot.borrower}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* SECTION 3: Borrower & Purpose (Smart Keyboard Flow + Upward/Clear Autocomplete!) */}
                <div className="space-y-4">
                  {/* Borrower */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-[#7A7167] inline-flex items-center gap-1.5">
                        <Users size={13} className="text-[#B85A1F]" />
                        借用人 / 單位 <span className="text-[#C43E3E]">*</span>
                      </label>
                      {hasMoreBorrowers && (
                        <button
                          type="button"
                          onClick={() => setShowAllBorrowers((v) => !v)}
                          className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#B85A1F] hover:underline cursor-pointer"
                        >
                          {showAllBorrowers ? (
                            <>
                              收合 <ChevronUp size={13} />
                            </>
                          ) : (
                            <>
                              更多常用 ({filteredBorrowers.length}) <ChevronDown size={13} />
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Horizontal single-row scroll on Phone when collapsed; wraps neatly when expanded or on Tablet+ */}
                    {visibleBorrowers.length > 0 && (
                      <div
                        className={`flex gap-1.5 ${
                          showAllBorrowers
                            ? 'flex-wrap'
                            : 'overflow-x-auto no-scrollbar sm:flex-wrap -mx-1 px-1 py-0.5'
                        }`}
                      >
                        {visibleBorrowers.map((name) => {
                          const isSelected = formData.borrower === name;
                          const isRecent = recentBorrowers.includes(name);
                          return (
                            <button
                              key={name}
                              type="button"
                              onClick={() => {
                                onPatchForm({ borrower: name });
                                setMissingField((prev) => (prev === 'borrower' ? null : prev));
                              }}
                              className={`px-3 py-1.5 sm:py-1 rounded-lg text-xs font-semibold border whitespace-nowrap shrink-0 transition active:scale-95 cursor-pointer ${
                                isSelected
                                  ? 'bg-[#B85A1F] text-white border-[#B85A1F] shadow-2xs'
                                  : isRecent
                                  ? 'bg-[#FFF5EA] text-[#8E4716] border-[#E8C59B] hover:border-[#B85A1F]'
                                  : 'bg-white text-[#5C554C] border-[#E3DBD0] hover:border-[#C86D2D] hover:bg-[#FFF9F2]'
                              }`}
                            >
                              {name}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <SmartAutocompleteInput
                      inputRef={borrowerInputRef}
                      name="borrower"
                      maxLength={90}
                      value={formData.borrower}
                      enterKeyHint="next"
                      dropdownDirection="down"
                      hasError={missingField === 'borrower'}
                      placeholder="點選上方常用，或輸入關鍵字即跳出選項"
                      options={allBorrowerOptions}
                      onChange={(val) => {
                        onPatchForm({ borrower: val });
                        if (val.trim()) setMissingField((prev) => (prev === 'borrower' ? null : prev));
                      }}
                      onEnterNext={() => purposeInputRef.current?.focus()}
                    />
                  </div>

                  {/* Purpose (Opens dropdown UPWARD so mobile keyboard NEVER covers suggestions!) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-[#7A7167] inline-flex items-center gap-1.5">
                        <Sparkles size={13} className="text-[#B85A1F]" />
                        借用用途 <span className="text-[#C43E3E]">*</span>
                      </label>
                      {hasMorePurposes && (
                        <button
                          type="button"
                          onClick={() => setShowAllPurposes((v) => !v)}
                          className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#B85A1F] hover:underline cursor-pointer"
                        >
                          {showAllPurposes ? (
                            <>
                              收合 <ChevronUp size={13} />
                            </>
                          ) : (
                            <>
                              更多用途 ({mergedPurposes.length}) <ChevronDown size={13} />
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    <div
                      className={`flex gap-1.5 ${
                        showAllPurposes
                          ? 'flex-wrap'
                          : 'overflow-x-auto no-scrollbar sm:flex-wrap -mx-1 px-1 py-0.5'
                      }`}
                    >
                      {visiblePurposes.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            onPatchForm({ purpose: preset });
                            setMissingField((prev) => (prev === 'purpose' ? null : prev));
                          }}
                          className={`px-3 py-1.5 sm:py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition border active:scale-95 cursor-pointer ${
                            formData.purpose === preset
                              ? 'bg-[#B85A1F] text-white border-[#B85A1F] shadow-2xs'
                              : 'bg-white text-[#5C554C] border-[#E3DBD0] hover:border-[#C86D2D] hover:bg-[#FFF9F2]'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>

                    <SmartAutocompleteInput
                      inputRef={purposeInputRef}
                      name="purpose"
                      maxLength={400}
                      value={formData.purpose}
                      enterKeyHint="done"
                      dropdownDirection="up"
                      hasError={missingField === 'purpose'}
                      placeholder="選擇上方常用用途，或輸入關鍵字即跳出選項"
                      options={allPurposeOptions}
                      onChange={(val) => {
                        onPatchForm({ purpose: val });
                        if (val.trim()) setMissingField((prev) => (prev === 'purpose' ? null : prev));
                      }}
                      onEnterNext={() => purposeInputRef.current?.blur()}
                    />
                  </div>
                </div>

                {/* SECTION 4: Compact Pill Repeat Selector */}
                <div className="p-3.5 bg-[#FAF6EF] border border-[#EAE0D0] rounded-2xl space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-[#7A7167] inline-flex items-center gap-1.5">
                      <Repeat size={13} className="text-[#B85A1F]" />
                      重複排程
                    </label>
                    {formData.repeat !== 'none' && (
                      <span className="text-[11px] font-bold text-[#8E4716] tabular-nums">
                        預計建立 {repeatCount} 筆
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                    {REPEAT_OPTIONS.map((opt) => {
                      const active = formData.repeat === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            onPatchForm({
                              repeat: opt.value,
                              ...(opt.value === 'none'
                                ? { repeatForever: false, repeatUntil: formData.date }
                                : {}),
                            })
                          }
                          className={`h-8 sm:h-7 rounded-lg text-xs font-semibold border whitespace-nowrap transition flex items-center justify-center active:scale-95 cursor-pointer ${
                            active
                              ? 'bg-[#1E1B18] text-white border-[#1E1B18]'
                              : 'bg-white text-[#5C554C] border-[#E3DBD0] hover:border-[#B85A1F]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  <AnimatePresence initial={false}>
                    {formData.repeat !== 'none' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden"
                      >
                        <div className="pt-2.5 border-t border-[#EAE0D0] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <label className="flex items-center gap-2 text-xs font-semibold text-[#4A433C] cursor-pointer shrink-0">
                            <input
                              type="checkbox"
                              name="repeatForever"
                              checked={formData.repeatForever}
                              onChange={onInputChange}
                              className="w-4 h-4 rounded accent-[#B85A1F]"
                            />
                            建立至最長上限（3 個月，至 {repeatLimitDate}）
                          </label>

                          {!formData.repeatForever && (
                            <div className="relative h-[42px] sm:w-44 flex items-center justify-between px-3 overflow-hidden rounded-xl border border-[#E3DBD0] bg-white focus-within:border-[#B85A1F] focus-within:ring-2 focus-within:ring-[#B85A1F]/15 transition cursor-pointer">
                              <span className="text-sm font-semibold text-[#1E1B18] tabular-nums leading-none">
                                {formData.repeatUntil ? formatDateWithWeekday(formData.repeatUntil) : '選擇截止日'}
                              </span>
                              <CalendarIcon size={14} className="text-[#8A8177] shrink-0 pointer-events-none" />
                              <input
                                ref={repeatUntilInputRef}
                                type="date"
                                name="repeatUntil"
                                aria-label="重複截止日期"
                                required={!formData.repeatForever}
                                value={formData.repeatUntil}
                                min={formData.date}
                                max={repeatLimitDate}
                                onClick={() => openNativeDatePicker(repeatUntilInputRef)}
                                onChange={onInputChange}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-[16px]"
                              />
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </form>
            </div>

            {/* Sticky Bottom Footer */}
            <div
              className={`px-4 py-3 sm:px-6 sm:py-3.5 border-t border-[#EFEAE1] bg-[#FAF8F4] flex ${
                editingId ? 'justify-between' : 'justify-end'
              } items-center gap-2 shrink-0 pb-safe`}
            >
              {editingId && (
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={isSubmitting}
                  className="px-3.5 h-11 text-sm font-semibold text-[#C43E3E] hover:bg-[#FDF1F1] rounded-xl transition inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 size={15} />
                  <span>刪除</span>
                </button>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 h-11 text-sm font-semibold text-[#5C554C] hover:bg-[#EDE6DC] rounded-xl transition cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  form="booking-form"
                  disabled={isSubmitting}
                  className="px-5 h-11 text-sm font-semibold text-white bg-[#B85A1F] hover:bg-[#9E4B18] disabled:opacity-50 shadow-xs rounded-xl active:scale-95 transition inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {isSubmitting ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 size={15} />
                  )}
                  <span>
                    {isSubmitting
                      ? '處理中...'
                      : editingId
                      ? '儲存變更'
                      : formData.repeat !== 'none' && repeatCount > 1
                      ? `確認預約 (${repeatCount}筆)`
                      : '確認預約'}
                  </span>
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
