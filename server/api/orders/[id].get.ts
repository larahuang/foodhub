// 確保舊資料表也包含團購相關欄位
function ensureGroupOrderColumns(db: any) {
  const orderCols = db.prepare('PRAGMA table_info(orders)').all() as { name: string }[]
  if (!orderCols.some(c => c.name === 'group_cart_id')) {
    db.prepare('ALTER TABLE orders ADD COLUMN group_cart_id TEXT DEFAULT NULL').run()
  }

  const itemCols = db.prepare('PRAGMA table_info(order_items)').all() as { name: string }[]
  if (!itemCols.some(c => c.name === 'user_name')) {
    db.prepare('ALTER TABLE order_items ADD COLUMN user_name TEXT DEFAULT NULL').run()
  }
}

export default defineEventHandler(async (event) => {
  const session = await getSessionUser(event)
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: '請先登入' })
  }

  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isInteger(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: '無效的訂單編號' })
  }

  const db = useDb()
  ensureGroupOrderColumns(db)

  const order = db
    .prepare('SELECT * FROM orders WHERE id = ?')
    .get(id) as Omit<Order, 'items'> | undefined

  if (!order) {
    throw createError({ statusCode: 404, statusMessage: '找不到訂單' })
  }

  // 安全防護：確保只能查詢屬於目前登入者的訂單
  if (order.user_id !== session.id) {
    throw createError({ statusCode: 403, statusMessage: '無權限檢視此訂單' })
  }

  const items = db
    .prepare('SELECT * FROM order_items WHERE order_id = ?')
    .all(id) as unknown as OrderItem[]

  return { ...order, items } satisfies Order
})
