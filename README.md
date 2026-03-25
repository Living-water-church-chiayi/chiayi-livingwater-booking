# 嘉義活水貴格會場地借用系統

這是一個為教會設計的場地借用與聚會時段管理系統，提供即時同步的月曆檢視、每日場地狀態、衝突檢查，以及「全教會聚會時段」管理。

## 功能特色

- 即時同步：使用 Firebase Firestore，同步所有借用與異動。
- 月曆檢視：可依場地篩選，快速查看每日預約分布。
- 今日狀態面板：集中顯示各場地目前使用中與下一筆預約。
- 一般借用管理：支援新增、編輯、刪除、複製與貼上預約。
- 重複預約：支援每天、每週、每兩週的重複建立。
- 衝突檢查：自動檢查同場地時段重疊，避免重複借用。
- 全教會聚會時段：可建立主日聚會或特別聚會時段，建立後同時段所有空間都會暫停借用，並在月曆與狀態面板中明顯標示。
- 響應式介面：可在手機、平板與桌面瀏覽器上使用。

## 技術棧

- 前端：React 19 + TypeScript
- 樣式：Tailwind CSS 4
- 動畫：Motion
- 圖示：Lucide React
- 建構工具：Vite
- 資料庫與驗證：Firebase Firestore / Firebase Auth

## 專案結構

```text
.
├── src/
│   ├── App.tsx
│   ├── firebase.ts
│   ├── index.css
│   └── main.tsx
├── public/
│   ├── favicon.svg
│   └── logo.svg
├── firebase-applet-config.json
├── index.html
└── package.json
```

## 開發指令

安裝依賴：

```bash
npm install
```

啟動開發伺服器：

```bash
npm run dev
```

預設開啟位址：

```text
http://localhost:3000
```

建置正式版本：

```bash
npm run build
```

本機預覽正式版：

```bash
npm run preview
```

檢查 TypeScript：

```bash
npm run lint
```

## Firebase 設定

本專案會直接讀取根目錄的 `firebase-applet-config.json`。

請在 Firebase Console 建立專案後，填入對應設定，例如：

```json
{
  "apiKey": "YOUR_API_KEY",
  "authDomain": "YOUR_PROJECT.firebaseapp.com",
  "projectId": "YOUR_PROJECT_ID",
  "storageBucket": "YOUR_PROJECT.firebasestorage.app",
  "messagingSenderId": "YOUR_MESSAGING_SENDER_ID",
  "appId": "YOUR_APP_ID",
  "firestoreDatabaseId": "YOUR_DATABASE_ID"
}
```

## 使用說明

### 一般場地借用

1. 在月曆或右下角新增按鈕開啟表單。
2. 選擇日期、時間、場地、借用人與用途。
3. 如有需要，可設定重複規則。
4. 系統會在送出前檢查時段衝突。

### 全教會聚會時段

表單中的事件類型可選擇：

- 一般場地借用
- 主日聚會（全教會聚會時段）
- 特別聚會（全教會聚會時段）

當建立主日聚會或特別聚會時：

- 同時段所有場地都會暫停借用。
- 月曆中會固定顯示這些時段。
- 今日狀態與日期詳情會額外提示，方便同工與會友辨識。

## 注意事項

- 目前衝突檢查與全教會聚會時段規則是在前端介面中生效。
- 若未來需要防止外部直接寫入 Firestore 繞過限制，建議再補上 Firestore Security Rules 或後端驗證。

## 授權

MIT License
