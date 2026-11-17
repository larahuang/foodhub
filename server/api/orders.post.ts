interface OrderBody {
  userId: number
  restaurantId?: number
  groupCartId?: string | null
  address?: string
  phone?: string
  items: {
    productId: number
    name: string
    qty: number
    unitPrice: number
    userName?: string | null
    groupCartId?: string | null
  }[]
  total: number
}

// 確保資料庫資料表已包含 group_cart_id 與 user_name 欄位
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

function validateOrder(body: OrderBody) {
  if (!body.items?.length) {
    throw createError({ statusCode: 400, statusMessage: '購物車是空的' })
  }
  for (const item of body.items) {
    if (!Number.isInteger(item.qty) || item.qty <= 0) {
      throw createError({ statusCode: 400, statusMessage: '數量不正確' })
    }
  }
}

// 向餐廳廚房確認備料（模擬外部 API，約 200ms）
function notifyKitchen(productId: number, qty: number) {
  return new Promise(resolve => setTimeout(() => resolve({ productId, qty, accepted: true }), 200))
}

export default defineEventHandler(async (event) => {
  const session = await getSessionUser(event)
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: '請先登入' })
  }

  const body = await readBody<OrderBody>(event)
  validateOrder(body)

  try {
    const db = useDb()
    // 1. 確保資料表已包含 group_cart_id 與 user_name 欄位
    ensureGroupOrderColumns(db)

    const targetUserId = body.userId || session.id
    const user = db
      .prepare('SELECT name, address, phone FROM users WHERE id = ?')
      .get(targetUserId) as Pick<User, 'name' | 'address' | 'phone'> | undefined

    const defaultUserName = user?.name || session.name || '訂購人'

    // 2. 依 productId 彙整總需求量（同時解決庫存檢查與同商品多人點餐主鍵衝突問題）
    const aggregatedMap = new Map<
      number,
      {
        productId: number
        name: string
        totalQty: number
        unitPrice: number
        buyers: string[]
      }
    >()

    for (const item of body.items) {
      const buyerName = item.userName || defaultUserName
      const buyerLabel = `${buyerName} x${item.qty}`
      const existing = aggregatedMap.get(item.productId)

      if (existing) {
        existing.totalQty += item.qty
        existing.buyers.push(buyerLabel)
      } else {
        aggregatedMap.set(item.productId, {
          productId: item.productId,
          name: item.name,
          totalQty: item.qty,
          unitPrice: item.unitPrice,
          buyers: [buyerLabel],
        })
      }
    }

    const aggregatedItems = Array.from(aggregatedMap.values())

    // 3. 寫入資料庫前，先檢查所有商品合併後的總庫存並通知廚房
    const stockUpdates: { productId: number; newStock: number }[] = []
    for (const aggItem of aggregatedItems) {
      const product = db
        .prepare('SELECT name, stock FROM products WHERE id = ?')
        .get(aggItem.productId) as Pick<Product, 'name' | 'stock'> | undefined

      if (product && product.stock !== null) {
        if (product.stock < aggItem.totalQty) {
          throw createError({
            statusCode: 409,
            statusMessage: `${product.name} 庫存不足（剩餘 ${product.stock} 份，團購共需 ${aggItem.totalQty} 份）`,
          })
        }
        stockUpdates.push({
          productId: aggItem.productId,
          newStock: product.stock - aggItem.totalQty,
        })
      }

      await notifyKitchen(aggItem.productId, aggItem.totalQty)
    }

    // 取得團購編號（優先取 body.groupCartId，若前端漏傳則自動從 items 中擷取）
    const groupCartId =
      body.groupCartId || body.items.find(i => i.groupCartId)?.groupCartId || null

    // 4. 使用同步 Transaction 一次性寫入訂單主表、明細表與更新庫存
    const insertOrderTransaction = db.transaction(() => {
      const { lastInsertRowid } = db
        .prepare(
          'INSERT INTO orders (user_id, total, address, phone, status, group_cart_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          targetUserId,
          body.total,
          body.address || user?.address || '',
          body.phone || user?.phone || '',
          'pending',
          groupCartId,
          new Date().toISOString()
        )

      const orderId = Number(lastInsertRowid)

      const insertItemStmt = db.prepare(
        'INSERT INTO order_items (order_id, product_id, name, qty, unit_price, user_name) VALUES (?, ?, ?, ?, ?, ?)'
      )

      for (const aggItem of aggregatedItems) {
        // 若只有一人點餐且非團購，顯示單人名稱；若多人合點同一品項，顯示「王小明 x1, 小美 x2」
        const combinedUserName =
          aggItem.buyers.length === 1 && !groupCartId
            ? aggItem.buyers[0].replace(/\s*x\d+$/, '')
            : aggItem.buyers.join(', ')

        insertItemStmt.run(
          orderId,
          aggItem.productId,
          aggItem.name,
          aggItem.totalQty,
          aggItem.unitPrice,
          combinedUserName
        )
      }

      const updateStockStmt = db.prepare('UPDATE products SET stock = ? WHERE id = ?')
      for (const su of stockUpdates) {
        updateStockStmt.run(su.newStock, su.productId)
      }

      return orderId
    })

    const orderId = insertOrderTransaction()

    return { ok: true, orderId }
  } catch (e: any) {
    if (e?.statusCode) {
      throw e
    }
    console.error('建立訂單失敗詳細原因:', e)
    throw createError({
      statusCode: 500,
      statusMessage: `建立訂單失敗: ${e?.message || '未知錯誤'}`,
    })
  }
})
