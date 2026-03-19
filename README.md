# 嘉義活水貴格會場地借用系統 (Church Venue Booking System)

這是一個為教會設計的場地預約管理系統，支援即時同步、衝突檢測以及訪客免登入預約功能。

## ✨ 功能特色

- **即時同步**：使用 Firebase Firestore，所有預約變更會立即反映在所有使用者的畫面上。
- **免登入預約**：一般會友無需登入即可填寫預約表單，方便快速。
- **管理員模式**：管理員登入後可編輯或刪除任何預約，確保資料正確性。
- **衝突檢測**：填寫表單時，系統會自動檢查該時段場地是否已被佔用。
- **重複預約**：支援每週或每兩週一次的定期預約功能。
- **響應式設計**：完美支援手機、平板與電腦瀏覽。

## 🛠️ 技術棧

- **前端**：React 19, TypeScript, Tailwind CSS
- **動畫**：Motion (Framer Motion)
- **圖示**：Lucide React
- **後端/資料庫**：Firebase Auth & Firestore
- **建構工具**：Vite

## 🚀 如何開始

1. **複製專案**：
   ```bash
   git clone <your-repo-url>
   cd <repo-folder>
   ```

2. **安裝依賴**：
   ```bash
   npm install
   ```

3. **設定 Firebase**：
   - 在 Firebase Console 建立新專案。
   - 開啟 Firestore 資料庫與 Google 驗證。
   - 建立 `src/firebase-applet-config.json` 並填入您的 Firebase 設定。

4. **啟動開發伺服器**：
   ```bash
   npm run dev
   ```

## 📄 授權

MIT License

---
*Last updated to force Git sync: 2026-03-19*
