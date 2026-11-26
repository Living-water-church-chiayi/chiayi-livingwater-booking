import React, { memo, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Clock, Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { VENUES } from '../constants';
import type { Booking } from '../types';
import {
  compareBookingsForDisplay,
  formatDateWithWeekday,
  getBookingStyle,
  getCurrentTimeStr,
  getTodayStr,
  getVenueStyle,
  isChurchWideBooking,
  timeToMinutes,
} from '../utils/bookingUtils';

interface VenueDashboardProps {
  bookings: Booking[];
  orderedVenues?: string[];
  isInitialLoading: boolean;
  onQuickBook: (venue: string) => void;
  onEditBooking: (booking: Booking) => void;
  onCopyBooking: (booking: Booking) => void;
}

type StatusFilter = 'all' | 'busy' | 'free';

function formatRemainingTime(endTime: string, currentMinutes: number): string {
  const diff = timeToMinutes(endTime) - currentMinutes;
  if (diff <= 0) return '即將結束';
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h > 0 && m > 0) return `剩 ${h}小時${m}分`;
  if (h > 0) return `剩 ${h}小時`;
  return `剩 ${m}分鐘`;
}

const VenueDashboard = memo(function VenueDashboard({
  bookings,
  orderedVenues,
  isInitialLoading,
  onQuickBook,
  onEditBooking,
}: VenueDashboardProps) {
  const [now, setNow] = useState(() => new Date());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const todayStr = getTodayStr();
  const currentTimeStr = getCurrentTimeStr(now);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const { todayChurchWide, busySchedules, freeSchedules } = useMemo(() => {
    const todayWide = bookings
      .filter((b) => b.date === todayStr && isChurchWideBooking(b))
      .sort(compareBookingsForDisplay);

    const activeChurchWideNow =
      todayWide.find((b) => b.startTime <= currentTimeStr && b.endTime > currentTimeStr) || null;

    const busy: Array<{ venue: string; index: number; active: Booking; next: Booking | null }> = [];
    const free: Array<{ venue: string; index: number; next: Booking | null }> = [];

    (orderedVenues ?? VENUES).forEach((venue, index) => {
      let active: Booking | null = activeChurchWideNow;
      let next: Booking | null = null;

      for (const b of bookings) {
        if (isChurchWideBooking(b)) continue;
        if (b.venue !== venue) continue;

        if (b.date === todayStr && b.startTime <= currentTimeStr && b.endTime > currentTimeStr) {
          if (!active) active = b;
          continue;
        }
        if (b.date > todayStr || (b.date === todayStr && b.startTime > currentTimeStr)) {
          if (!next || compareBookingsForDisplay(b, next) < 0) {
            next = b;
          }
        }
      }

      if (active) {
        busy.push({ venue, index, active, next });
      } else {
        free.push({ venue, index, next });
      }
    });

    // Sort free rooms: today's upcoming first, then original order
    free.sort((a, b) => {
      const aToday = a.next?.date === todayStr ? 0 : 1;
      const bToday = b.next?.date === todayStr ? 0 : 1;
      if (aToday !== bToday) return aToday - bToday;
      if (aToday === 0 && a.next && b.next) {
        return a.next.startTime.localeCompare(b.next.startTime);
      }
      return a.index - b.index;
    });

    return {
      todayChurchWide: todayWide,
      busySchedules: busy,
      freeSchedules: free,
    };
  }, [bookings, orderedVenues, todayStr, currentTimeStr]);

  const showBusySection = statusFilter === 'all' || statusFilter === 'busy';
  const showFreeSection = statusFilter === 'all' || statusFilter === 'free';

  return (
    <div className="space-y-5">
      {/* Clean Single-Row Overview Header */}
      <div className="bg-white rounded-2xl border border-[#E8E1D6] px-4 py-3.5 sm:px-5 sm:py-4 shadow-[0_2px_10px_rgba(30,27,24,0.03)]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1.5 min-w-0">
            {/* Compact Top-Left Church-Wide Time Slot Pill (only if today has one) */}
            {todayChurchWide.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {todayChurchWide.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onEditBooking(b)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#FDF1F1] border border-[#EFC2C2] hover:bg-[#FCE4E4] text-[#9A2B2B] text-xs font-semibold transition cursor-pointer"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#C43E3E] shrink-0" />
                    <span>全教會</span>
                    <span className="tabular-nums font-bold">
                      {b.startTime}–{b.endTime}
                    </span>
                    {b.purpose && <span className="opacity-80 truncate max-w-[120px]">{b.purpose}</span>}
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-base sm:text-lg font-bold text-[#1E1B18] tracking-tight">
                今日場地狀態
              </h2>
              <span className="text-xs font-medium text-[#8A8177] tabular-nums">
                {formatDateWithWeekday(todayStr)} · {currentTimeStr}
              </span>
            </div>
          </div>

          {/* Sliding Spring Filter Switcher */}
          <div className="grid grid-cols-3 sm:inline-flex items-center gap-1 bg-[#F3EFE8] p-1 rounded-xl w-full sm:w-auto">
            {(
              [
                { id: 'all', label: `全部 ${VENUES.length}`, activeText: 'text-[#1E1B18]', dot: null },
                { id: 'busy', label: `使用中 ${busySchedules.length}`, activeText: 'text-[#9A4916]', dot: 'bg-[#C86D2D]' },
                { id: 'free', label: `空閒 ${freeSchedules.length}`, activeText: 'text-[#1F5E48]', dot: 'bg-[#2B7A62]' },
              ] as const
            ).map((tab) => {
              const isActive = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`relative px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer tabular-nums inline-flex items-center justify-center gap-1.5 ${
                    isActive ? tab.activeText : 'text-[#6E665C] hover:text-[#1E1B18]'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="dashboard-status-pill"
                      transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                      className="absolute inset-0 bg-white rounded-lg shadow-xs"
                    />
                  )}
                  <span className="relative z-10 inline-flex items-center gap-1.5">
                    {tab.dot && <span className={`w-1.5 h-1.5 rounded-full ${tab.dot}`} />}
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Loading Skeleton */}
      {isInitialLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 bg-white rounded-2xl border border-[#E8E1D6] animate-pulse"
            />
          ))}
        </div>
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={statusFilter}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="space-y-6"
          >
            {/* SECTION 1: Currently Occupied Rooms (Clean Flat Cards, Zero Nested Clutter) */}
            {showBusySection && (
              <section className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#C86D2D] animate-pulse" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#6E665C]">
                      使用中 · {busySchedules.length} 間
                    </h3>
                  </div>
                  {busySchedules.length > 0 && (
                    <span className="text-[11px] text-[#9A9085]">點擊卡片可檢視或編輯</span>
                  )}
                </div>

                {busySchedules.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-[#E8E1D6] py-8 text-center text-sm text-[#8A8177]">
                    目前所有場地皆為空閒狀態
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {busySchedules.map(({ venue, active, next }, idx) => {
                      const venueStyle = getVenueStyle(venue);
                      const bookingStyle = getBookingStyle(active);
                      const isChurchWide = isChurchWideBooking(active);

                      const startM = timeToMinutes(active.startTime);
                      const endM = timeToMinutes(active.endTime);
                      const progressPct =
                        endM > startM
                          ? Math.max(4, Math.min(100, Math.round(((currentMinutes - startM) / (endM - startM)) * 100)))
                          : 0;

                      return (
                        <motion.div
                          key={venue}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.18, delay: Math.min(idx * 0.03, 0.12) }}
                          whileHover={{ y: -1 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => onEditBooking(active)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              onEditBooking(active);
                            }
                          }}
                          className="bg-white rounded-2xl border border-[#E8E1D6] hover:border-[#D7C7B2] p-4 shadow-[0_2px_10px_rgba(30,27,24,0.03)] transition cursor-pointer overflow-hidden flex flex-col gap-2.5"
                        >
                          {/* Row 1: Venue Name + Live Time & Remaining */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${venueStyle.dot}`} />
                              <span className="font-bold text-base text-[#1E1B18] truncate">
                                {venue}
                              </span>
                              {isChurchWide && (
                                <span className="px-2 py-0.5 rounded-full bg-[#FDF1F1] text-[#9A2B2B] text-[10px] font-bold shrink-0">
                                  全教會時段
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs font-bold tabular-nums text-[#1E1B18] inline-flex items-center gap-1">
                                <Clock size={12} className="text-[#9A9085]" />
                                {active.startTime}–{active.endTime}
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-[#FFF5EB] text-[#9A4916] text-[10px] font-semibold tabular-nums">
                                {formatRemainingTime(active.endTime, currentMinutes)}
                              </span>
                            </div>
                          </div>

                          {/* Row 2: Borrower & Purpose on One Calm Line */}
                          <div className="flex items-center justify-between gap-2 text-sm text-[#5C554C]">
                            <p className="truncate">
                              <span className="font-semibold text-[#2E2924]">{active.borrower}</span>
                              <span className="mx-2 text-[#D2C9BC]">·</span>
                              <span>{active.purpose}</span>
                            </p>
                            <ChevronRight size={15} className="text-[#C2B7A9] shrink-0" />
                          </div>

                          {/* Hairline Progress Bar */}
                          <div className="h-1 w-full rounded-full bg-[#F1ECE4] overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${bookingStyle.bar}`}
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>

                          {/* Optional Quiet Next Line (only if today has another booking in this room) */}
                          {next && next.date === todayStr && (
                            <p className="text-[11px] text-[#8A8177] truncate">
                              今日稍後 <span className="tabular-nums font-semibold text-[#5C554C]">{next.startTime}–{next.endTime}</span> · {next.borrower}
                            </p>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* SECTION 2: Available Rooms (Unified Serene List — Zero Nested Box Clutter!) */}
            {showFreeSection && (
              <section className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#2B7A62]" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#6E665C]">
                      目前空閒 · {freeSchedules.length} 間
                    </h3>
                  </div>
                </div>

                {freeSchedules.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-[#E8E1D6] py-8 text-center text-sm text-[#8A8177]">
                    目前沒有空閒場地
                  </div>
                ) : (
                  <div className="bg-white rounded-2xl border border-[#E8E1D6] shadow-[0_2px_10px_rgba(30,27,24,0.03)] overflow-hidden grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    {freeSchedules.map(({ venue, next }) => {
                      const venueStyle = getVenueStyle(venue);
                      const isNextToday = next?.date === todayStr;

                      return (
                        <div
                          key={venue}
                          className="bg-white px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-[#FCFBF8] transition-colors border-b border-[#F2ECE3] md:border-r last:border-b-0"
                        >
                          {/* Venue Info + Quiet Next Slot Subtitle */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${venueStyle.dot}`} />
                              <span className="font-bold text-sm sm:text-base text-[#1E1B18] truncate">
                                {venue}
                              </span>
                            </div>

                            {next ? (
                              <button
                                type="button"
                                onClick={() => onEditBooking(next)}
                                className="mt-1 text-left text-xs text-[#7A7167] hover:text-[#B85A1F] transition truncate block max-w-full cursor-pointer pl-4"
                                title="點擊檢視或編輯此預約"
                              >
                                <span
                                  className={`tabular-nums font-semibold ${
                                    isNextToday ? 'text-[#B85A1F]' : 'text-[#5C554C]'
                                  }`}
                                >
                                  {isNextToday ? '今日' : formatDateWithWeekday(next.date)}{' '}
                                  {next.startTime}
                                </span>
                                <span className="mx-1.5 text-[#D2C9BC]">·</span>
                                <span>{next.borrower}</span>
                              </button>
                            ) : (
                              <p className="mt-1 text-xs text-[#A89F95] pl-4">
                                近期尚無預約
                              </p>
                            )}
                          </div>

                          {/* Single Crisp Quick-Book CTA */}
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.94 }}
                            onClick={() => onQuickBook(venue)}
                            className="shrink-0 inline-flex items-center gap-1 px-3 h-8 rounded-xl bg-[#FAF8F4] hover:bg-[#FFF3E3] border border-[#E6DFD3] hover:border-[#E5BF92] text-xs font-semibold text-[#5C554C] hover:text-[#B85A1F] transition cursor-pointer"
                          >
                            <Plus size={13} />
                            <span>借用</span>
                          </motion.button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
});

export default VenueDashboard;
