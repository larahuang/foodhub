
export default defineCachedEventHandler((event) => {
  // 取得網址查詢參數（Query Parameters）
  // 從前端發送的 HTTP 請求網址中，解析出 restaurantId（餐廳編號）與 category（商品分類）。例如前端呼叫 /api/menu?restaurantId=1&category=飲料 時，就能抓到這兩個值。
  const { restaurantId, category } = getQuery(event)
  // 建立資料庫連線
  const db = useDb()
  // 查詢該餐廳的所有商品分類
  const categories = (db
    .prepare('SELECT DISTINCT category FROM products WHERE restaurant_id = ? ORDER BY id')
    .all(Number(restaurantId)) as { category: string }[])
    .map(r => r.category)
  // 查詢指定分類下的所有商品
  //根據 restaurant_id 與目標分類撈出所有商品資料。這裡的 category ?? categories[0] ?? '' 是一個貼心的預設值設計：如果前端沒有指定 category（例如剛進入點餐頁面），系統會自動帶入該餐廳的第一個分類（categories[0]）；若該餐廳完全沒有分類，則帶入空字串 ''。
  const products = db
    .prepare('SELECT * FROM products WHERE restaurant_id = ? AND category = ? ORDER BY id')
    .all(Number(restaurantId), String(category ?? categories[0] ?? '')) as unknown as Product[]
// • 回傳 JSON 資料
//return { categories, products }
//將整理好的「分類清單」與「該分類商品列表」打包成 JSON 物件回傳給前端畫面渲染。

  return { categories, products }
}, { maxAge: 60 })
