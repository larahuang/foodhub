interface PlaceOrderResponse {
  ok: boolean
  orderId?: number
}

export const useOrderStore = defineStore('order', {
  state: () => ({
    submitting: false,
  }),

  actions: {
    async placeOrder(restaurantId?: number) {
      const auth = useAuthStore()
      const cart = useCartStore()
      if (!auth.user) {
        cart.drawer = false
        return navigateTo({ path: '/login', query: { redirect: useRoute().fullPath } })
      }

      // 若有指定 restaurantId 則只結帳該餐廳；若按「全部結帳」則取出全部購物車商品
      const targetItems = restaurantId !== undefined
        ? cart.items.filter(i => i.restaurantId === restaurantId)
        : cart.items

      if (!targetItems.length) return

      const targetTotal = targetItems.reduce((sum, i) => sum + i.unitPrice * i.qty, 0)

      // 取得該餐廳的團購編號（若有）
      const groupCartId = restaurantId !== undefined
        ? (cart.groupOrders[restaurantId]?.groupCartId ?? targetItems.find(i => i.groupCartId)?.groupCartId ?? null)
        : (targetItems.find(i => i.groupCartId)?.groupCartId ?? null)

      this.submitting = true
      try {
        const res = await $fetch<PlaceOrderResponse>('/api/orders', {
          method: 'POST',
          body: {
            userId: auth.user.id,
            restaurantId,
            groupCartId,
            address: auth.user.address,
            phone: auth.user.phone,
            // 完整帶上每個品項的 userName（主揪或各訪客名稱）與 groupCartId
            items: targetItems.map(i => ({
              productId: i.productId,
              name: i.name,
              qty: i.qty,
              unitPrice: i.unitPrice,
              userName: i.userName || auth.user.name,
              groupCartId: i.groupCartId || groupCartId,
            })),
            total: targetTotal,
          },
        })

        if (res.ok) {
          // 結帳成功：清空對應餐廳（或全部）購物車，並自動停止該餐廳的 2 秒智慧輪詢
          if (restaurantId !== undefined) {
            cart.clear(restaurantId)
          } else {
            cart.clear(undefined, true)
          }
          cart.drawer = false
          await navigateTo({
            path: '/orders/success',
            query: res.orderId ? { id: res.orderId } : {},
          })
        }
      } catch (err: any) {
        console.error('建立訂單失敗:', err)
        alert(err?.data?.statusMessage || err?.statusMessage || '建立訂單失敗，請稍後再試')
      } finally {
        this.submitting = false
      }
    },
  },
})
