import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Clock,
  Copy,
  Edit2,
  MapPin,
  Plus,
  Repeat,
  Search,
  Users,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { MONTH_NAMES, VENUES, WEEKDAYS } from '../constants';
import type { Booking } from '../types';
import {
  addDaysToDateStr,
  compareBookingsForDisplay,
  formatDateShort,
  formatDurationLabel,
  getBookingStyle,
  getBookingVenueLabel,
  getTodayStr,
  getVenueStyle,
  isChurchWideBooking,
} from '../utils/bookingUtils';

interface MonthCalendarProps {
  bookings: Booking[];
  orderedVenues?: string[];
  isInitialLoading: boolean;
  currentDate: Date;
  selectedDateStr: string;
  selectedVenues: string[];
  searchQuery: string;
  clipboardBooking: Booking | null;
  onSearchChange: (q: string) => void;
  onToggleVenue: (venue: string) => void;
  onSelectAllVenues: () => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onGoToToday: () => void;
  onSelectDate: (dateStr: string) => void;
  onContextMenuDate: (event: React.MouseEvent<HTMLDivElement>, dateStr: string) => void;
  onNewBooking: (dateStr: string) => void;
  onEditBooking: (booking: Booking) => void;
  onCopyBooking: (booking: Booking) => void;
  onPasteToDate: (dateStr: string) => void;
}

