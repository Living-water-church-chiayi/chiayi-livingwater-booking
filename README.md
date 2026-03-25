# 嘉義活水貴格會場地借用系統

這是一個為教會設計的場地借用與聚會時段管理系統，提供即時同步的月曆檢視、每日場地狀態、衝突檢查，以及「全教會聚會時段」管理。

## 功能特色

- 即時同步：使用 Firebase Firestore，同步所有借用與異動。
- 月曆檢視：可依場地篩選，快速查看每日預約分布。
- 今日狀態面板：集中顯示各場地目前使用中與下一筆預約，下一筆預約日期會附星期。
- 一般借用管理：支援新增、編輯、刪除、複製與貼上預約。
- 重複預約：支援每天、每週、每兩週、單數週、雙數週的重複建立。
- 衝突檢查：自動檢查同場地時段重疊，避免重複借用，並在表單中直接顯示衝突的借用人、場地與時段。
- 全教會聚會時段：可建立「全教會聚會時段」，自訂日期與時間，全館於該時段不可借用，並在月曆與狀態面板中明顯標示。
- 鍵盤操作：月曆支援方向鍵移動日期，按 Enter 可直接對選中日期新增預約。
- 響應式介面：可在手機、平板與桌面瀏覽器上使用，手機也會以雙欄顯示更多場地資訊。

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
3. 選定開始時間後，結束時間會自動帶入後 1 小時，仍可手動修改。
4. 如有需要，可設定重複規則。
5. 系統會在送出前檢查時段衝突，若有衝突會顯示是誰借用了場地。

### 重複規則

- 每天重複
- 每週重複
- 每兩週重複
- 單數週重複：當月第 1、3、5 週
- 雙數週重複：當月第 2、4 週

說明：

- 這裡的單數週 / 雙數週是依照「當月第幾週」判斷，不是 ISO 週次。
- 系統將每月 1-7 日視為第 1 週、8-14 日視為第 2 週、15-21 日視為第 3 週、22-28 日視為第 4 週、29-31 日視為第 5 週。

### 全教會聚會時段

表單中的事件類型可選擇：

- 一般場地借用
- 全教會聚會時段

當建立全教會聚會時段時：

- 可自訂日期與時間，全館於該時段不可借用。
- 這個時段外，其他場地可正常借用。
- 月曆中會固定顯示這些時段。
- 今日狀態與日期詳情會額外提示，方便同工與會友辨識。

### 月曆操作

- 可用滑動切換月份。
- 在桌面鍵盤上可使用方向鍵移動選中日期。
- 按 Enter 可直接對目前選中日期開啟新增預約。

## 注意事項

- 目前衝突檢查與全教會聚會時段規則是在前端介面中生效。
- 若未來需要防止外部直接寫入 Firestore 繞過限制，建議再補上 Firestore Security Rules 或後端驗證。

## 授權

MIT License
