// server/api/group-cart/[groupId].ts
const groupCartStorage = new Map<string, any[]>()

export default defineEventHandler(async (event) => {
  const groupId = getRouterParam(event, 'groupId')
  if (!groupId) {
    throw createError({ statusCode: 400, statusMessage: '缺少 groupCartId' })
  }

  const method = event.method

  // GET：主揪與訪客取得該團購目前的「所有共享商品」
  if (method === 'GET') {
    return groupCartStorage.get(groupId) ?? []
  }

  // POST：訪客按「加入團購項目」或主揪更新商品時，合併寫入共享清單
  if (method === 'POST') {
    const body = await readBody<{ items: any[]; participantName?: string }>(event)
    const currentSharedItems = groupCartStorage.get(groupId) ?? []

    for (const incoming of body.items) {
      // 決定訂購人名稱（若為訪客，帶入訪客輸入的名稱；若為主揪，帶入主揪名稱）
      const participantName = incoming.userId
        ? incoming.userName
        : (body.participantName || incoming.userName || 'gust')

      // 尋找共享清單中是否已有「同一訂購人 + 同一商品」
      const existing = currentSharedItems.find(
        i =>
          i.productId === incoming.productId &&
          (i.userId ?? undefined) === (incoming.userId ?? undefined) &&
          i.userName === participantName
      )

      if (existing) {
        existing.qty += incoming.qty
      } else {
        currentSharedItems.push({
          ...incoming,
          groupCartId: groupId,
          userName: participantName,
          isGuest: !incoming.userId,
        })
      }
    }

    groupCartStorage.set(groupId, currentSharedItems)
    return currentSharedItems
  }

  // PUT：直接同步整份最新狀態（用於增減數量、刪除商品或主揪合併商品）
  if (method === 'PUT') {
    const body = await readBody<{ items: any[] }>(event)
    groupCartStorage.set(groupId, body.items)
    return body.items
  }
})
