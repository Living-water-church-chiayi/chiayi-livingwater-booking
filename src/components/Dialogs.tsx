import React, { useEffect, useState } from 'react';
import { AlertTriangle, Lock, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { Booking } from '../types';

function useEscapeClose(isOpen: boolean, disabled: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen || disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, disabled, onClose]);
}

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerify: (password: string) => boolean;
}

export function AdminLoginModal({ isOpen, onClose, onVerify }: AdminLoginModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  useEscapeClose(isOpen, false, onClose);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setError(false);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onVerify(password)) {
      onClose();
    } else {
      setError(true);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#1E1B18]/45 backdrop-blur-xs"
        >
          <motion.form
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSubmit}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-[#EAE3D8]"
          >
            <div className="p-6">
              <div className="w-10 h-10 rounded-2xl bg-[#FFF3E3] text-[#B85A1F] flex items-center justify-center mb-3">
                <Lock size={18} />
              </div>
              <h3 className="text-lg font-bold text-[#1E1B18] mb-1">管理員驗證</h3>
              <p className="text-xs sm:text-sm text-[#6E665C] mb-4">
                請輸入管理密碼以啟用管理員功能。
              </p>
              <input
                type="password"
                inputMode="numeric"
                enterKeyHint="done"
                autoComplete="off"
                autoFocus
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(false);
                }}
                placeholder="請輸入管理密碼"
                className={`w-full px-4 py-2.5 bg-[#FAF8F4] border rounded-xl outline-none text-[16px] sm:text-sm transition ${
                  error
                    ? 'border-[#C43E3E] ring-2 ring-[#C43E3E]/15'
                    : 'border-[#E3DBD0] focus:bg-white focus:border-[#B85A1F] focus:ring-2 focus:ring-[#B85A1F]/15'
                }`}
              />
              {error && <p className="text-xs font-semibold text-[#C43E3E] mt-2">密碼不正確，請再試一次。</p>}
            </div>

            <div className="px-6 py-4 border-t border-[#EFEAE1] bg-[#FAF8F4] flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-semibold text-[#5C554C] hover:bg-[#EDE6DC] rounded-xl transition cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={!password.trim()}
                className="px-4 py-2 text-sm font-semibold text-white bg-[#B85A1F] hover:bg-[#9E4B18] disabled:opacity-50 rounded-xl transition cursor-pointer"
              >
                確認登入
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface ClearAllConfirmModalProps {
  isOpen: boolean;
  isClearing: boolean;
  bookingCount: number;
  onClose: () => void;
  onConfirm: () => void;
}

