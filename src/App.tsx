/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, Component, ErrorInfo, ReactNode } from 'react';
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
  ClipboardPaste,
  Filter,
  AlertCircle,
  LogOut,
  LogIn,
  User as UserIcon
} from 'lucide-react';
import { motion, AnimatePresence } from "motion/react";
import { 
  auth, 
  db, 
  loginWithGoogle, 
  logout, 
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
  Timestamp,
  serverTimestamp 
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';

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

// 取得今天的日期字串 YYYY-MM-DD
const getTodayStr = () => {
  const today = new Date();
  const offset = today.getTimezoneOffset();
  const localToday = new Date(today.getTime() - (offset*60*1000));
  return localToday.toISOString().split('T')[0];
};

interface Booking {
  id: string;
  venue: string;
  date: string;
  startTime: string;
  endTime: string;
  borrower: string;
  purpose: string;
  uid: string;
  authorName?: string;
  createdAt?: any;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'calendar'>('dashboard');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedDateStr, setSelectedDateStr] = useState(getTodayStr());

  // --- Firebase Auth ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // --- Firebase Firestore Real-time Sync ---
  useEffect(() => {
    // Anyone can read, but we wait for the first auth check to know if we have a user
    if (!isAuthReady) return;

    const q = query(collection(db, 'bookings'), orderBy('date', 'asc'), orderBy('startTime', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bks: Booking[] = [];
      snapshot.forEach((doc) => {
        bks.push({ id: doc.id, ...doc.data() } as Booking);
      });
      setBookings(bks);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'bookings');
    });

    return () => unsubscribe();
  }, [isAuthReady]);
  
  // --- 提示訊息 Toast ---
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' });
  
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 1000);
  };

  // --- 月視圖場地篩選 ---
  const [selectedVenues, setSelectedVenues] = useState<string[]>(VENUES);
  
  const toggleVenueFilter = (venue: string) => {
    setSelectedVenues(prev => 
      prev.includes(venue) ? prev.filter(v => v !== venue) : [...prev, venue]
    );
  };

  // --- 複製 / 貼上功能 ---
  const [clipboardBooking, setClipboardBooking] = useState<Booking | null>(null);
  const [showClipboardHint, setShowClipboardHint] = useState(false);

  const handleCopy = (booking: Booking) => {
    setClipboardBooking(booking);
    setShowClipboardHint(true);
    showToast(`已複製「${booking.venue} - ${booking.purpose}」，請點擊日期貼上`, 'success');
    
    // 1.5 秒後自動隱藏下方黑色提示
    setTimeout(() => setShowClipboardHint(false), 1500);
  };

  const handlePaste = async (dateStr: string) => {
    if (!clipboardBooking) return;
    try {
      const { id, ...data } = clipboardBooking;
      await addDoc(collection(db, 'bookings'), {
        ...data,
        date: dateStr,
        uid: user?.uid || 'anonymous',
        authorName: user?.displayName || '訪客',
        createdAt: serverTimestamp()
      });
      showToast(`成功貼上至 ${dateStr}`, 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'bookings');
    }
  };

  // --- 狀態與月曆邏輯 ---
  const [formData, setFormData] = useState({
    venue: VENUES[0],
    date: getTodayStr(),
    startTime: '10:00',
    endTime: '12:00',
    borrower: '',
    purpose: '',
    repeat: 'none', // 'none', 'weekly', 'biweekly'
    repeatUntil: getTodayStr()
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePresetClick = (preset: string) => {
    setFormData(prev => ({ ...prev, purpose: preset }));
  };

  const openBookingModal = (venueOrBooking: string | Booking = VENUES[0], isEditing = false, specificDate: string | null = null) => {
    if (specificDate) setSelectedDateStr(specificDate);
    
    if (isEditing && typeof venueOrBooking === 'object') {
      setFormData({
        ...venueOrBooking,
        repeat: 'none',
        repeatUntil: venueOrBooking.date
      });
      setEditingId(venueOrBooking.id);
    } else {
      const defaultDate = specificDate || getTodayStr();
      setFormData({
        venue: typeof venueOrBooking === 'string' ? venueOrBooking : VENUES[0],
        date: defaultDate,
        startTime: '10:00',
        endTime: '12:00',
        borrower: '',
        purpose: '',
        repeat: 'none',
        repeatUntil: defaultDate
      });
      setEditingId(null);
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.borrower || !formData.purpose) return;
    
    try {
      if (editingId) {
        // 編輯單筆 (僅限管理員，規則會檢查)
        const bookingRef = doc(db, 'bookings', editingId);
        await updateDoc(bookingRef, {
          ...formData,
          uid: user?.uid || 'anonymous',
          authorName: user?.displayName || '訪客'
        });
        showToast('更新預約成功！', 'success');
      } else {
        // 新增 (處理重複邏輯)
        if (formData.repeat !== 'none') {
          const endDate = new Date(formData.repeatUntil);
          let currDateStr = formData.date;
          const newBookingsData = [];

          let safetyCounter = 0; 
          while (new Date(currDateStr) <= endDate && safetyCounter < 50) {
            newBookingsData.push({ 
              ...formData, 
              date: currDateStr,
              uid: user?.uid || 'anonymous',
              authorName: user?.displayName || '訪客',
              createdAt: serverTimestamp()
            });

            const d = new Date(currDateStr);
            d.setDate(d.getDate() + (formData.repeat === 'weekly' ? 7 : 14));
            const offset = d.getTimezoneOffset();
            currDateStr = new Date(d.getTime() - (offset * 60 * 1000)).toISOString().split('T')[0];
            safetyCounter++;
          }
          
          for (const data of newBookingsData) {
            await addDoc(collection(db, 'bookings'), data);
          }
          showToast(`成功建立 ${newBookingsData.length} 筆預約！`, 'success');
        } else {
          await addDoc(collection(db, 'bookings'), {
            ...formData,
            uid: user?.uid || 'anonymous',
            authorName: user?.displayName || '訪客',
            createdAt: serverTimestamp()
          });
          showToast('新增預約成功！', 'success');
        }
      }
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, editingId ? OperationType.UPDATE : OperationType.CREATE, 'bookings');
    }
  };

  const handleDelete = async () => {
    if (!editingId) return;
    try {
      await deleteDoc(doc(db, 'bookings', editingId));
      setIsModalOpen(false);
      showToast('刪除預約成功！', 'success');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `bookings/${editingId}`);
    }
  };

  // --- 狀態與月曆邏輯 ---
  const getVenueNextSchedule = (venueName: string) => {
    const today = getTodayStr();
    const now = new Date();
    const currentTimeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

    // 1. 找出目前正在進行的
    const active = bookings.find(b => 
      b.venue === venueName && 
      b.date === today && 
      b.startTime <= currentTimeStr && 
      b.endTime >= currentTimeStr
    );

    // 2. 找出下一個預約 (可能是今天稍後，也可能是未來某天)
    const futureBookings = bookings
      .filter(b => b.venue === venueName)
      .filter(b => {
        if (b.date > today) return true;
        if (b.date === today && b.startTime > currentTimeStr) return true;
        return false;
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.startTime.localeCompare(b.startTime);
      });

    const next = futureBookings[0] || null;

    return { active, next };
  };

  // 檢查是否有衝突
  const checkConflict = (venue: string, date: string, start: string, end: string, excludeId: string | null) => {
    return bookings.some(b => {
      if (b.id === excludeId) return false;
      if (b.venue !== venue || b.date !== date) return false;
      
      // 檢查時間重疊
      // (StartA < EndB) && (EndA > StartB)
      return (start < b.endTime) && (end > b.startTime);
    });
  };

  const isConflict = checkConflict(formData.venue, formData.date, formData.startTime, formData.endTime, editingId);

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
      .filter(b => b.date === dateStr && selectedVenues.includes(b.venue))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-blue-100 pb-12 relative">
      
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
            <span className="text-sm">已複製：{clipboardBooking.venue} ({clipboardBooking.startTime})</span>
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
            <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 bg-white rounded-lg overflow-hidden flex items-center justify-center">
              <img 
                src="logo.png" 
                alt="Church Logo"
                className="w-full h-full object-contain"
                onError={(e) => {
                  // 如果找不到本地檔案，則顯示一個漂亮的預設圖示或背景
                  (e.target as HTMLImageElement).style.display = 'none';
                  (e.target as HTMLImageElement).parentElement!.classList.add('bg-blue-600');
                  (e.target as HTMLImageElement).parentElement!.innerHTML = '<span class="text-white text-xs font-bold">活水</span>';
                }}
              />
            </div>
            <h1 className="text-base sm:text-xl font-bold tracking-tight text-slate-900 truncate">嘉義活水貴格會場地借用</h1>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
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

            {isAuthReady && (
              <div className="flex items-center">
                {user ? (
                  <div className="flex items-center gap-2">
                    <div className="hidden sm:flex flex-col items-end mr-1">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">已登入</span>
                      <span className="text-xs font-bold text-slate-700">{user.displayName}</span>
                    </div>
                    <button 
                      onClick={logout}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                      title="登出"
                    >
                      <LogOut size={18} />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={loginWithGoogle}
                    className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl text-xs sm:text-sm font-bold hover:bg-blue-700 shadow-sm shadow-blue-600/20 active:scale-95 transition-all"
                  >
                    <LogIn size={16} />
                    <span>登入</span>
                  </button>
                )}
              </div>
            )}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {VENUES.map(venue => {
                const { active, next } = getVenueNextSchedule(venue);
                const isOccupied = !!active;

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
                        ${isOccupied ? 'bg-amber-50 text-amber-600 border border-amber-200/50' : 'bg-emerald-50 text-emerald-600 border border-emerald-200/50'}`}>
                        <span className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full ${isOccupied ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></span>
                        {isOccupied ? '使用中' : '空閒'}
                      </span>
                    </div>

                    <div className="flex-1 flex flex-col gap-3">
                      {active ? (
                        <div className={`border rounded-xl p-3 text-sm relative group/edit transition-colors ${getVenueColor(venue)}`}>
                          <div className="flex items-center gap-2 font-medium mb-1.5">
                            <Clock size={14} className="opacity-70" />
                            <span>{active.startTime} - {active.endTime}</span>
                          </div>
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
                              <div className="text-slate-500 text-xs mt-0.5 truncate">{next.borrower} · {next.purpose}</div>
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
                  const isToday = getTodayStr() === dateStr;
                  const isSelected = selectedDateStr === dateStr;
                  
                  return (
                    <div 
                      key={day} 
                      onClick={() => {
                        setSelectedDateStr(dateStr);
                        if (window.innerWidth < 640) {
                          setTimeout(() => {
                            mobileDetailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }, 100);
                        }
                      }}
                      className={`bg-white min-h-[40px] sm:min-h-[60px] p-1 sm:p-1.5 border-t border-slate-100 transition-all hover:bg-blue-50/20 cursor-pointer group/day relative flex flex-col items-center justify-start ${isToday ? 'bg-blue-50/30' : ''} ${isSelected ? 'ring-2 ring-inset ring-blue-500/50 bg-blue-50/10' : ''}`}
                    >
                      <span className={`inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full text-[10px] sm:text-xs font-medium mb-0.5 sm:mb-1 transition-colors ${isToday ? 'bg-blue-600 text-white shadow-sm' : isSelected ? 'bg-blue-100 text-blue-700' : 'text-slate-700 group-hover/day:text-blue-600'}`}>
                        {day}
                      </span>
                      
                      {/* 預約點點指示器 */}
                      <div className="flex flex-wrap justify-center gap-0.5 sm:gap-1 max-w-full px-0.5">
                        {dayBookings.slice(0, 8).map((b, idx) => (
                          <div 
                            key={idx} 
                            className={`w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full shadow-sm ${VENUE_DOTS[b.venue] || 'bg-slate-400'}`}
                            title={`${b.startTime} ${b.venue}`}
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
                            <p key={idx} className="truncate opacity-90">• {b.startTime} {b.venue}</p>
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
                  onClick={() => openBookingModal(VENUES[0], false, selectedDateStr)}
                  className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-white bg-blue-600 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl hover:bg-blue-700 shadow-sm shadow-blue-600/20 active:scale-95 transition-all"
                >
                  <Plus size={14} /> 新增預約
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {bookings
                  .filter(b => b.date === selectedDateStr && selectedVenues.includes(b.venue))
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                  .map(b => (
                    <div 
                      key={b.id} 
                      onClick={() => openBookingModal(b, true)}
                      className={`p-4 rounded-2xl border shadow-sm flex flex-col gap-3 group cursor-pointer hover:shadow-md active:scale-[0.98] transition-all relative overflow-hidden ${getVenueColor(b.venue)}`}
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
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-700 relative z-10">
                        <MapPin size={16} className="opacity-70" />
                        <span>{b.venue}</span>
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
                
                {bookings.filter(b => b.date === selectedDateStr && selectedVenues.includes(b.venue)).length === 0 && (
                  <div className="col-span-full py-16 text-center border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/50">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                      <CalendarIcon size={24} className="text-slate-300" />
                    </div>
                    <p className="text-slate-400 font-medium">當日尚無預約</p>
                    <button 
                      onClick={() => openBookingModal(VENUES[0], false, selectedDateStr)}
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

              <div className="p-5 sm:p-6 overflow-y-auto custom-scrollbar space-y-5 sm:space-y-6">
                
                <form id="booking-form" onSubmit={handleSubmit} className="space-y-5 sm:space-y-6 relative z-10">
                  
                  {!user && editingId && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                      <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={18} />
                      <div className="text-xs sm:text-sm text-amber-800">
                        <p className="font-bold mb-1">管理員權限提醒</p>
                        <p>未登入狀態下僅可新增預約。如需修改或刪除，請先登入管理員帳號。</p>
                      </div>
                    </div>
                  )}

                  {isConflict && (
                    <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
                      <AlertCircle className="text-rose-600 shrink-0 mt-0.5" size={18} />
                      <div className="text-xs sm:text-sm text-rose-800">
                        <p className="font-bold mb-1">時間衝突警告</p>
                        <p>此時段該場地已有其他預約，請調整時間或場地。</p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs sm:text-sm font-semibold text-slate-700">借用人 / 單位 <span className="text-red-500">*</span></label>
                      <input 
                        type="text" 
                        name="borrower"
                        required
                        value={formData.borrower}
                        onChange={handleInputChange}
                        placeholder="例如: 敬拜團"
                        className="w-full px-4 py-2 sm:py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all outline-none text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs sm:text-sm font-semibold text-slate-700">日期 <span className="text-red-500">*</span></label>
                      <input 
                        type="date" 
                        name="date"
                        required
                        value={formData.date}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 sm:py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all outline-none text-sm"
                      />
                    </div>
                  </div>

                  {/* 衝突提醒 */}
                  {checkConflict(formData.venue, formData.date, formData.startTime, formData.endTime, editingId) && (
                    <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 text-red-600 animate-pulse">
                      <AlertCircle size={16} />
                      <span className="text-xs font-bold">注意：此時段場地已被預約，請確認是否衝突！</span>
                    </div>
                  )}

                  {!editingId && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-blue-50/50 border border-blue-100 rounded-2xl">
                      <div className="space-y-1.5">
                        <label className="text-xs sm:text-sm font-semibold text-slate-700">重複設定</label>
                        <select 
                          name="repeat"
                          value={formData.repeat}
                          onChange={handleInputChange}
                          className="w-full px-4 py-2 sm:py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all outline-none text-sm"
                        >
                          <option value="none">不重複</option>
                          <option value="weekly">每週重複</option>
                          <option value="biweekly">每兩週重複</option>
                        </select>
                      </div>
                      {formData.repeat !== 'none' && (
                        <div className="space-y-1.5 animate-in fade-in slide-in-from-left-2">
                          <label className="text-xs sm:text-sm font-semibold text-slate-700">結束重複日期</label>
                          <input 
                            type="date" 
                            name="repeatUntil"
                            required={formData.repeat !== 'none'}
                            value={formData.repeatUntil}
                            min={formData.date}
                            onChange={handleInputChange}
                            className="w-full px-4 py-2 sm:py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all outline-none text-sm"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs sm:text-sm font-semibold text-slate-700">選擇場地 <span className="text-red-500">*</span></label>
                      <select 
                        name="venue"
                        value={formData.venue}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 sm:py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all outline-none appearance-none cursor-pointer text-sm"
                      >
                        {VENUES.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs sm:text-sm font-semibold text-slate-700">開始時間 <span className="text-red-500">*</span></label>
                        <input 
                          type="time" 
                          name="startTime"
                          required
                          value={formData.startTime}
                          onChange={handleInputChange}
                          className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all outline-none text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs sm:text-sm font-semibold text-slate-700">結束時間 <span className="text-red-500">*</span></label>
                        <input 
                          type="time" 
                          name="endTime"
                          required
                          value={formData.endTime}
                          onChange={handleInputChange}
                          className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all outline-none text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-xs sm:text-sm font-semibold text-slate-700">借用用途 <span className="text-red-500">*</span></label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {PURPOSE_PRESETS.map(preset => (
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
                      className="w-full px-4 py-2 sm:py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 transition-all outline-none text-sm"
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
                    className="px-4 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-600/20 rounded-xl transition-colors flex items-center gap-1.5"
                  >
                    <CheckCircle2 size={14} className="sm:w-4 sm:h-4" />
                    <span>{editingId ? '儲存' : '確認'}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
