# AA Room

純前端、免註冊的 P2P 分帳工具。開個房間、分享房號或 QR code，大家在各自的手機上記帳、勾選，最後由房主確認結算。

## 功能

- 房主開房產生 6 碼房號與 QR code，成員輸入暱稱後加入
- 每個人新增自己代墊的帳目；預設全員參與，各自勾選是否有參與（房主可以幫任何人勾選、代為新增或修改帳目）
- 即時顯示每個人的收支預覽
- 房主確認結算：可選「各自轉帳」或「統一收付」，以及除不盡時「進位給代墊人」或「捨去」
- 結算後帳目鎖定，每個人直接看到要付給誰、付多少；房主可以退回修改
- 房主可以移出沒有付款紀錄的成員，被移出的人可以申請重新加入，需要房主同意

## 開發

```bash
npm install
npm run dev      # 開發伺服器（--host，可用同網段的手機測試）
npm test         # 單元測試
npm run build    # 型別檢查並打包到 dist/
```

注意：WebRTC 需要 HTTPS（localhost 除外），手機實測請使用部署後的 GitHub Pages 網址。

## 架構

- **房主為中心的星狀拓撲**：房主是唯一的 source of truth。成員只送出意圖，由房主驗證後更新 state，再廣播完整 snapshot。
- **傳輸層抽象**（`src/transport/types.ts`）：房間邏輯只依賴 `Transport` 介面，目前以 PeerJS 實作；之後若改用 Firebase / Supabase，只需新增實作。
- **身分與重連**：每個瀏覽器在 localStorage 保存 `clientId`，重連時以此認回原本的成員；房主重新整理後會從 localStorage 恢復房間。
- **心跳**：每 5 秒互送心跳，超過 15 秒沒有回應即視為斷線（手機切到背景時 WebRTC 不一定會即時觸發 close）。
- **分頁鎖**：同一個瀏覽器只允許一個分頁操作同一個房間（Web Locks API）。

```
src/
  room/        房間邏輯（純函式 state 與權限、結算計算、房主／成員控制器、訊息協定、房號）
  transport/   傳輸層介面與 PeerJS 實作
  components/  畫面
  useRoomSession.ts  串接傳輸層、房間控制器與本機保存
```

## 連線設定（選填）

複製 `.env.example` 為 `.env.local`。未設定時使用 PeerJS 的公用 signaling server 與內建的公用 STUN／TURN。
部署到 GitHub Pages 時，可在 repo 的 Settings → Secrets and variables → Actions → Variables 設定同名變數。

## 部署

推送到 `main` 後，GitHub Actions 會自動測試、打包並部署到 GitHub Pages。
第一次使用需在 repo 的 Settings → Pages 將 Source 設為「GitHub Actions」。
