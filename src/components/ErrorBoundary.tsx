import React from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || '畫面發生未預期的錯誤',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App ErrorBoundary caught error:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleClearCacheAndReload = () => {
    try {
      window.localStorage.removeItem('chiayi-livingwater-bookings-cache-v2');
      window.sessionStorage.clear();
    } catch {
      // Ignore storage access errors in private browsing
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-[#FAF8F4] text-[#1C1917] flex items-center justify-center p-5">
        <div className="w-full max-w-md bg-white border border-[#E7E2D8] rounded-3xl p-6 shadow-sm text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[#FDF2EC] text-[#B85A1F] flex items-center justify-center mx-auto">
            <RefreshCw className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-lg font-bold tracking-tight text-[#1C1917]">
              畫面暫時發生異常
            </h1>
            <p className="text-sm text-[#57534E] leading-relaxed">
              預約資料仍安全保存在雲端。請點擊下方按鈕重新整理即可恢復正常。
            </p>
          </div>
          <div className="flex flex-col gap-2.5 pt-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="w-full py-3 px-4 rounded-xl bg-[#B85A1F] hover:bg-[#9C4A17] text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              重新載入畫面
            </button>
            <button
              type="button"
              onClick={this.handleClearCacheAndReload}
              className="w-full py-2.5 px-4 rounded-xl bg-[#F5F2EB] hover:bg-[#ECE7DD] text-[#57534E] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              清除本機暫存並重載
            </button>
          </div>
        </div>
      </div>
    );
  }
}
