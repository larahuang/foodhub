// server/api/group-cart/[groupId].ts
const groupCartStorage = new Map<string, any[]>()

export default defineEventHandler(async (event) => {
  const groupId = getRouterParam(event, 'groupId')
  if (!groupId) {
    throw createError({ statusCode: 400, statusMessage: '缺少 groupCartId' })
  }

  const method = event.method

  // 1. GET：主揪或訪客拉取目前該團購的「所有共享商品」
  if (method === 'GET') {
    return groupCartStorage.get(groupId) ?? []
  }

  // 2. POST：訪客按「確認加入團購」時，將商品連同訪客名稱合併進共享清單
  if (method === 'POST') {
    const body = await readBody<{ items: any[]; participantName?: string }>(event)
    const currentSharedItems = groupCartStorage.get(groupId) ?? []

    for (const incoming of body.items) {
      const participantName = incoming.userId
        ? incoming.userName
        : (body.participantName || incoming.userName || 'gust')

      // 比對「同一商品」且「同一位下單人（同 userId 或同訪客名稱）」
      const existing = currentSharedItems.find(
        i =>
          i.productId === incoming.productId &&
          (i.userId ?? undefined) === (incoming.userId ?? undefined) &&
          (i.userName ?? 'gust') === participantName
      )

      if (existing) {
        existing.qty += incoming.qty
      } else {
        currentSharedItems.push({
          ...incoming,
          groupCartId: groupId,
          userName: participantName,
          isGuest: !incoming.userId,
          submittedToGroup: true,
        })
      }
    }

    groupCartStorage.set(groupId, currentSharedItems)
    return currentSharedItems
  }

  // 3. PUT：主揪或訪客在購物車內增減數量、刪除商品時，同步更新整份共享清單
  if (method === 'PUT') {
    const body = await readBody<{ items: any[] }>(event)
    groupCartStorage.set(groupId, body.items ?? [])
    return body.items ?? []
  }
})
