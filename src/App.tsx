/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, ErrorInfo, ReactNode } from 'react';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin, 
  Plus, 
  X, 
  Users, 
  Info, 
  CheckCircle2, 
  ChevronLeft, 
  ChevronRight,
  LayoutDashboard,
  Edit2,
  Trash2,
  Copy,
  Filter,
  AlertCircle,
  LogOut,
  LogIn
} from 'lucide-react';
import { motion, AnimatePresence } from "motion/react";
import { 
  db, 
  handleFirestoreError, 
  OperationType 
} from './firebase';
import { 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy, 
  getDocs,
  Timestamp,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';

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
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "發生了預期外的錯誤。";
      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error) errorMessage = `資料庫錯誤: ${parsed.error}`;
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center">
            <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={32} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">糟糕！出錯了</h2>
            <p className="text-slate-600 mb-6">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
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

// --- 資料設定 ---
const VENUES = [
  '2F主堂', '飛鷹堂', '馬可餐廳', '方舟小棧', '豐盛教室', 
  '副堂', '3F幼幼班', '3F會議室', '3F大空間', '4F'
];

const CHURCH_WIDE_VENUE = '全教會';

type BookingType = 'standard' | 'sunday-service' | 'special-service';

// 針對不同場地設定專屬顏色
const VENUE_COLORS: Record<string, string> = {
  '2F主堂': 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-300',
  '飛鷹堂': 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300',
  '馬可餐廳': 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300',
  '方舟小棧': 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 hover:border-amber-300',
  '豐盛教室': 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700 hover:bg-fuchsia-100 hover:border-fuchsia-300',
  '副堂': 'bg-cyan-50 border-cyan-200 text-cyan-700 hover:bg-cyan-100 hover:border-cyan-300',
  '3F幼幼班': 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100 hover:border-rose-300',
  '3F會議室': 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100 hover:border-teal-300',
  '3F大空間': 'bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100 hover:border-violet-300',
  '4F': 'bg-orange-50 border-orange-200 text-orange-700 hover:bg-orange-100 hover:border-orange-300'
};

const VENUE_DOTS: Record<string, string> = {
  '2F主堂': 'bg-blue-500',
  '飛鷹堂': 'bg-indigo-500',
  '馬可餐廳': 'bg-emerald-500',
  '方舟小棧': 'bg-amber-500',
  '豐盛教室': 'bg-fuchsia-500',
  '副堂': 'bg-cyan-500',
  '3F幼幼班': 'bg-rose-500',
  '3F會議室': 'bg-teal-500',
  '3F大空間': 'bg-violet-500',
  '4F': 'bg-orange-500'
};

// 取得場地顏色標籤，若無則返回預設灰色
const getVenueColor = (venue: string) => VENUE_COLORS[venue] || 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100';

const PURPOSE_PRESETS = [
  '小組聚會', '主日敬拜團', '各部開會', '個人安靜', '場地維護'
];

const CHURCH_WIDE_PURPOSE_PRESETS = [
  '主日聚會', '特別聚會', '聯合聚會', '培靈會', '佈道會'
];

const BOOKING_TYPE_LABELS: Record<BookingType, string> = {
  standard: '一般場地借用',
  'sunday-service': '主日聚會',
  'special-service': '特別聚會'
};

const CHURCH_WIDE_TYPE_BADGES: Record<Exclude<BookingType, 'standard'>, string> = {
  'sunday-service': '主日聚會',
  'special-service': '特別聚會'
};

const CHURCH_WIDE_TYPE_DEFAULT_PURPOSE: Record<BookingType, string> = {
  standard: '',
  'sunday-service': '主日聚會',
  'special-service': '特別聚會'
};

const ADMIN_PASSWORD = '04852591';
const ADMIN_SESSION_KEY = 'venue-admin-authenticated';

// 取得今天的日期字串 YYYY-MM-DD
const getTodayStr = () => {
  const today = new Date();
  const offset = today.getTimezoneOffset();
  const localToday = new Date(today.getTime() - (offset*60*1000));
  return localToday.toISOString().split('T')[0];
};

interface Booking {
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
  createdAt?: any;
  groupId?: string;
  repeat?: RepeatType;
  repeatUntil?: string;
  repeatForever?: boolean;
}

type RepeatType = 'none' | 'daily' | 'weekly' | 'biweekly';

