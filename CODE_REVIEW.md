### 流程
1. 未登入點擊『發起團購』按鈕，router.push 網頁網址並複製
   規格一個餐廳商店只有一組團購，新增了groupCartId，
2. 新增商品到購物車：this.itemCart 新增了groupCartId作為關聯，localStorage 新增了 groupOrder 數據與 cart陣列都多了groupCartId作為關聯
3. 登入使用者 Amy ，購物車需要留著數據
4. 發起團購』按鈕的網頁網址在火狐瀏覽器為訪客（未登入），新增商品到購物車並渲染到畫面
5. 訪客登入，groupCartId作為關聯，合併購物車數據，每2秒更新一次groupOrder數據
6. 目前購物車因為少了欄位導致Order無法成功完成

思考重點：不同瀏覽器與設備是否使用
A方案：上傳至伺服器端的 Database（資料庫），頁面與資料快取
Ｂ方案：頁面與資料快取：將團購活動頁面、商品資訊、剩餘庫存顯示等「讀多寫少」的資料快取在 Redis 或 CDN 上，減少直接查詢資料庫的次數。