export function ClearAllConfirmModal({
  isOpen,
  isClearing,
  bookingCount,
  onClose,
  onConfirm,
}: ClearAllConfirmModalProps) {
  useEscapeClose(isOpen, isClearing, onClose);
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !isClearing && onClose()}
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#1E1B18]/45 backdrop-blur-xs"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-[#EAE3D8]"
          >
            <div className="p-6">
              <div className="w-10 h-10 rounded-2xl bg-[#FDF1F1] text-[#C43E3E] flex items-center justify-center mb-3">
                <AlertTriangle size={20} />
              </div>
              <h3 className="text-lg font-bold text-[#1E1B18] mb-1">確定要清空所有預約？</h3>
              <p className="text-sm text-[#6E665C]">
                目前資料庫共有 <strong className="text-[#1E1B18]">{bookingCount}</strong> 筆預約，清空後將無法復原。
              </p>
            </div>

            <div className="px-6 py-4 border-t border-[#EFEAE1] bg-[#FAF8F4] flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isClearing}
                className="px-4 py-2 text-sm font-semibold text-[#5C554C] hover:bg-[#EDE6DC] rounded-xl transition cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isClearing}
                className="px-4 py-2 text-sm font-semibold text-white bg-[#C43E3E] hover:bg-[#A63131] disabled:opacity-50 rounded-xl transition inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 size={14} />
                {isClearing ? '清空中...' : '確定清空'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface SeriesConfirmModalProps {
  isOpen: boolean;
  action: 'edit' | 'delete' | null;
  booking: Booking | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSelectSingle: () => void;
  onSelectFuture: () => void;
}

export function SeriesConfirmModal({
  isOpen,
  action,
  isSubmitting,
  onClose,
  onSelectSingle,
  onSelectFuture,
}: SeriesConfirmModalProps) {
  useEscapeClose(isOpen, isSubmitting, onClose);
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !isSubmitting && onClose()}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#1E1B18]/45 backdrop-blur-xs"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-[#EAE3D8]"
          >
            <div className="p-6">
              <h3 className="text-lg font-bold text-[#1E1B18] mb-1.5">
                {action === 'edit' ? '編輯重複預約' : '刪除重複預約'}
              </h3>
              <p className="text-sm text-[#6E665C] mb-5">
                這是一筆重複預約，請問要{action === 'edit' ? '套用變更' : '刪除'}到哪個範圍？
              </p>

              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={onSelectSingle}
                  disabled={isSubmitting}
                  className="w-full px-4 py-3 text-sm font-semibold text-[#1E1B18] bg-[#F4F0E9] hover:bg-[#EAE3D8] rounded-xl transition text-left flex items-center justify-between cursor-pointer"
                >
                  <span>僅此一筆預約</span>
                  {isSubmitting && (
                    <span className="w-4 h-4 border-2 border-[#8A8177]/30 border-t-[#5C554C] rounded-full animate-spin" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={onSelectFuture}
                  disabled={isSubmitting}
                  className="w-full px-4 py-3 text-sm font-semibold text-white bg-[#B85A1F] hover:bg-[#9E4B18] disabled:opacity-50 rounded-xl transition text-left flex items-center justify-between cursor-pointer"
                >
                  <span>此預約及後續所有預約</span>
                  {isSubmitting && (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                </button>
              </div>
            </div>

            <div className="px-6 py-3.5 border-t border-[#EFEAE1] bg-[#FAF8F4] flex justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-semibold text-[#5C554C] hover:bg-[#EDE6DC] rounded-xl transition cursor-pointer"
              >
                取消
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface DeleteConfirmModalProps {
  isOpen: boolean;
  applyToFuture: boolean;
  deleterName: string;
  isSubmitting: boolean;
  onChangeName: (name: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmModal({
  isOpen,
  applyToFuture,
  deleterName,
  isSubmitting,
  onChangeName,
  onClose,
  onConfirm,
}: DeleteConfirmModalProps) {
  useEscapeClose(isOpen, isSubmitting, onClose);
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !isSubmitting && onClose()}
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#1E1B18]/45 backdrop-blur-xs"
        >
          <motion.form
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              if (deleterName.trim()) onConfirm();
            }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-[#EAE3D8]"
          >
            <div className="p-6">
              <h3 className="text-lg font-bold text-[#1E1B18] mb-1.5">確認刪除預約</h3>
              <p className="text-sm text-[#6E665C] mb-4">
                為避免誤刪，請先輸入刪除者姓名，再刪除
                {applyToFuture ? '此預約及後續所有預約' : '這筆預約'}。
              </p>

              <div className="space-y-1.5">
                <label className="text-xs sm:text-sm font-semibold text-[#3D3731]">
                  刪除者姓名 <span className="text-[#C43E3E]">*</span>
                </label>
                <input
                  type="text"
                  enterKeyHint="done"
                  autoComplete="off"
                  autoFocus
                  value={deleterName}
                  onChange={(e) => onChangeName(e.target.value)}
                  placeholder="請輸入姓名"
                  className="w-full px-4 py-2.5 bg-[#FAF8F4] border border-[#E3DBD0] rounded-xl focus:bg-white focus:ring-2 focus:ring-[#C43E3E]/15 focus:border-[#C43E3E] transition outline-none text-[16px] sm:text-sm"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[#EFEAE1] bg-[#FAF8F4] flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-semibold text-[#5C554C] hover:bg-[#EDE6DC] rounded-xl transition cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !deleterName.trim()}
                className="px-4 py-2 text-sm font-semibold text-white bg-[#C43E3E] hover:bg-[#A63131] disabled:opacity-45 rounded-xl transition cursor-pointer"
              >
                {isSubmitting ? '刪除中...' : '確認刪除'}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