interface BookingFormData {
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

const formatDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

const parseDateStr = (dateStr: string) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const getNextRepeatDate = (dateStr: string, repeatType: RepeatType) => {
  const d = parseDateStr(dateStr);
  if (repeatType === 'daily') d.setDate(d.getDate() + 1);
  else if (repeatType === 'weekly') d.setDate(d.getDate() + 7);
  else if (repeatType === 'biweekly') d.setDate(d.getDate() + 14);
  return formatDateStr(d);
};

const addYearsToDateStr = (dateStr: string, years: number) => {
  const d = parseDateStr(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return formatDateStr(d);
};

const isTimeOverlap = (startA: string, endA: string, startB: string, endB: string) => {
  return (startA < endB) && (endA > startB);
};

const isChurchWideBookingType = (bookingType?: BookingType) => (
  bookingType === 'sunday-service' || bookingType === 'special-service'
);

const getBookingType = (booking: Pick<Booking, 'bookingType'>): BookingType => booking.bookingType || 'standard';

const isChurchWideBooking = (booking: Pick<Booking, 'bookingType'>) => isChurchWideBookingType(getBookingType(booking));

const getBookingTypeLabel = (bookingType?: BookingType) => BOOKING_TYPE_LABELS[bookingType || 'standard'];

const getBookingVenueLabel = (booking: Pick<Booking, 'bookingType' | 'venue'>) => (
  isChurchWideBooking(booking) ? CHURCH_WIDE_VENUE : booking.venue
);

const getBookingCardClasses = (booking: Pick<Booking, 'bookingType' | 'venue'>) => (
  isChurchWideBooking(booking)
    ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100 hover:border-rose-300'
    : getVenueColor(booking.venue)
);

const getBookingDotClass = (booking: Pick<Booking, 'bookingType' | 'venue'>) => (
  isChurchWideBooking(booking)
    ? 'bg-rose-500'
    : (VENUE_DOTS[booking.venue] || 'bg-slate-400')
);

const compareBookingsForDisplay = (a: Pick<Booking, 'date' | 'startTime' | 'bookingType'>, b: Pick<Booking, 'date' | 'startTime' | 'bookingType'>) => {
  if (a.date !== b.date) return a.date.localeCompare(b.date);
  if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
  if (isChurchWideBooking(a) !== isChurchWideBooking(b)) return isChurchWideBooking(a) ? -1 : 1;
  return 0;
};

const getPurposePresetsByType = (bookingType: BookingType) => (
  isChurchWideBookingType(bookingType) ? CHURCH_WIDE_PURPOSE_PRESETS : PURPOSE_PRESETS
);

type ConflictCandidate = Pick<Booking, 'date' | 'startTime' | 'endTime' | 'venue' | 'bookingType'>;

const getConflictingBookings = (
  bookingList: Booking[],
  candidate: ConflictCandidate,
  excludeId: string | null,
  ignoredIds: Set<string> = new Set()
) => {
  const candidateIsChurchWide = isChurchWideBookingType(candidate.bookingType);

  return bookingList.filter((booking) => {
    if (booking.id === excludeId) return false;
    if (ignoredIds.has(booking.id)) return false;
    if (booking.date !== candidate.date) return false;
    if (!isTimeOverlap(candidate.startTime, candidate.endTime, booking.startTime, booking.endTime)) return false;

    if (candidateIsChurchWide || isChurchWideBooking(booking)) return true;
    return booking.venue === candidate.venue;
  });
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1';
    } catch (e) {
      return false;
    }
  });
  const [activeTab, setActiveTab] = useState<'dashboard' | 'calendar'>('calendar');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [seriesConfirmModal, setSeriesConfirmModal] = useState<{
    isOpen: boolean;
    action: 'edit' | 'delete' | null;
    booking: Booking | null;
  }>({ isOpen: false, action: null, booking: null });
  const [currentDate, setCurrentDate] = useState(new Date());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedDateStr, setSelectedDateStr] = useState(getTodayStr());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // --- 防止 Modal 開啟時背景滾動 ---
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';
    } else {
      document.body.style.overflow = 'unset';
      document.body.style.overscrollBehavior = 'auto';
    }
    return () => {
      document.body.style.overflow = 'unset';
      document.body.style.overscrollBehavior = 'auto';
    };
  }, [isModalOpen]);

  // --- Firebase Firestore Real-time Sync ---
  useEffect(() => {
    const q = query(collection(db, 'bookings'), orderBy('date', 'asc'), orderBy('startTime', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bks: Booking[] = [];
      snapshot.forEach((bookingDoc) => {
        const data = bookingDoc.data() as Omit<Booking, 'id'>;
        bks.push({ ...data, id: bookingDoc.id });
      });
      setBookings(bks);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'bookings');
    });

    return () => unsubscribe();
  }, []);

  // --- 提示訊息 Toast ---
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' });
  
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 2000);
  };

  const fetchAllBookings = async (): Promise<Booking[]> => {
    const snapshot = await getDocs(collection(db, 'bookings'));
    const allBookings: Booking[] = [];
    snapshot.forEach((bookingDoc) => {
      const data = bookingDoc.data() as Omit<Booking, 'id'>;
      allBookings.push({ ...data, id: bookingDoc.id });
    });
    return allBookings;
  };

  const toggleAdminAuth = () => {
    if (isAdminAuthenticated) {
      setIsAdminAuthenticated(false);
      try {
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
      } catch (e) {
        // ignore
      }
      showToast('已登出管理模式');
      return;
    }

    const input = window.prompt('請輸入管理員密碼');
    if (input === null) return;

    if (input === ADMIN_PASSWORD) {
      setIsAdminAuthenticated(true);
      try {
        sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
      } catch (e) {
        // ignore
      }
      showToast('管理模式已啟用');
    } else {
      showToast('管理員密碼錯誤', 'error');
    }
  };

  // --- 清空所有預約 (管理員功能) ---
  const clearAllBookings = async () => {
    if (!window.confirm('確定要清空所有預約嗎？此操作無法復原！')) return;
    
    try {
      setIsClearing(true);
      const snapshot = await getDocs(collection(db, 'bookings'));
      const docs = snapshot.docs;
      
      if (docs.length === 0) {
        showToast('目前沒有任何預約可供清空。', 'error');
        return;
      }

      showToast(`正在清空 ${docs.length} 筆預約...`, 'success');
      
      // 分批刪除，每批最多 500 筆
      const batchSize = 500;
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = docs.slice(i, i + batchSize);
        chunk.forEach(d => {
          batch.delete(d.ref);
        });
        await batch.commit();
      }
      
      showToast('已成功清空所有預約！', 'success');
    } catch (error) {
      showToast('清空失敗，請稍後再試！', 'error');
      console.error(error);
    } finally {
      setIsClearing(false);
    }
  };

  // --- 月視圖場地篩選 ---
  const [selectedVenues, setSelectedVenues] = useState<string[]>(VENUES);
  
  const toggleVenueFilter = (venue: string) => {
    setSelectedVenues(prev => {
      // 如果目前是全選狀態，點擊單一場地則變成「單選」
      if (prev.length === VENUES.length) {
        return [venue];
      }
      // 如果目前只有單選該場地，再次點擊則變成「全選」（重置）
      if (prev.length === 1 && prev[0] === venue) {
        return VENUES;
      }
      // 否則正常切換
      return prev.includes(venue) ? prev.filter(v => v !== venue) : [...prev, venue];
    });
  };

  // --- 複製 / 貼上功能 ---
  const [clipboardBooking, setClipboardBooking] = useState<Booking | null>(null);
  const [showClipboardHint, setShowClipboardHint] = useState(false);

  const handleCopy = (booking: Booking) => {
    setClipboardBooking(booking);
    setShowClipboardHint(true);
    showToast(`已複製「${getBookingVenueLabel(booking)} - ${booking.purpose}」，請點擊日期貼上`, 'success');
    
    // 1.5 秒後自動隱藏下方黑色提示
    setTimeout(() => setShowClipboardHint(false), 1500);
  };

  const handlePaste = async (dateStr: string) => {
    if (!clipboardBooking) return;
    
    // 檢查是否為過去的時間
    const todayStr = getTodayStr();
    if (dateStr < todayStr) {
      showToast('無法預約過去的日期！', 'error');
      return;
    }
    if (dateStr === todayStr) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      if (clipboardBooking.startTime < currentTime) {
        showToast('無法預約過去的時間！', 'error');
        return;
      }
    }

    try {
      const liveBookings = await fetchAllBookings();
      const conflicts = getConflictingBookings(liveBookings, {
        bookingType: getBookingType(clipboardBooking),
        venue: clipboardBooking.venue,
        date: dateStr,
        startTime: clipboardBooking.startTime,
        endTime: clipboardBooking.endTime
      }, null);

      if (conflicts.length > 0) {
        const churchWideConflict = conflicts.find(isChurchWideBooking);
        showToast(
          churchWideConflict
            ? `貼上失敗：${dateStr} 有全教會聚會，該時段全空間暫停借用！`
            : `貼上失敗：${dateStr} 的時段已有衝突！`,
          'error'
        );
        return;
      }

      const { id, groupId, ...data } = clipboardBooking;
      await addDoc(collection(db, 'bookings'), {
        ...data,
        date: dateStr,
        groupId: null, // 貼上時視為獨立預約，不繼承原本的群組 ID
        uid: isAdminAuthenticated ? 'admin-password' : 'anonymous',
        authorName: isAdminAuthenticated ? '管理員' : '訪客',
        createdAt: serverTimestamp()
      });
      showToast(`成功貼上至 ${dateStr}`, 'success');
    } catch (error) {
      showToast('貼上失敗，請稍後再試！', 'error');
      try {
        handleFirestoreError(error, OperationType.CREATE, 'bookings');
      } catch (e) {
        // ignore
      }
    }
  };

  // --- 狀態與月曆邏輯 ---
  const getNextValidTime = (dateStr: string) => {
    const todayStr = getTodayStr();
    if (dateStr === todayStr) {
      const now = new Date();
      let nextHour = now.getHours() + 1;
      if (nextHour >= 24) return '23:00';
      return `${nextHour.toString().padStart(2, '0')}:00`;
    }
    return '10:00';
  };

  const [formData, setFormData] = useState<BookingFormData>({
    bookingType: 'standard',
    venue: VENUES[0],
    date: getTodayStr(),
    startTime: '10:00',
    endTime: '12:00',
    borrower: '',
    purpose: '',
    repeat: 'none',
    repeatUntil: getTodayStr(),
    repeatForever: false
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const target = e.target;
    const name = target.name;
    const value = target.type === 'checkbox' ? (target as HTMLInputElement).checked : target.value;
    setFormData(prev => {
      const next = { ...prev, [name]: value } as BookingFormData;
      if (name === 'bookingType') {
        const nextType = value as BookingType;
        const previousDefaultPurpose = CHURCH_WIDE_TYPE_DEFAULT_PURPOSE[prev.bookingType];
        const nextDefaultPurpose = CHURCH_WIDE_TYPE_DEFAULT_PURPOSE[nextType];

        if (isChurchWideBookingType(nextType)) {
          next.venue = CHURCH_WIDE_VENUE;
        } else if (prev.venue === CHURCH_WIDE_VENUE) {
          next.venue = selectedVenues.length === 1 ? selectedVenues[0] : VENUES[0];
        }

        if (!prev.purpose || prev.purpose === previousDefaultPurpose) {
          next.purpose = nextDefaultPurpose;
        }
      }
      if (name === 'date' && next.repeatUntil < String(value)) {
        next.repeatUntil = String(value);
      }
      if (name === 'repeat' && value === 'none') {
        next.repeatForever = false;
        next.repeatUntil = next.date;
      }
      return next;
    });
  };

  const handlePresetClick = (preset: string) => {
    setFormData(prev => ({ ...prev, purpose: preset }));
  };

  useEffect(() => {
    if (editingId) return; // Do not auto-adjust time when editing an existing booking
    const todayStr = getTodayStr();
    if (formData.date === todayStr) {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      if (formData.startTime < currentTime) {
        const nextStart = getNextValidTime(todayStr);
        let endHour = parseInt(nextStart.split(':')[0]) + 2;
        if (endHour >= 24) endHour = 23;
        const nextEnd = `${endHour.toString().padStart(2, '0')}:00`;
        setFormData(prev => ({ ...prev, startTime: nextStart, endTime: nextEnd }));
      }
    }
  }, [formData.date, editingId]);

  const openBookingModal = (venueOrBooking?: string | Booking, isEditing = false, specificDate: string | null = null) => {
    if (specificDate) setSelectedDateStr(specificDate);
    
    if (isEditing && typeof venueOrBooking === 'object') {
      const sameSeriesBookings = venueOrBooking.groupId
        ? bookings
            .filter(b => b.groupId === venueOrBooking.groupId)
            .sort((a, b) => {
              if (a.date !== b.date) return a.date.localeCompare(b.date);
              return a.startTime.localeCompare(b.startTime);
            })
        : [venueOrBooking];

      let inferredRepeat: RepeatType = venueOrBooking.repeat || 'none';
      if (inferredRepeat === 'none' && sameSeriesBookings.length >= 2) {
        const first = parseDateStr(sameSeriesBookings[0].date);
        const second = parseDateStr(sameSeriesBookings[1].date);
        const diffDays = Math.round((second.getTime() - first.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) inferredRepeat = 'daily';
        else if (diffDays === 7) inferredRepeat = 'weekly';
        else if (diffDays === 14) inferredRepeat = 'biweekly';
      }

      const seriesLastDate = sameSeriesBookings.reduce(
        (latest, b) => (b.date > latest ? b.date : latest),
        venueOrBooking.date
      );
      const inferredRepeatUntil = inferredRepeat === 'none'
        ? venueOrBooking.date
        : (venueOrBooking.repeatUntil && venueOrBooking.repeatUntil >= venueOrBooking.date
          ? (venueOrBooking.repeatUntil > seriesLastDate ? venueOrBooking.repeatUntil : seriesLastDate)
          : seriesLastDate);

      setFormData({
        bookingType: getBookingType(venueOrBooking),
        venue: venueOrBooking.venue,
        date: venueOrBooking.date,
        startTime: venueOrBooking.startTime,
        endTime: venueOrBooking.endTime,
        borrower: venueOrBooking.borrower,
        purpose: venueOrBooking.purpose,
        repeat: inferredRepeat,
        repeatUntil: inferredRepeatUntil,
        repeatForever: false
      });
      setEditingId(venueOrBooking.id);
    } else {
      const defaultDate = specificDate || getTodayStr();
      const defaultStart = getNextValidTime(defaultDate);
      let endHour = parseInt(defaultStart.split(':')[0]) + 2;
      if (endHour >= 24) endHour = 23;
      const defaultEnd = `${endHour.toString().padStart(2, '0')}:00`;

      const defaultVenue = selectedVenues.length === 1 ? selectedVenues[0] : VENUES[0];

      setFormData({
        bookingType: 'standard',
        venue: typeof venueOrBooking === 'string' ? venueOrBooking : defaultVenue,
        date: defaultDate,
        startTime: defaultStart,
        endTime: defaultEnd,
        borrower: '',
        purpose: '',
        repeat: 'none',
        repeatUntil: defaultDate,
        repeatForever: false
      });
      setEditingId(null);
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.borrower || !formData.purpose) return;
    
    const originalBooking = editingId ? bookings.find(b => b.id === editingId) : null;
    const isTimeChanged = !originalBooking || originalBooking.date !== formData.date || originalBooking.startTime !== formData.startTime;

    // 時間驗證 (僅在新增或修改時間時檢查)
    if (isTimeChanged) {
      const todayStr = getTodayStr();
      if (formData.date < todayStr) {
        showToast('無法預約過去的日期！', 'error');
        return;
      }
      if (formData.date === todayStr) {
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        if (formData.startTime < currentTime) {
          showToast('無法預約過去的時間！', 'error');
          return;
        }
      }
    }

    if (formData.startTime >= formData.endTime) {
      showToast('結束時間必須晚於開始時間！', 'error');
      return;
    }

    if (formData.repeat !== 'none' && !formData.repeatForever && formData.repeatUntil < formData.date) {
      showToast('重複結束日期不能早於主預約日期！', 'error');
      return;
    }
    
    if (originalBooking?.groupId) {
      setSeriesConfirmModal({ isOpen: true, action: 'edit', booking: originalBooking });
      return;
    }
    
    await executeSubmit(false);
  };

  const executeSubmit = async (applyToFuture: boolean) => {
    try {
      setIsSubmitting(true);
      const batch = writeBatch(db);
      let baseDateStr = formData.date;
      const originalBooking = editingId ? bookings.find(b => b.id === editingId) : null;
      
      // 1. 先從 Firestore 重新取得最新資料，避免使用過舊的本地狀態
      const liveBookings = await fetchAllBookings();
      const deletedFutureIds = new Set<string>();
      if (applyToFuture && originalBooking?.groupId) {
        bookings
          .filter(b => b.groupId === originalBooking.groupId && b.date >= originalBooking.date && b.id !== editingId)
          .forEach(b => deletedFutureIds.add(b.id));
      }
      
      const checkConflictOptimized = (date: string, start: string, end: string, excludeId: string | null, ignoredIds: Set<string> = new Set()) => (
        getConflictingBookings(liveBookings, {
          bookingType: formData.bookingType,
          venue: formData.venue,
          date,
          startTime: start,
          endTime: end
        }, excludeId, ignoredIds)
      );

      // 檢查主預約是否有衝突
      const mainConflicts = checkConflictOptimized(
        formData.date, 
        formData.startTime, 
        formData.endTime, 
        editingId, 
        deletedFutureIds
      );
      if (mainConflicts.length > 0) {
        const churchWideConflict = mainConflicts.find(isChurchWideBooking);
        showToast(
          churchWideConflict
            ? `預約失敗：${formData.date} 有全教會聚會，該時段全空間暫停借用！`
            : `預約失敗：${formData.date} 的時段已有衝突！`,
          'error'
        );
        setIsSubmitting(false);
        return;
      }

      let currentGroupId = originalBooking?.groupId;
      if (!currentGroupId && formData.repeat !== 'none') {
        currentGroupId = Math.random().toString(36).substring(2, 15);
      }

      // 2. 準備重複預約資料並檢查衝突
      const newBookingsData: Omit<Booking, 'id'>[] = [];
      if (formData.repeat !== 'none' && (!editingId || applyToFuture || !originalBooking?.groupId)) {
        let currDateStr = getNextRepeatDate(baseDateStr, formData.repeat);
        const endDateStr = formData.repeatForever 
          ? addYearsToDateStr(baseDateStr, 1)
          : formData.repeatUntil;
          
        let safetyCounter = 0; 

        while (currDateStr <= endDateStr && safetyCounter < 370) {
          const conflicts = checkConflictOptimized(
            currDateStr, 
            formData.startTime, 
            formData.endTime, 
            null, 
            deletedFutureIds
          );
          if (conflicts.length > 0) {
            const churchWideConflict = conflicts.find(isChurchWideBooking);
            showToast(
              churchWideConflict
                ? `預約失敗：重複日程中的 ${currDateStr} 有全教會聚會，該時段全空間暫停借用！`
                : `預約失敗：重複日程中的 ${currDateStr} 已有衝突！`,
              'error'
            );
            setIsSubmitting(false);
            return;
          }

          newBookingsData.push({ 
            ...formData, 
            date: currDateStr,
            groupId: currentGroupId,
            uid: isAdminAuthenticated ? 'admin-password' : 'anonymous',
            authorName: isAdminAuthenticated ? '管理員' : '訪客',
            createdAt: serverTimestamp()
          });
          currDateStr = getNextRepeatDate(currDateStr, formData.repeat);
          safetyCounter++;
        }
      }

      // 3. 執行寫入操作 (使用 Batch)
      if (editingId) {
        if (applyToFuture && currentGroupId && originalBooking) {
          const futureBookings = bookings.filter(b => 
            b.groupId === currentGroupId && 
            b.date >= originalBooking.date && 
            b.id !== editingId
          );
          futureBookings.forEach(b => {
            batch.delete(doc(db, 'bookings', b.id));
          });
        }
        
        batch.update(doc(db, 'bookings', editingId), {
          ...formData,
          groupId: (applyToFuture || !originalBooking?.groupId) ? (currentGroupId || null) : (originalBooking?.groupId || null),
          uid: isAdminAuthenticated ? 'admin-password' : 'anonymous',
          authorName: isAdminAuthenticated ? '管理員' : '訪客'
        });
      } else {
        const newDocRef = doc(collection(db, 'bookings'));
        batch.set(newDocRef, {
          ...formData,
          groupId: currentGroupId || null,
          uid: isAdminAuthenticated ? 'admin-password' : 'anonymous',
          authorName: isAdminAuthenticated ? '管理員' : '訪客',
          createdAt: serverTimestamp()
        });
      }

      // 加入重複預約到 Batch
      newBookingsData.forEach(data => {
        const newDocRef = doc(collection(db, 'bookings'));
        batch.set(newDocRef, data);
      });

      // 提交 Batch
      await batch.commit();

      if (newBookingsData.length > 0) {
        showToast(`已儲存並建立 ${newBookingsData.length} 筆重複預約！`, 'success');
      } else {
        showToast(editingId ? '更新預約成功！' : '新增預約成功！', 'success');
      }
      
      setIsModalOpen(false);
      setEditingId(null);
      setSeriesConfirmModal({ isOpen: false, action: null, booking: null });
    } catch (error) {
      showToast('儲存失敗，請稍後再試！', 'error');
      try {
        handleFirestoreError(error, editingId ? OperationType.UPDATE : OperationType.CREATE, 'bookings');
      } catch (e) {
        // ignore
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editingId) return;
    const originalBooking = bookings.find(b => b.id === editingId) || null;
    if (!originalBooking) {
      showToast('找不到要刪除的預約，請重新開啟後再試。', 'error');
      return;
    }
    if (originalBooking?.groupId) {
      setSeriesConfirmModal({ isOpen: true, action: 'delete', booking: originalBooking });
      return;
    }
    await executeDelete(false, originalBooking);
  };

  const executeDelete = async (applyToFuture: boolean, targetBooking: Booking | null = null) => {
    const originalBooking = targetBooking || (editingId ? bookings.find(b => b.id === editingId) || null : null);
    if (!originalBooking) {
      showToast('找不到要刪除的預約，請重新開啟後再試。', 'error');
      return;
    }

    const targetBookingId = originalBooking.id;
    try {
      setIsSubmitting(true);
      if (applyToFuture && originalBooking?.groupId) {
        const futureBookings = bookings.filter(b => 
          b.groupId === originalBooking.groupId && 
          b.date >= originalBooking.date
        );
        
        // 使用 Batch 刪除
        const batch = writeBatch(db);
        futureBookings.forEach(b => {
          batch.delete(doc(db, 'bookings', b.id));
        });
        await batch.commit();
      } else {
        await deleteDoc(doc(db, 'bookings', targetBookingId));
      }
      setIsModalOpen(false);
      setEditingId(null);
      setSeriesConfirmModal({ isOpen: false, action: null, booking: null });
      showToast('刪除預約成功！', 'success');
    } catch (error) {
      showToast('刪除失敗，請稍後再試！', 'error');
      try {
        handleFirestoreError(error, OperationType.DELETE, `bookings/${targetBookingId}`);
      } catch (e) {
        // ignore
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- 狀態與月曆邏輯 ---
  const getVenueNextSchedule = (venueName: string) => {
    const today = getTodayStr();
    const now = new Date();
    const currentTimeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

    // 1. 找出目前正在進行的
    const active = bookings.find(b => 
      (isChurchWideBooking(b) || b.venue === venueName) &&
      b.date === today && 
      b.startTime <= currentTimeStr && 
      b.endTime >= currentTimeStr
    );

    // 2. 找出下一個預約 (可能是今天稍後，也可能是未來某天)
    const futureBookings = bookings
      .filter(b => isChurchWideBooking(b) || b.venue === venueName)
      .filter(b => {
        if (b.date > today) return true;
        if (b.date === today && b.startTime > currentTimeStr) return true;
        return false;
      })
      .sort(compareBookingsForDisplay);

    const next = futureBookings[0] || null;

    return { active, next };
  };

  // 檢查是否有衝突
  const conflicts = getConflictingBookings(
    bookings,
    {
      bookingType: formData.bookingType,
      venue: formData.venue,
      date: formData.date,
      startTime: formData.startTime,
      endTime: formData.endTime
    },
    editingId
  );
  const isConflict = conflicts.length > 0;
  const hasChurchWideConflict = conflicts.some(isChurchWideBooking);

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const monthNames = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
  
  const mobileDetailsRef = useRef<HTMLDivElement>(null);

  const prevMonth = () => {
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    setCurrentDate(newDate);
    setSelectedDateStr(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}-01`);
  };
  
  const nextMonth = () => {
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    setCurrentDate(newDate);
    setSelectedDateStr(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}-01`);
  };

  // 在月視圖中，根據篩選器與時間排序回傳預約資料
  const getBookingsForDate = (day: number) => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return bookings
      .filter(b => b.date === dateStr && (isChurchWideBooking(b) || selectedVenues.includes(b.venue)))
      .sort(compareBookingsForDisplay);
  };

  const getChurchWideBookingsForDate = (dateStr: string) => (
    bookings
      .filter(b => b.date === dateStr && isChurchWideBooking(b))
      .sort(compareBookingsForDisplay)
  );

  const todayChurchWideBookings = getChurchWideBookingsForDate(getTodayStr());
  const selectedDateBookings = bookings
    .filter(b => b.date === selectedDateStr && (isChurchWideBooking(b) || selectedVenues.includes(b.venue)))
    .sort(compareBookingsForDisplay);
  const selectedDateChurchWideBookings = selectedDateBookings.filter(isChurchWideBooking);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-blue-100 pb-12 relative overflow-x-hidden">
      
      {/* --- Toast 提示訊息 --- */}
      <AnimatePresence>
        {toast.show && (
          <motion.div 
            initial={{ opacity: 0, y: -20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -20, x: "-50%" }}
            className="fixed top-20 left-1/2 z-50"
          >
            <div className={`px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium text-white
              ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
              <CheckCircle2 size={16} />
              {toast.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- 剪貼簿狀態提示 --- */}
      <AnimatePresence>
        {showClipboardHint && clipboardBooking && (
          <motion.div 
            initial={{ opacity: 0, y: 20, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: 20, x: "-50%" }}
            className="fixed bottom-24 left-1/2 z-40 bg-slate-800 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-3"
          >
            <Copy size={16} className="text-blue-400" />
            <span className="text-sm">已複製：{getBookingVenueLabel(clipboardBooking)} ({clipboardBooking.startTime})</span>
            <button 
              onClick={() => setShowClipboardHint(false)}
              className="ml-2 p-1 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- 頂部導航列 --- */}
      <header className="bg-white sticky top-0 z-10 border-b border-slate-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center min-w-0 gap-2">
            <h1 className="text-base sm:text-xl font-bold tracking-tight text-slate-900 truncate">嘉義活水貴格會場地借用</h1>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            <button 
              onClick={toggleAdminAuth}
              className={`p-2 rounded-xl transition-all ${isAdminAuthenticated ? 'text-rose-600 bg-rose-50 hover:bg-rose-100' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'}`}
              title={isAdminAuthenticated ? '登出管理模式' : '管理員登入'}
            >
              {isAdminAuthenticated ? <LogOut size={18} /> : <LogIn size={18} />}
            </button>
            {isAdminAuthenticated && (
              <button 
                onClick={clearAllBookings}
                disabled={isClearing}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-600 hover:bg-rose-100 transition-all border border-rose-100 disabled:opacity-50"
              >
                <Trash2 size={14} />
                {isClearing ? '清空中...' : '清空全部'}
              </button>
            )}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
              <button 
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 ${activeTab === 'dashboard' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <LayoutDashboard size={14} className="sm:w-4 sm:h-4 shrink-0" />
                <span className="hidden xs:inline">今日狀態</span>
              </button>
              <button 
                onClick={() => setActiveTab('calendar')}
                className={`flex items-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all duration-200 ${activeTab === 'calendar' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <CalendarIcon size={14} className="sm:w-4 sm:h-4 shrink-0" />
                <span className="hidden xs:inline">月曆</span>
              </button>
            </div>

            {/* Logo 移至右上角 */}
            <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 bg-white rounded-lg overflow-hidden flex items-center justify-center ml-1 sm:ml-2">
              <img 
                src="/logo.svg" 
                alt="Church Logo"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).parentElement!.classList.add('bg-blue-600');
                  (e.target as HTMLImageElement).parentElement!.innerHTML = '<span class="text-white text-xs font-bold">活水</span>';
                }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* --- 主要內容區 --- */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        
        {/* Dashboard 視圖 */}
        {activeTab === 'dashboard' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="animate-in fade-in duration-300"
          >
            <div className="mb-6 flex items-end justify-between">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">場地使用狀態</h2>
                <p className="text-slate-500 text-xs sm:text-sm">即時與下一個預約情形</p>
              </div>
            </div>

            {todayChurchWideBookings.length > 0 && (
              <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={18} />
                  <div className="min-w-0">
                    <p className="font-bold text-rose-900">今日有全教會聚會時段</p>
                    <p className="text-xs sm:text-sm text-rose-700 mt-1">遇到主日聚會或特別聚會時，所有空間同步停止借用。</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {todayChurchWideBookings.map((booking) => (
                        <div key={booking.id} className="rounded-xl border border-rose-200 bg-white/80 px-3 py-2 text-xs sm:text-sm text-rose-800">
                          <span className="font-bold">{CHURCH_WIDE_TYPE_BADGES[getBookingType(booking) as Exclude<BookingType, 'standard'>]}</span>
                          <span className="mx-2 text-rose-300">•</span>
                          <span>{booking.startTime} - {booking.endTime}</span>
                          <span className="mx-2 text-rose-300">•</span>
                          <span>{booking.borrower}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {VENUES.map(venue => {
                const { active, next } = getVenueNextSchedule(venue);
                const isOccupied = !!active;
                const isChurchWideActive = !!active && isChurchWideBooking(active);

                return (
                  <div key={venue} className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-100 shadow-sm hover:shadow-md transition-shadow relative flex flex-col h-full group">
                    <div className="flex justify-between items-start mb-4">
                      <button 
                        onClick={() => openBookingModal(venue)}
                        className="flex items-center gap-2 text-left group/title cursor-pointer min-w-0"
                        title={`點擊新增 ${venue} 的預約`}
                      >
                        <MapPin size={16} className="text-slate-400 group-hover/title:text-blue-600 transition-colors shrink-0" />
                        <h3 className="font-semibold text-base sm:text-lg text-slate-800 group-hover/title:text-blue-600 transition-colors truncate">{venue}</h3>
                        <div className="bg-blue-50 text-blue-600 rounded-md p-0.5 opacity-0 group-hover/title:opacity-100 transition-opacity -ml-1 shrink-0">
                          <Plus size={14} />
                        </div>
                      </button>
                      
                      <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium flex items-center gap-1 whitespace-nowrap shrink-0
                        ${isChurchWideActive ? 'bg-rose-50 text-rose-600 border border-rose-200/60' : isOccupied ? 'bg-amber-50 text-amber-600 border border-amber-200/50' : 'bg-emerald-50 text-emerald-600 border border-emerald-200/50'}`}>
                        <span className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full ${isChurchWideActive ? 'bg-rose-500 animate-pulse' : isOccupied ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></span>
                        {isChurchWideActive ? '聚會時段' : isOccupied ? '使用中' : '空閒'}
                      </span>
                    </div>

                    <div className="flex-1 flex flex-col gap-3">
                      {active ? (
                        <div className={`border rounded-xl p-3 text-sm relative group/edit transition-colors ${getBookingCardClasses(active)}`}>
                          <div className="flex items-center gap-2 font-medium mb-1.5">
                            <Clock size={14} className="opacity-70" />
                            <span>{active.startTime} - {active.endTime}</span>
                          </div>
                          {isChurchWideBooking(active) && (
                            <div className="mb-2 inline-flex rounded-full bg-white/80 px-2 py-1 text-[10px] font-bold text-rose-700">
                              {CHURCH_WIDE_TYPE_BADGES[getBookingType(active) as Exclude<BookingType, 'standard'>]} · 全教會聚會時段
                            </div>
                          )}
                          <div className="flex items-center gap-2 mb-1.5">
                            <Users size={14} className="opacity-70" />
                            <span className="font-medium">{active.borrower}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Info size={14} className="opacity-70" />
                            <span className="truncate opacity-90">{active.purpose}</span>
                          </div>
                          
                          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover/edit:opacity-100 transition-all">
                            <button 
                              onClick={() => handleCopy(active)}
                              className="p-1.5 bg-white rounded-lg shadow-sm text-slate-600 hover:text-blue-600"
                              title="複製此預約"
                            >
                              <Copy size={14} />
                            </button>
                            <button 
                              onClick={() => openBookingModal(active, true)}
                              className="p-1.5 bg-white rounded-lg shadow-sm text-slate-600 hover:text-blue-600"
                              title="編輯此預約"
                            >
                              <Edit2 size={14} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
                          <span className="text-slate-400 text-xs font-medium italic">目前無人使用</span>
                        </div>
                      )}

                      {next ? (
                        <div className="space-y-2 mt-1">
                          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                            下一個預約 <span className="h-px bg-slate-100 flex-1"></span>
                          </div>
                          <div className="bg-white border border-slate-100 rounded-lg p-2.5 text-sm flex items-center justify-between relative group/edit hover:border-blue-200 transition-colors">
                            <div className="min-w-0 flex-1">
                              <div className="text-slate-700 font-medium flex items-center gap-1.5">
                                <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">{next.date === getTodayStr() ? '今日' : next.date.split('-').slice(1).join('/')}</span>
                                <span>{next.startTime} - {next.endTime}</span>
                              </div>
                              <div className="text-slate-500 text-xs mt-0.5 truncate">
                                {isChurchWideBooking(next) ? `${CHURCH_WIDE_TYPE_BADGES[getBookingType(next) as Exclude<BookingType, 'standard'>]} · 全教會聚會時段` : getBookingVenueLabel(next)} · {next.borrower}
                              </div>
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover/edit:opacity-100 transition-all shrink-0 ml-2">
                              <button 
                                onClick={() => handleCopy(next)}
                                className="p-1.5 bg-slate-50 rounded-md text-slate-400 hover:text-blue-600"
                                title="複製"
                              >
                                <Copy size={14} />
                              </button>
                              <button 
                                onClick={() => openBookingModal(next, true)}
                                className="p-1.5 bg-slate-50 rounded-md text-slate-400 hover:text-blue-600"
                                title="編輯"
                              >
                                <Edit2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-1">
                          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2 mb-2">
                            下一個預約 <span className="h-px bg-slate-100 flex-1"></span>
                          </div>
                          <button 
                            onClick={() => openBookingModal(venue)}
                            className="w-full flex items-center justify-center py-3 border-2 border-dashed border-slate-100 rounded-xl hover:border-blue-400 hover:bg-blue-50/50 transition-colors group/empty"
                          >
                            <span className="text-slate-400 group-hover/empty:text-blue-600 text-xs font-medium transition-colors flex items-center gap-1">
                              <Plus size={14} /> 暫無預約，點擊新增
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Calendar 視圖 */}
        {activeTab === 'calendar' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.x > 100) prevMonth();
              else if (info.offset.x < -100) nextMonth();
            }}
            className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden p-2 sm:p-4 touch-pan-y"
          >
            
            {/* 月曆標頭與篩選器 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
                {currentDate.getFullYear()} 年 {monthNames[currentDate.getMonth()]}
              </h2>
              
              <div className="flex gap-2">
                <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <ChevronLeft size={20} className="text-slate-600" />
                </button>
                <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1.5 text-sm font-medium hover:bg-slate-100 rounded-lg transition-colors text-slate-600">
                  回到今天
                </button>
                <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <ChevronRight size={20} className="text-slate-600" />
                </button>
              </div>
            </div>

            {/* 場地過濾器 */}
            <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1.5 no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
              <div className="flex items-center gap-1 text-slate-400 text-[10px] sm:text-xs mr-1 shrink-0">
                <Filter size={10} className="sm:w-3 sm:h-3" />
                <span>篩選</span>
              </div>
              {VENUES.map(venue => {
                const isSelected = selectedVenues.includes(venue);
                const venueColorClass = VENUE_COLORS[venue].split(' ')[0]; 
                const venueTextColor = VENUE_COLORS[venue].split(' ').find(c => c.startsWith('text-'));

                return (
                  <button
                    key={venue}
                    onClick={() => toggleVenueFilter(venue)}
                    className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[9px] sm:text-[11px] font-medium whitespace-nowrap transition-all border shrink-0 ${
                      isSelected 
                        ? `${venueColorClass} ${venueTextColor} border-transparent shadow-sm` 
                        : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {venue}
                  </button>
                );
              })}
              <div className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[9px] sm:text-[11px] font-medium whitespace-nowrap border border-rose-200 bg-rose-50 text-rose-700 shrink-0">
                全教會聚會時段會自動顯示
              </div>
            </div>

            {/* 月曆網格 - 簡約點點顯示模式 */}
            <div className="overflow-hidden border-b border-slate-100 sm:border-none">
              <div className="grid grid-cols-7 gap-px bg-slate-100 rounded-xl overflow-hidden border border-slate-100">
                {['日', '一', '二', '三', '四', '五', '六'].map(day => (
                  <div key={day} className="bg-slate-50 py-1 sm:py-1.5 text-center text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {day}
                  </div>
                ))}
                
                {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                  <div key={`empty-${i}`} className="bg-white min-h-[50px] sm:min-h-[80px] p-1 opacity-30"></div>
                ))}
                
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const dayBookings = getBookingsForDate(day);
                  const dayChurchWideBookings = dayBookings.filter(isChurchWideBooking);
                  const hasChurchWideBooking = dayChurchWideBookings.length > 0;
                  const isToday = getTodayStr() === dateStr;
                  const isSelected = selectedDateStr === dateStr;
                  
                  return (
                    <div 
                      key={day} 
                      onClick={() => {
                        setSelectedDateStr(dateStr);
                        if (clipboardBooking) {
                          void handlePaste(dateStr);
                        }
                        if (window.innerWidth < 640) {
                          setTimeout(() => {
                            mobileDetailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }, 100);
                        }
                      }}
                      className={`bg-white min-h-[40px] sm:min-h-[60px] p-1 sm:p-1.5 border-t border-slate-100 transition-all hover:bg-blue-50/20 cursor-pointer group/day relative flex flex-col items-center justify-start ${hasChurchWideBooking ? 'bg-rose-50/40' : ''} ${isToday ? 'bg-blue-50/30' : ''} ${isSelected ? 'ring-2 ring-inset ring-blue-500/50 bg-blue-50/10' : ''}`}
                    >
                      <span className={`inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full text-[10px] sm:text-xs font-medium mb-0.5 sm:mb-1 transition-colors ${isToday ? 'bg-blue-600 text-white shadow-sm' : isSelected ? 'bg-blue-100 text-blue-700' : 'text-slate-700 group-hover/day:text-blue-600'}`}>
                        {day}
                      </span>
                      {hasChurchWideBooking && (
                        <div className="mb-0.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[7px] sm:text-[9px] font-bold text-rose-700 leading-none">
                          保留
                        </div>
                      )}
                      
                      {/* 預約點點指示器 */}
                      <div className="flex flex-wrap justify-center gap-0.5 sm:gap-1 max-w-full px-0.5">
                        {dayBookings.slice(0, 8).map((b, idx) => (
                          <div 
                            key={idx} 
                            className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full shadow-sm ${getBookingDotClass(b)}`}
                            title={`${b.startTime} ${getBookingVenueLabel(b)}`}
                          />
                        ))}
                        {dayBookings.length > 8 && (
                          <div className="text-[7px] sm:text-[9px] text-slate-400 font-bold leading-none">
                            +{dayBookings.length - 8}
                          </div>
                        )}
                      </div>

                      {/* 桌面版懸停提示 */}
                      {dayBookings.length > 0 && (
                        <div className="hidden sm:group-hover/day:block absolute z-30 left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 p-2 bg-slate-800 text-white rounded-lg shadow-xl text-[10px] pointer-events-none">
                          <p className="font-bold border-b border-slate-700 pb-1 mb-1">{dateStr}</p>
                          {dayBookings.slice(0, 3).map((b, idx) => (
                            <p key={idx} className="truncate opacity-90">• {b.startTime} {getBookingVenueLabel(b)}{isChurchWideBooking(b) ? ` · ${getBookingTypeLabel(getBookingType(b))}` : ''}</p>
                          ))}
                          {dayBookings.length > 3 && <p className="opacity-60 italic">還有 {dayBookings.length - 3} 筆...</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 日期詳情列表 - 桌面與手機版共用 */}
            <div ref={mobileDetailsRef} className="mt-6 border-t border-slate-100 pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                    <CalendarIcon size={16} />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-800">
                      {selectedDateStr} 預約詳情
                    </h3>
                  </div>
                </div>
                <button 
                  onClick={() => openBookingModal(undefined, false, selectedDateStr)}
                  className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-white bg-blue-600 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl hover:bg-blue-700 shadow-sm shadow-blue-600/20 active:scale-95 transition-all"
                >
                  <Plus size={14} /> 新增預約
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {selectedDateChurchWideBookings.length > 0 && (
                  <div className="col-span-full rounded-2xl border border-rose-200 bg-rose-50 p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={18} />
                      <div>
                        <p className="font-bold text-rose-900">此日期有全教會聚會時段</p>
                        <p className="text-sm text-rose-700 mt-1">聚會時段內所有場地都不可借用，月曆會固定顯示這些事件。</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedDateChurchWideBookings.map((booking) => (
                            <div key={booking.id} className="rounded-xl border border-rose-200 bg-white/80 px-3 py-2 text-xs sm:text-sm text-rose-800">
                              <span className="font-bold">{CHURCH_WIDE_TYPE_BADGES[getBookingType(booking) as Exclude<BookingType, 'standard'>]}</span>
                              <span className="mx-2 text-rose-300">•</span>
                              <span>{booking.startTime} - {booking.endTime}</span>
                              <span className="mx-2 text-rose-300">•</span>
                              <span>{booking.borrower}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {selectedDateBookings.map((b, idx) => (
                    <div 
                      key={`${b.id}-${idx}`} 
                      onClick={() => openBookingModal(b, true)}
                      className={`p-4 rounded-2xl border shadow-sm flex flex-col gap-3 group cursor-pointer hover:shadow-md active:scale-[0.98] transition-all relative overflow-hidden ${getBookingCardClasses(b)}`}
                    >
                      <div className="flex justify-between items-start relative z-10">
                        <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
                          <Clock size={16} className="opacity-70" />
                          <span>{b.startTime} - {b.endTime}</span>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={(e) => {e.stopPropagation(); handleCopy(b);}} className="p-1.5 bg-white/60 hover:bg-white rounded-lg transition-colors"><Copy size={14}/></button>
                          <button onClick={(e) => {e.stopPropagation(); openBookingModal(b, true);}} className="p-1.5 bg-white/60 hover:bg-white rounded-lg transition-colors"><Edit2 size={14}/></button>
                        </div>
                      </div>
                      {isChurchWideBooking(b) && (
                        <div className="relative z-10 inline-flex w-fit rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-bold text-rose-700">
                          {CHURCH_WIDE_TYPE_BADGES[getBookingType(b) as Exclude<BookingType, 'standard'>]} · 全教會聚會時段
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-700 relative z-10">
                        <MapPin size={16} className="opacity-70" />
                        <span>{getBookingVenueLabel(b)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600 relative z-10">
                        <Users size={16} className="opacity-70" />
                        <span>{b.borrower}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1 pl-6 border-l-2 border-slate-300 italic relative z-10">
                        {b.purpose}
                      </div>
                      
                      {/* 背景裝飾 */}
                      <div className={`absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity`}>
                        <CalendarIcon size={80} />
                      </div>
                    </div>
                  ))}
                
                {selectedDateBookings.length === 0 && (
                  <div className="col-span-full py-16 text-center border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/50">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                      <CalendarIcon size={24} className="text-slate-300" />
                    </div>
                    <p className="text-slate-400 font-medium">當日尚無預約</p>
                    <button 
                      onClick={() => openBookingModal(undefined, false, selectedDateStr)}
                      className="mt-4 text-blue-600 text-sm font-bold hover:text-blue-700 transition-colors"
                    >
                      立即為 {selectedDateStr} 新增預約
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

      </main>

      <button 
        onClick={() => openBookingModal()}
        className="fixed bottom-8 right-8 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center group z-30"
      >
        <Plus size={24} className="group-hover:rotate-90 transition-transform duration-300" />
      </button>

      {/* --- 預約表單 Modal --- */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[95vh]"
            >
              
              <div className="px-5 py-4 sm:px-6 sm:py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
                <h2 className="text-lg sm:text-xl font-bold text-slate-800 flex items-center gap-2">
                  <CalendarIcon className="text-blue-600" size={18} />
                  {editingId ? '編輯預約' : '新增預約'}
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 sm:p-6 overflow-y-auto overflow-x-hidden custom-scrollbar space-y-5 sm:space-y-6">
                
                <form id="booking-form" onSubmit={handleSubmit} className="space-y-5 sm:space-y-6 relative z-10 w-full">
                  
                  {!isSubmitting && isConflict && (
                    <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
                      <AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={18} />
                      <div className="text-xs sm:text-sm text-rose-800">
                        <p className="font-bold mb-1">時間衝突警告</p>
                        <p>{hasChurchWideConflict ? '此時段已有全教會聚會，所有空間都不可借用。' : '此時段該場地已有其他預約，請調整時間或場地。'}</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5 min-w-0">
                    <label className="text-xs sm:text-sm font-semibold text-slate-700">事件類型 <span className="text-red-500">*</span></label>
                    <select
                      name="bookingType"
                      value={formData.bookingType}
                      onChange={handleInputChange}
                      className="w-full min-w-0 px-4 py-2 sm:py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all outline-none text-sm"
                    >
                      <option value="standard">一般場地借用</option>
                      <option value="sunday-service">主日聚會（全教會聚會時段）</option>
                      <option value="special-service">特別聚會（全教會聚會時段）</option>
                    </select>
                  </div>

                  {isChurchWideBookingType(formData.bookingType) && (
                    <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50 text-amber-900">
                      <p className="font-bold text-sm">這是一筆全教會聚會時段</p>
                      <p className="text-xs sm:text-sm mt-1">建立後，該時段所有空間都會停止借用，月曆與今日狀態也會特別標示。</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5 min-w-0">
                      <label className="text-xs sm:text-sm font-semibold text-slate-700">借用人 / 單位 <span className="text-red-500">*</span></label>
                      <input 
                        type="text" 
                        name="borrower"
                        required
                        value={formData.borrower}
                        onChange={handleInputChange}
                        placeholder="例如: 敬拜團"
                        className="w-full min-w-0 px-4 py-2 sm:py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all outline-none text-sm"
                      />
                    </div>
                    <div className="space-y-1.5 min-w-0">
                      <label className="text-xs sm:text-sm font-semibold text-slate-700">日期 <span className="text-red-500">*</span></label>
                      <input 
                        type="date" 
                        name="date"
                        required
                        value={formData.date}
                        onChange={handleInputChange}
                        className="w-full min-w-0 min-h-[42px] sm:min-h-[44px] px-4 py-2 sm:py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all outline-none text-sm"
                      />
                    </div>
                  </div>

                  {/* 衝突提醒 */}
                  {!isSubmitting && isConflict && (
                    <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 text-red-600 animate-pulse">
                      <AlertCircle size={16} />
                      <span className="text-xs font-bold">{hasChurchWideConflict ? '注意：此時段已有全教會聚會，所有場地都會被鎖定！' : '注意：此時段場地已被預約，請確認是否衝突！'}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-blue-50/50 border border-blue-100 rounded-2xl">
                    <div className="space-y-1.5 min-w-0">
                      <label className="text-xs sm:text-sm font-semibold text-slate-700">重複設定</label>
                      <select 
                        name="repeat"
                        value={formData.repeat}
                        onChange={handleInputChange}
                        className="w-full min-w-0 px-4 py-2 sm:py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all outline-none text-sm"
                      >
                        <option value="none">不重複</option>
                        <option value="daily">每天重複</option>
                        <option value="weekly">每週重複</option>
                        <option value="biweekly">每兩週重複</option>
                      </select>
                    </div>
                    {formData.repeat !== 'none' && (
                      <div className="space-y-1.5 min-w-0 animate-in fade-in slide-in-from-left-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs sm:text-sm font-semibold text-slate-700">結束重複日期</label>
                          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                            <input 
                              type="checkbox" 
                              name="repeatForever"
                              checked={formData.repeatForever}
                              onChange={handleInputChange}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                            />
                            不結束 (建立一年份)
                          </label>
                        </div>
                        {!formData.repeatForever && (
                          <input 
                            type="date" 
                            name="repeatUntil"
                            required={!formData.repeatForever}
                            value={formData.repeatUntil}
                            min={formData.date}
                            onChange={handleInputChange}
                            className="w-full min-w-0 min-h-[42px] sm:min-h-[44px] px-4 py-2 sm:py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all outline-none text-sm"
                          />
                        )}
                      </div>
                    )}
                  </div>

                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
                    {isChurchWideBookingType(formData.bookingType) ? (
                      <div className="space-y-1.5 min-w-0">
                        <label className="text-xs sm:text-sm font-semibold text-slate-700">適用範圍</label>
                        <div className="w-full px-4 py-3 bg-white border border-rose-200 rounded-xl text-sm font-semibold text-rose-700">
                          {CHURCH_WIDE_VENUE}（所有場地同步停止借用）
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5 min-w-0">
                        <label className="text-xs sm:text-sm font-semibold text-slate-700">選擇場地 <span className="text-red-500">*</span></label>
                        <select 
                          name="venue"
                          value={formData.venue}
                          onChange={handleInputChange}
                          className="w-full min-w-0 px-4 py-2 sm:py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all outline-none appearance-none cursor-pointer text-sm"
                        >
                          {VENUES.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                      <div className="space-y-1.5 min-w-0">
                        <label className="text-xs sm:text-sm font-semibold text-slate-700">開始時間 <span className="text-red-500">*</span></label>
                        <input 
                          type="time" 
                          name="startTime"
                          required
                          value={formData.startTime}
                          onChange={handleInputChange}
                          className="w-full min-w-0 min-h-[42px] sm:min-h-[44px] px-3 sm:px-4 py-2 sm:py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all outline-none text-sm"
                        />
                      </div>
                      <div className="space-y-1.5 min-w-0">
                        <label className="text-xs sm:text-sm font-semibold text-slate-700">結束時間 <span className="text-red-500">*</span></label>
                        <input 
                          type="time" 
                          name="endTime"
                          required
                          value={formData.endTime}
                          onChange={handleInputChange}
                          className="w-full min-w-0 min-h-[42px] sm:min-h-[44px] px-3 sm:px-4 py-2 sm:py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all outline-none text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 min-w-0">
                    <label className="text-xs sm:text-sm font-semibold text-slate-700">借用用途 <span className="text-red-500">*</span></label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {getPurposePresetsByType(formData.bookingType).map(preset => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => handlePresetClick(preset)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                            formData.purpose === preset 
                              ? 'bg-blue-50 text-blue-700 border-blue-200' 
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                    <input 
                      type="text" 
                      name="purpose"
                      required
                      value={formData.purpose}
                      onChange={handleInputChange}
                      placeholder="輸入用途"
                      className="w-full min-w-0 px-4 py-2 sm:py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all outline-none text-sm"
                    />
                  </div>
                </form>
              </div>

              <div className={`px-5 py-4 sm:px-6 sm:py-4 border-t border-slate-100 bg-slate-50 flex ${editingId ? 'justify-between' : 'justify-end'} gap-2 sm:gap-3 rounded-b-3xl`}>
                {editingId && (
                  <button 
                    type="button"
                    onClick={handleDelete}
                    className="px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-semibold text-red-600 hover:bg-red-50 rounded-xl transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 size={14} className="sm:w-4 sm:h-4" />
                    <span>刪除</span>
                  </button>
                )}
                
                <div className="flex gap-2 sm:gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-200/50 rounded-xl transition-colors"
                  >
                    取消
                  </button>
                  <button 
                    type="submit"
                    form="booking-form"
                    disabled={isSubmitting}
                    className="px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 shadow-sm shadow-blue-600/20 rounded-xl transition-colors flex items-center gap-1.5"
                  >
                    {isSubmitting ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <CheckCircle2 size={14} className="sm:w-4 sm:h-4" />
                    )}
                    <span>{isSubmitting ? '處理中...' : (editingId ? '儲存' : '確認')}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- 系列預約確認 Modal --- */}
      <AnimatePresence>
        {seriesConfirmModal.isOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-100"
            >
              <div className="p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-2">
                  {seriesConfirmModal.action === 'edit' ? '編輯重複預約' : '刪除重複預約'}
                </h3>
                <p className="text-sm text-slate-600 mb-6">
                  這是一個重複預約。您想要{seriesConfirmModal.action === 'edit' ? '編輯' : '刪除'}哪一個預約？
                </p>
                
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => {
                      if (seriesConfirmModal.action === 'edit') {
                        executeSubmit(false);
                      } else {
                        executeDelete(false, seriesConfirmModal.booking);
                      }
                    }}
                    disabled={isSubmitting}
                    className="w-full px-4 py-3 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors text-left flex items-center justify-between"
                  >
                    <span>僅此預約</span>
                    {isSubmitting && <div className="w-4 h-4 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" />}
                  </button>
                  <button
                    onClick={() => {
                      if (seriesConfirmModal.action === 'edit') {
                        executeSubmit(true);
                      } else {
                        executeDelete(true, seriesConfirmModal.booking);
                      }
                    }}
                    disabled={isSubmitting}
                    className="w-full px-4 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-xl transition-colors shadow-sm shadow-blue-600/20 text-left flex items-center justify-between"
                  >
                    <span>此預約及後續所有預約</span>
                    {isSubmitting && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  </button>
                </div>
              </div>
              
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                <button
                  onClick={() => setSeriesConfirmModal({ isOpen: false, action: null, booking: null })}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-200/50 rounded-xl transition-colors"
                >
                  取消
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