const MonthCalendar = memo(function MonthCalendar({
  bookings,
  orderedVenues,
  isInitialLoading,
  currentDate,
  selectedDateStr,
  selectedVenues,
  searchQuery,
  clipboardBooking,
  onSearchChange,
  onToggleVenue,
  onSelectAllVenues,
  onPrevMonth,
  onNextMonth,
  onGoToToday,
  onSelectDate,
  onContextMenuDate,
  onNewBooking,
  onEditBooking,
  onCopyBooking,
  onPasteToDate,
}: MonthCalendarProps) {
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const todayStr = getTodayStr();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthKey = `${year}-${month}`;
  const prevMonthValRef = useRef(year * 12 + month);
  const [monthDirection, setMonthDirection] = useState(0);

  useEffect(() => {
    const curVal = year * 12 + month;
    if (curVal !== prevMonthValRef.current) {
      setMonthDirection(curVal > prevMonthValRef.current ? 1 : -1);
      prevMonthValRef.current = curVal;
    }
  }, [year, month]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isAllVenuesSelected = selectedVenues.length === VENUES.length;
  const selectedVenueSet = useMemo(() => new Set(selectedVenues), [selectedVenues]);

  // Pre-index bookings by date once: separate venue bookings & church-wide time slots cleanly
  const { bookingsByDate, churchWideByDate } = useMemo(() => {
    const byDate = new Map<string, Booking[]>();
    const wideByDate = new Map<string, Booking[]>();

    for (const b of bookings) {
      const churchWide = isChurchWideBooking(b);
      if (churchWide) {
        const arr = wideByDate.get(b.date);
        if (arr) arr.push(b);
        else wideByDate.set(b.date, [b]);
      }

      if (!churchWide && !selectedVenueSet.has(b.venue)) continue;

      if (normalizedQuery) {
        const hay = `${b.borrower} ${b.purpose} ${b.venue} ${getBookingVenueLabel(b)}`.toLowerCase();
        if (!hay.includes(normalizedQuery)) continue;
      }

      const arr = byDate.get(b.date);
      if (arr) arr.push(b);
      else byDate.set(b.date, [b]);
    }

    byDate.forEach((arr) => arr.sort(compareBookingsForDisplay));
    wideByDate.forEach((arr) => arr.sort(compareBookingsForDisplay));
    return { bookingsByDate: byDate, churchWideByDate: wideByDate };
  }, [bookings, selectedVenueSet, normalizedQuery]);

  const currentMonthPrefix = `${year}-${String(month + 1).padStart(2, '0')}-`;
  const monthBookingCount = useMemo(() => {
    let total = 0;
    bookingsByDate.forEach((arr, dateStr) => {
      if (dateStr.startsWith(currentMonthPrefix)) total += arr.length;
    });
    return total;
  }, [bookingsByDate, currentMonthPrefix]);

  const selectedDateBookings = bookingsByDate.get(selectedDateStr) ?? [];

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const t = e.changedTouches[0];
    swipeStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 55 || Math.abs(dx) <= Math.abs(dy) * 1.2) return;
    if (dx > 0) onPrevMonth();
    else onNextMonth();
  };

  const stepSelectedDay = (delta: number) => {
    onSelectDate(addDaysToDateStr(selectedDateStr, delta));
  };

  return (
    /* Responsive Layout:
       - Phone (< 640px): compact stacked calendar + swipeable agenda
       - Tablet Portrait (640px - 1023px): comfortable calendar + 2-column agenda
       - Tablet Landscape & Desktop (>= 1024px): side-by-side Calendar + Sticky Agenda panel! */
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] gap-4 sm:gap-5 items-start">
      {/* LEFT / TOP: Month Calendar Card */}
      <div className="bg-white rounded-3xl border border-[#E8E1D6] shadow-[0_4px_20px_rgba(30,27,24,0.04)] overflow-hidden p-3 sm:p-5">
        {/* Month Header + Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3">
          <div className="flex items-center justify-between sm:justify-start gap-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-base sm:text-xl font-bold text-[#1E1B18] tracking-tight tabular-nums whitespace-nowrap">
                {year} 年 {MONTH_NAMES[month]}
              </h2>
              <span className="text-[11px] font-semibold text-[#7A7167] bg-[#F3EFE8] px-2 py-0.5 rounded-full tabular-nums shrink-0">
                {monthBookingCount} 筆
              </span>
            </div>

            <div className="flex items-center gap-1">
              {/* Mobile search toggle icon */}
              <button
                type="button"
                onClick={() => setMobileSearchOpen((v) => !v)}
                className={`sm:hidden w-9 h-9 rounded-xl flex items-center justify-center border transition cursor-pointer ${
                  mobileSearchOpen || searchQuery
                    ? 'bg-[#FFF3E3] text-[#B85A1F] border-[#E8C59B]'
                    : 'bg-[#F5F1EA] text-[#5C554C] border-transparent'
                }`}
                aria-label="搜尋預約"
              >
                <Search size={16} />
              </button>

              <div className="flex items-center gap-0.5 bg-[#F5F1EA] p-1 rounded-xl">
                <button
                  type="button"
                  onClick={onPrevMonth}
                  className="w-8 h-8 sm:w-8 sm:h-8 flex items-center justify-center hover:bg-white rounded-lg text-[#5C554C] hover:text-[#1E1B18] active:scale-95 transition cursor-pointer"
                  aria-label="上個月"
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  type="button"
                  onClick={onGoToToday}
                  className="px-2.5 h-8 text-xs font-semibold text-[#5C554C] hover:text-[#B85A1F] hover:bg-white rounded-lg active:scale-95 transition cursor-pointer whitespace-nowrap"
                >
                  今天
                </button>
                <button
                  type="button"
                  onClick={onNextMonth}
                  className="w-8 h-8 sm:w-8 sm:h-8 flex items-center justify-center hover:bg-white rounded-lg text-[#5C554C] hover:text-[#1E1B18] active:scale-95 transition cursor-pointer"
                  aria-label="下個月"
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
          </div>

          {/* Search Bar: Always visible on Tablet/Desktop; clean collapsible on Phone */}
          <div className={`${mobileSearchOpen || searchQuery ? 'block' : 'hidden'} sm:block relative w-full sm:w-56 xl:w-64`}>
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9A9085] pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="搜尋借用人、用途、場地..."
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-[#FAF8F4] border border-[#E6DFD3] focus:bg-white focus:border-[#B85A1F] focus:ring-2 focus:ring-[#B85A1F]/15 text-[16px] sm:text-sm text-[#1E1B18] placeholder:text-[#9A9085] outline-none transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#8A8177] hover:text-[#1E1B18] cursor-pointer"
                aria-label="清除搜尋"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Venue Filter Strip — smooth horizontal snap on phone, neat wrap on tablet/desktop */}
        <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1 no-scrollbar snap-x -mx-3 px-3 sm:mx-0 sm:px-0 sm:flex-wrap">
          <button
            type="button"
            onClick={onSelectAllVenues}
            className={`px-3 py-1.5 sm:py-1 rounded-full text-xs sm:text-[11px] font-semibold whitespace-nowrap transition border shrink-0 snap-start cursor-pointer ${
              isAllVenuesSelected
                ? 'bg-[#1E1B18] text-[#FAF8F4] border-[#1E1B18]'
                : 'bg-white text-[#6E665C] border-[#E0D8CC] hover:bg-[#F5F1EA]'
            }`}
          >
            全部場地
          </button>

          {(orderedVenues ?? VENUES).map((venue) => {
            const isSelected = selectedVenueSet.has(venue);
            const style = getVenueStyle(venue);
            return (
              <button
                key={venue}
                type="button"
                onClick={() => onToggleVenue(venue)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 sm:py-1 rounded-full text-xs sm:text-[11px] font-semibold whitespace-nowrap transition border shrink-0 snap-start cursor-pointer ${
                  isSelected && !isAllVenuesSelected
                    ? `${style.pillActive} shadow-2xs`
                    : isSelected
                    ? 'bg-[#FAF8F4] text-[#4E4740] border-[#E5DDD1] hover:border-[#CFC4B4]'
                    : 'bg-white text-[#A39A90] border-[#ECE6DD] hover:text-[#5C554C]'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${isSelected ? style.dot : 'bg-[#D2C9BC]'}`}
                />
                {venue}
              </button>
            );
          })}
        </div>

        {/* Month Grid */}
        <div
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={() => {
            swipeStartRef.current = null;
          }}
          className="touch-pan-y select-none"
        >
          <div className="rounded-2xl overflow-hidden border border-[#EAE3D8] bg-[#EAE3D8]">
            <div className="grid grid-cols-7 gap-px">
              {WEEKDAYS.map((day, i) => (
                <div
                  key={day}
                  className={`bg-[#FAF8F4] py-2 text-center text-[11px] font-bold tracking-wider ${
                    i === 0 ? 'text-[#B84637]' : i === 6 ? 'text-[#8A6D46]' : 'text-[#7A7167]'
                  }`}
                >
                  {day}
                </div>
              ))}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={monthKey}
                initial={{ opacity: 0, x: monthDirection * 22 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: monthDirection * -22 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="grid grid-cols-7 gap-px mt-px"
              >
                {Array.from({ length: firstDayOfMonth }).map((_, idx) => (
                  <div
                    key={`pad-${idx}`}
                    className="bg-[#FDFCFA] min-h-[54px] sm:min-h-[84px] lg:min-h-[92px]"
                  />
                ))}

                {Array.from({ length: daysInMonth }).map((_, idx) => {
                  const day = idx + 1;
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const dayBookings = bookingsByDate.get(dateStr) ?? [];
                  const dayChurchWide = churchWideByDate.get(dateStr) ?? [];
                  const hasChurchWide = dayChurchWide.length > 0;
                  const isToday = dateStr === todayStr;
                  const isSelected = dateStr === selectedDateStr;
                  const isPast = dateStr < todayStr;

                  return (
                    <div
                      key={dateStr}
                      onClick={() => onSelectDate(dateStr)}
                      onContextMenu={(e) => onContextMenuDate(e, dateStr)}
                      className={`min-h-[54px] sm:min-h-[84px] lg:min-h-[92px] p-1 sm:p-1.5 transition-colors cursor-pointer relative flex flex-col active:bg-[#FFF3E3] ${
                        isSelected ? 'bg-[#FFF8F0]' : 'bg-white hover:bg-[#FBF9F5]'
                      }`}
                    >
                      {/* Smooth spring selection frame that glides between tapped dates */}
                      {isSelected && (
                        <motion.span
                          layoutId="calendar-selected-day"
                          transition={{ type: 'spring', stiffness: 480, damping: 36 }}
                          className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-[#C86D2D] z-10"
                        />
                      )}

                      {/* Subtle Top-Left Indicator Dot ONLY when that day has a church-wide time slot */}
                      {hasChurchWide && (
                        <span
                          title={`全教會時段：${dayChurchWide.map((b) => `${b.startTime}–${b.endTime} ${b.purpose}`).join('、')}`}
                          className="absolute top-1.5 left-1.5 w-1.5 h-1.5 rounded-full bg-[#C43E3E] z-10"
                        />
                      )}

                      {/* Day Number */}
                      <div className="flex items-center justify-center sm:justify-end mb-1">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold tabular-nums transition-colors ${
                            isToday
                              ? 'bg-[#B85A1F] text-white shadow-xs'
                              : isSelected
                              ? 'bg-[#FBE7D3] text-[#8E4716] font-bold'
                              : isPast
                              ? 'text-[#A89F95]'
                              : 'text-[#2D2823]'
                          }`}
                        >
                          {day}
                        </span>
                      </div>

                      {/* Phone: Compact Colored Dots + Count */}
                      <div className="flex sm:hidden flex-col items-center justify-center gap-0.5 mt-auto pb-1">
                        {dayBookings.length > 0 && (
                          <div className="flex flex-wrap justify-center gap-1 max-w-full">
                            {dayBookings.slice(0, 4).map((b) => (
                              <span
                                key={b.id}
                                className={`w-1.5 h-1.5 rounded-full ${getBookingStyle(b).dot}`}
                              />
                            ))}
                            {dayBookings.length > 4 && (
                              <span className="text-[9px] font-bold text-[#8A8177] leading-none">
                                +{dayBookings.length - 4}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Tablet & Desktop: Clean Mini Event Pills */}
                      <div className="hidden sm:flex flex-col gap-0.5 flex-1 overflow-hidden">
                        {dayBookings.slice(0, 3).map((b) => {
                          const style = getBookingStyle(b);
                          const churchWide = isChurchWideBooking(b);
                          const label = churchWide ? b.purpose || '全教會' : b.venue;
                          return (
                            <div
                              key={b.id}
                              title={`${b.startTime}–${b.endTime} ${getBookingVenueLabel(b)} · ${b.borrower} (${b.purpose})`}
                              className={`px-1 py-0.5 rounded-[5px] text-[10px] font-medium truncate leading-tight flex items-center gap-1 ${style.chip}`}
                            >
                              <span className="tabular-nums text-[9px] opacity-75 shrink-0">{b.startTime}</span>
                              <span className="truncate font-semibold">{label}</span>
                            </div>
                          );
                        })}
                        {dayBookings.length > 3 && (
                          <span className="text-[10px] font-semibold text-[#8A8177] pl-1 leading-tight">
                            +{dayBookings.length - 3} 筆
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-between mt-2.5 px-1 text-[11px] text-[#8A8177]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C43E3E]" />
              左上紅點代表當日含全教會時段
            </span>
            <span className="sm:hidden">左右滑動可換月</span>
          </div>
        </div>
      </div>

      {/* RIGHT (Tablet Landscape / Desktop) / BOTTOM (Phone / Tablet Portrait): Sticky Date Detail Panel */}
      <div className="bg-white rounded-3xl border border-[#E8E1D6] shadow-[0_4px_20px_rgba(30,27,24,0.04)] p-4 sm:p-5 lg:sticky lg:top-20">
        {/* Date Header + Quick Prev/Next Day Stepper for Effortless Phone/Tablet Browsing */}
        <div className="flex items-center justify-between gap-2 pb-3.5 mb-3.5 border-b border-[#F2ECE3]">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center bg-[#F5F1EA] rounded-xl p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => stepSelectedDay(-1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-[#5C554C] hover:bg-white active:scale-95 transition cursor-pointer"
                aria-label="前一天"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => stepSelectedDay(1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-[#5C554C] hover:bg-white active:scale-95 transition cursor-pointer"
                aria-label="後一天"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-[#1E1B18] whitespace-nowrap">
                  {formatDateShort(selectedDateStr)}
                </h3>
                {selectedDateStr === todayStr && (
                  <span className="px-1.5 py-0.5 rounded-full bg-[#B85A1F] text-white text-[10px] font-bold">
                    今天
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#8A8177] tabular-nums">
                共 {selectedDateBookings.length} 筆預約
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {clipboardBooking && (
              <button
                type="button"
                onClick={() => onPasteToDate(selectedDateStr)}
                className="inline-flex items-center gap-1 px-2.5 h-9 rounded-xl text-xs font-semibold text-[#8E4716] bg-[#FFF3E3] hover:bg-[#FDE6CA] border border-[#E8C59B] active:scale-95 transition cursor-pointer"
                title="貼上複製的預約到此日"
              >
                <ClipboardPaste size={14} />
                <span>貼上</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onNewBooking(selectedDateStr)}
              className="inline-flex items-center gap-1 px-3 h-9 rounded-xl text-xs font-semibold text-white bg-[#B85A1F] hover:bg-[#9E4B18] active:scale-95 transition cursor-pointer"
            >
              <Plus size={14} />
              <span>預約</span>
            </button>
          </div>
        </div>

        {/* Agenda Cards with smooth date-change crossfade */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={isInitialLoading ? 'loading' : `${selectedDateStr}-${normalizedQuery}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
          >
            {isInitialLoading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-24 rounded-2xl bg-[#F7F4EE] border border-[#ECE5DA] animate-pulse"
                  />
                ))}
              </div>
            ) : selectedDateBookings.length === 0 ? (
              <div className="py-10 text-center rounded-2xl border border-dashed border-[#E2D9CC] bg-[#FCFBF8]">
                <div className="w-11 h-11 rounded-2xl bg-white border border-[#EAE3D8] flex items-center justify-center mx-auto mb-2.5 text-[#C2B7A9]">
                  <CalendarIcon size={20} />
                </div>
                <p className="text-sm font-semibold text-[#6E665C]">
                  {normalizedQuery ? '找不到符合條件的預約' : '當日尚無場地預約'}
                </p>
                {!normalizedQuery && (
                  <button
                    type="button"
                    onClick={() => onNewBooking(selectedDateStr)}
                    className="mt-3 px-3.5 py-2 rounded-xl bg-[#FFF3E3] text-xs font-bold text-[#B85A1F] hover:bg-[#FDE7CC] active:scale-95 transition inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus size={14} />
                    安排這天的第一個時段
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-2.5 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto custom-scrollbar lg:pr-0.5">
                {selectedDateBookings.map((b, idx) => {
                  const style = getBookingStyle(b);
                  const duration = formatDurationLabel(b.startTime, b.endTime);
                  const churchWide = isChurchWideBooking(b);

                  return (
                    <motion.div
                      key={b.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: Math.min(idx * 0.03, 0.15) }}
                      whileHover={{ y: -1 }}
                      whileTap={{ scale: 0.985 }}
                      onClick={() => onEditBooking(b)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onEditBooking(b);
                        }
                      }}
                      className={`rounded-2xl border p-3.5 transition-colors cursor-pointer flex flex-col gap-2 ${style.card}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <span className="inline-flex items-center gap-1 text-sm font-bold tabular-nums text-[#1E1B18]">
                            <Clock size={13} className="opacity-70 shrink-0" />
                            {b.startTime}–{b.endTime}
                          </span>
                          {duration && (
                            <span className="px-1.5 py-0.5 rounded-md bg-white/80 text-[10px] font-semibold text-[#5C554C]">
                              {duration}
                            </span>
                          )}
                          {b.groupId && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white/80 text-[10px] font-semibold text-[#5C554C]">
                              <Repeat size={10} />
                              重複
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onCopyBooking(b);
                            }}
                            className="w-8 h-8 rounded-lg bg-white/85 hover:bg-white text-[#5C554C] hover:text-[#B85A1F] flex items-center justify-center transition active:scale-95 cursor-pointer"
                            title="複製此預約"
                          >
                            <Copy size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditBooking(b);
                            }}
                            className="w-8 h-8 rounded-lg bg-white/85 hover:bg-white text-[#5C554C] hover:text-[#B85A1F] flex items-center justify-center transition active:scale-95 cursor-pointer"
                            title="編輯此預約"
                          >
                            <Edit2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 flex-wrap text-xs sm:text-sm">
                        <span className="inline-flex items-center gap-1 font-bold text-[#1E1B18]">
                          <MapPin size={13} className="opacity-70 shrink-0" />
                          {churchWide ? '全教會時段' : b.venue}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[#4A433C] font-medium">
                          <Users size={13} className="opacity-65 shrink-0" />
                          {b.borrower}
                        </span>
                      </div>

                      <p className="text-xs text-[#5C554C] bg-white/65 rounded-xl px-3 py-1.5 border border-black/5 truncate">
                        {b.purpose}
                      </p>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
});

export default MonthCalendar;
