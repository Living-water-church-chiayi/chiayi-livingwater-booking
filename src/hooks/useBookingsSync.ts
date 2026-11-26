import { useCallback, useEffect, useRef, useState } from 'react';
import {
  collection,
  getDocs,
  getDocsFromCache,
  getDocsFromServer,
  onSnapshot,
  orderBy,
  query,
  type QuerySnapshot,
} from 'firebase/firestore';
import { BOOKINGS_CACHE_KEY } from '../constants';
import { db, handleFirestoreError, OperationType, resetFirestoreNetwork } from '../firebase';
import type { Booking, SyncStatus } from '../types';
import { addDaysToDateStr, getTodayStr } from '../utils/bookingUtils';

const SERVER_FETCH_TIMEOUT_MS = 6500;
const SLEEP_RESET_THRESHOLD_MS = 25_000;
const RESUME_COOLDOWN_MS = 1500;
const CACHE_PAST_WINDOW_DAYS = 60;

function readCachedBookings(): Booking[] {
  try {
    const raw = window.localStorage.getItem(BOOKINGS_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { bookings?: Booking[] };
    if (Array.isArray(parsed?.bookings)) {
      return parsed.bookings.filter(
        (b) => b && typeof b.id === 'string' && typeof b.date === 'string' && typeof b.startTime === 'string' && typeof b.endTime === 'string'
      );
    }
  } catch {
    // ignore corrupted/unavailable localStorage
  }
  return [];
}

function writeCachedBookings(bookings: Booking[]): void {
  try {
    // Keep localStorage compact forever (strip heavy Firestore Timestamp objects & prune bookings > 60 days old)
    const cutoffDate = addDaysToDateStr(getTodayStr(), -CACHE_PAST_WINDOW_DAYS);
    const compact = bookings
      .filter((b) => b.date >= cutoffDate)
      .map(({ createdAt: _createdAt, ...rest }) => rest);

    window.localStorage.setItem(
      BOOKINGS_CACHE_KEY,
      JSON.stringify({
        updatedAt: Date.now(),
        bookings: compact,
      })
    );
  } catch {
    // ignore quota errors
  }
}

function snapshotToBookings(snapshot: QuerySnapshot): Booking[] {
  const bks: Booking[] = [];
  snapshot.forEach((bookingDoc) => {
    const raw = bookingDoc.data() as Partial<Omit<Booking, 'id'>>;
    // Defensive normalization: never let a malformed Firestore doc crash the UI
    if (!raw.date || !raw.startTime || !raw.endTime) return;
    bks.push({
      id: bookingDoc.id,
      bookingType: raw.bookingType || 'standard',
      venue: String(raw.venue || ''),
      date: String(raw.date),
      startTime: String(raw.startTime),
      endTime: String(raw.endTime),
      borrower: String(raw.borrower || ''),
      purpose: String(raw.purpose || ''),
      uid: String(raw.uid || 'anonymous'),
      authorName: raw.authorName,
      createdAt: raw.createdAt,
      groupId: raw.groupId ?? null,
      repeat: raw.repeat,
      repeatUntil: raw.repeatUntil,
      repeatForever: raw.repeatForever,
    });
  });
  return bks;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
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

export interface BookingsSyncState {
  bookings: Booking[];
  syncStatus: SyncStatus;
  lastSyncedAt: Date | null;
  hasHydratedCache: boolean;
  refreshNow: (forceReconnect?: boolean) => Promise<void>;
  fetchFreshBookings: () => Promise<Booking[]>;
}

/**
 * PWA-hardened Firestore booking sync hook.
 *
 * Solves iOS/Android home-screen ("加到主畫面") blank-load issues via 4 layers:
 * 1. Instant localStorage hydration on mount (zero blank white calendar on cold open).
 * 2. IndexedDB cached snapshot + real-time onSnapshot listener.
 * 3. Proactive Firestore network recycle when waking from >25s background sleep (kills zombie WebKit sockets).
 * 4. Watchdog timeout (6.5s) on server fetches that automatically cycles disableNetwork/enableNetwork & retries.
 */
export function useBookingsSync(): BookingsSyncState {
  const initialCacheRef = useRef<Booking[] | null>(null);
  if (initialCacheRef.current === null) {
    initialCacheRef.current = typeof window !== 'undefined' ? readCachedBookings() : [];
  }

  const [bookings, setBookings] = useState<Booking[]>(initialCacheRef.current);
  const [hasHydratedCache] = useState<boolean>(initialCacheRef.current.length > 0);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(
    initialCacheRef.current.length > 0 ? 'syncing' : 'loading'
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [listenerVersion, setListenerVersion] = useState(0);

  const isMountedRef = useRef(true);
  const refreshInFlightRef = useRef(false);
  const pendingForceReconnectRef = useRef(false);
  const lastResumeAtRef = useRef(0);
  const hiddenAtRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const bookingsCountRef = useRef(bookings.length);
  bookingsCountRef.current = bookings.length;

  const bookingsQueryRef = useRef(
    query(collection(db, 'bookings'), orderBy('date', 'asc'), orderBy('startTime', 'asc'))
  );

  const applyList = useCallback((list: Booking[], fromServer: boolean) => {
    if (!isMountedRef.current) return;
    setBookings(list);
    if (list.length > 0 || fromServer) {
      writeCachedBookings(list);
    }
    if (fromServer) {
      setSyncStatus('live');
      setLastSyncedAt(new Date());
    }
  }, []);

  const refreshNow = useCallback(
    async (forceReconnect = false) => {
      if (refreshInFlightRef.current) {
        if (forceReconnect) {
          pendingForceReconnectRef.current = true;
        }
        return;
      }
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      refreshInFlightRef.current = true;

      if (isMountedRef.current) {
        setSyncStatus((prev) =>
          forceReconnect ? 'reconnecting' : prev === 'live' ? 'syncing' : bookingsCountRef.current > 0 ? 'syncing' : 'loading'
        );
      }

      const q = bookingsQueryRef.current;

      try {
        if (forceReconnect) {
          await resetFirestoreNetwork();
          if (isMountedRef.current) {
            setListenerVersion((v) => v + 1);
          }
        }

        const serverSnap = await withTimeout(
          getDocsFromServer(q),
          SERVER_FETCH_TIMEOUT_MS,
          'Firestore server sync'
        );
        applyList(snapshotToBookings(serverSnap), true);
      } catch (firstErr) {
        console.warn('Primary Firestore server sync stalled/failed, recycling network:', firstErr);
        if (isMountedRef.current) {
          setSyncStatus('reconnecting');
        }
        try {
          // Recycle frozen iOS/Safari WebKit socket and retry once
          await resetFirestoreNetwork();
          if (isMountedRef.current) {
            setListenerVersion((v) => v + 1);
          }
          const retrySnap = await withTimeout(
            getDocsFromServer(q),
            SERVER_FETCH_TIMEOUT_MS + 2500,
            'Firestore reconnect sync'
          );
          applyList(snapshotToBookings(retrySnap), true);
        } catch (secondErr) {
          console.warn('Firestore reconnect sync failed; falling back to cache:', secondErr);
          try {
            const cacheSnap = await getDocsFromCache(q);
            if (!cacheSnap.empty) {
              applyList(snapshotToBookings(cacheSnap), false);
            }
          } catch {
            // ignore cache miss
          }
          if (isMountedRef.current) {
            setSyncStatus('error');
          }
          if (retryTimerRef.current === null) {
            retryTimerRef.current = window.setTimeout(() => {
              retryTimerRef.current = null;
              if (isMountedRef.current && document.visibilityState !== 'hidden') {
                void refreshNow(true);
              }
            }, 5000);
          }
        }
      } finally {
        refreshInFlightRef.current = false;
        if (pendingForceReconnectRef.current && isMountedRef.current) {
          pendingForceReconnectRef.current = false;
          void refreshNow(true);
        }
      }
    },
    [applyList]
  );

  // Used right before writes (conflict check) with timeout & reconnect protection
  const fetchFreshBookings = useCallback(async (): Promise<Booking[]> => {
    const q = bookingsQueryRef.current;
    try {
      const snap = await withTimeout(getDocsFromServer(q), SERVER_FETCH_TIMEOUT_MS, 'Pre-write server check');
      const list = snapshotToBookings(snap);
      applyList(list, true);
      return list;
    } catch {
      await resetFirestoreNetwork();
      const snap = await withTimeout(getDocs(q), SERVER_FETCH_TIMEOUT_MS, 'Pre-write fallback check');
      const list = snapshotToBookings(snap);
      applyList(list, true);
      return list;
    }
  }, [applyList]);

  // Attach real-time Firestore listener (re-attaches cleanly whenever listenerVersion increments)
  useEffect(() => {
    isMountedRef.current = true;
    const q = bookingsQueryRef.current;

    const unsubscribe = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!isMountedRef.current) return;
        const fromServer = !snapshot.metadata.fromCache;
        const list = snapshotToBookings(snapshot);
        // Never overwrite hydrated cache with an empty initial cache-miss snapshot
        if (list.length === 0 && !fromServer && bookingsCountRef.current > 0) {
          return;
        }
        applyList(list, fromServer);
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.LIST, 'bookings');
        } catch {
          // logged inside handleFirestoreError
        }
        if (isMountedRef.current) {
          setSyncStatus('reconnecting');
        }
        if (retryTimerRef.current === null) {
          retryTimerRef.current = window.setTimeout(() => {
            retryTimerRef.current = null;
            if (isMountedRef.current) {
              void refreshNow(true);
            }
          }, 3000);
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [listenerVersion, applyList, refreshNow]);

  // Initial server sync + PWA lifecycle resume detection (iOS standalone + Android PWA + bfcache)
  useEffect(() => {
    isMountedRef.current = true;

    // Kick off immediate server verification on cold start
    void refreshNow(false);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
        return;
      }

      const now = Date.now();
      if (now - lastResumeAtRef.current < RESUME_COOLDOWN_MS) return;
      lastResumeAtRef.current = now;

      const sleptMs = hiddenAtRef.current ? now - hiddenAtRef.current : 0;
      hiddenAtRef.current = null;

      // On iOS standalone PWA, sockets die silently after ~20-30s in background.
      // Proactively recycle the Firestore connection so content loads immediately instead of hanging!
      const shouldForceReconnect = sleptMs >= SLEEP_RESET_THRESHOLD_MS;
      void refreshNow(shouldForceReconnect);
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      const now = Date.now();
      if (now - lastResumeAtRef.current < RESUME_COOLDOWN_MS) return;
      lastResumeAtRef.current = now;
      // Persisted bfcache restore always benefits from a clean network reconnect
      void refreshNow(event.persisted);
    };

    const handleOnline = () => {
      lastResumeAtRef.current = Date.now();
      void refreshNow(true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('online', handleOnline);

    return () => {
      isMountedRef.current = false;
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('online', handleOnline);
    };
  }, [refreshNow]);

  return {
    bookings,
    syncStatus,
    lastSyncedAt,
    hasHydratedCache,
    refreshNow,
    fetchFreshBookings,
  };
}
