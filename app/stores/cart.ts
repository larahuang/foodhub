
// 在模組層級維護計時器，避免將非序列化物件存入 Pinia state
let groupPollingTimer: ReturnType<typeof setInterval> | null = null
export const useCartStore = defineStore('cart', {
state: () => ({
    items: (typeof window !== 'undefined'
      ? JSON.parse(localStorage.getItem('cart') ?? '[]')
      : []) as CartItem[],
    drawer: false,
    groupOrders: (() => {
      if (typeof window === 'undefined') return {}
      const saved = JSON.parse(localStorage.getItem('groupOrders') ?? '{}')
      for (const restId in saved) {
        saved[restId].shareUrl = `${window.location.origin}/restaurants/${restId}/menu?groupCartId=${saved[restId].groupCartId}`
      }
      return saved
    })() as Record<number, { groupCartId: string; shareUrl: string; isMerged: boolean }>,
    groupCartId: null as string | null,
    shareUrl: null as string | null,
    showGroupAlert: false,
    showMergeConfirm: false,
    pendingGroupRestaurantId: null as number | null,
    groupDialogTitle: '分享此頁面',

    // 訪客填寫名稱加入團購的彈窗狀態
    showGuestNameDialog: false,
    guestJoinRestaurantId: null as number | null,
    guestNickname: '',
    syncingGroup: false,
    // 新增：智慧輪詢控制狀態
    pollingRestaurantId: null as number | null, // 正在監聽的餐廳 ID
    isPollingFetching: false,                   // 防止上一次 API 尚未完成時重複發送
    lastLocalMutationAt: 0,                     // 記錄本地最後一次操作時間，避免舊資料覆蓋新操作
  }),

  getters: {
    // 1. 全購物車總件數與總金額
    count: state => state.items.reduce((n, item) => n + item.qty, 0),
    total: state => state.items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0),

    // 2. 單一餐廳總金額計算
    restaurantSubtotal: (state) => (restaurantId: number) => {
      return state.items
        .filter(i => i.restaurantId === restaurantId)
        .reduce((sum, i) => sum + i.unitPrice * i.qty, 0)
    },
     // 3. 依「餐廳」分組的購物車列表
    cartsByRestaurant: (state) => {
      const groups: Record<number, any[]> = {}
      for (const item of state.items) {
        if (!groups[item.restaurantId]) {
          groups[item.restaurantId] = []
        }
        groups[item.restaurantId].push(item)
      }
      return groups
    },
    qtyOf: state => (productId: number) => state.items.find(i => i.productId === productId)?.qty ?? 0,
    // 4. 依「團購編號 (groupCartId) + 訂購人 (使用者或訪客)」分組計算小計
    groupSummaryByRestaurant: (state) => (restaurantId: number) => {
      const restItems = state.items.filter(i => i.restaurantId === restaurantId)
      const summaryMap: Record<
        string,
        {
          groupCartId?: string
          userLabel: string
          isGuest: boolean
          qty: number
          subtotal: number
        }
      > = {}

      for (const item of restItems) {
        const groupKey = item.groupCartId || 'personal'
        const userKey = item.userId ? `user-${item.userId}` : `guest-${item.userName || 'gust'}`
        const compositeKey = `${groupKey}_${userKey}`

        const userLabel = item.userId? `${item.userName} (#${item.userId})`
        : `訪客：${item.userName || 'gust'}`

        if (!summaryMap[compositeKey]) {
          summaryMap[compositeKey] = {
            groupCartId: item.groupCartId,
            userLabel,
            isGuest: !item.userId,
            qty: 0,
            subtotal: 0,
          }
        }

        summaryMap[compositeKey].qty += item.qty
        summaryMap[compositeKey].subtotal += item.unitPrice * item.qty
      }

      return Object.values(summaryMap)
    },
  },

  actions: {
    // ==========================================
    // 智慧輪詢控制區塊 (每 2 秒同步)
    // ==========================================
    startSmartGroupPolling(restaurantId: number) {
      if (typeof window === 'undefined') return
      if (!this.groupOrders[restaurantId]) return

      // 若已經在輪詢同一間餐廳，不重複建立計時器
      if (groupPollingTimer && this.pollingRestaurantId === restaurantId) {
        return
      }

      this.stopSmartGroupPolling()
      this.pollingRestaurantId = restaurantId

      // 啟動時立即拉取一次最新狀態
      this.fetchSharedGroupCart(restaurantId, true)

      groupPollingTimer = setInterval(async () => {
        // 1. 若該餐廳已無團購紀錄，自動停止輪詢
        if (!this.groupOrders[restaurantId]) {
          this.stopSmartGroupPolling()
          return
        }

        // 2. 瀏覽器分頁處於背景隱藏時暫停拉取，省資源
        if (typeof document !== 'undefined' && document.hidden) {
          return
        }

        // 3. 若主揪在過去 1.5 秒內剛修改過購物車，或正在送出訪客訂單，跳過本次輪詢避免覆蓋本地操作
        if (this.syncingGroup || Date.now() - this.lastLocalMutationAt < 1500) {
          return
        }

        // 4. 避免上一次 API 還沒回來就重複發送請求
        if (this.isPollingFetching) {
          return
        }

        await this.fetchSharedGroupCart(restaurantId, true)
      }, 2000)
    },
  stopSmartGroupPolling() {
      if (groupPollingTimer) {
        clearInterval(groupPollingTimer)
        groupPollingTimer = null
      }
      this.pollingRestaurantId = null
      this.isPollingFetching = false
    },
   // 4. 從伺服器拉取該團購的最新共享清單（支援智慧比對，避免無變動時無意義重繪）
    async fetchSharedGroupCart(restaurantId: number, isSilentPolling = false) {
      const groupOrder = this.groupOrders[restaurantId]
      if (!groupOrder) return

      if (isSilentPolling) {
        this.isPollingFetching = true
      }

      try {
        const auth = useAuthStore()
        const currentUserId = auth.user?.id

        const rawSharedItems = await $fetch<CartItem[]>(`/api/group-cart/${groupOrder.groupCartId}`)

        // 雙重檢查：若請求期間本地剛發生操作，放棄這次舊資料寫入
        if (isSilentPolling && Date.now() - this.lastLocalMutationAt < 1200) {
          return
        }

        const sharedItems = rawSharedItems.map(item => ({
          ...item,
          // 若為主揪自己的商品保留 isLocalOwner: true，其餘成員標記為 false
          isLocalOwner: !!(currentUserId && item.userId === currentUserId),
        }))

        // 若是未登入訪客，保留本地還沒按「加入團購項目」暫存的 'gust' 商品
        const pendingLocalGuestItems = !auth.user
          ? this.items.filter(i => i.restaurantId === restaurantId && !i.userId && !i.submittedToGroup)
          : []

        const otherRestItems = this.items.filter(i => i.restaurantId !== restaurantId)
        const nextItems = [...otherRestItems, ...sharedItems, ...pendingLocalGuestItems]

        // 智慧差異比對：只有資料真正有變化時才更新響應式狀態與 localStorage
        if (JSON.stringify(this.items) !== JSON.stringify(nextItems)) {
          this.items = nextItems
          this.saveLocalOnly()

          // 若為主揪登入狀態，同步更新主揪帳號的雲端購物車備份
          if (auth.user) {
            $fetch('/api/cart', {
              method: 'PUT',
              body: { userId: auth.user.id, items: this.items },
            }).catch(() => {})
          }
        }
      } catch (err) {
        if (!isSilentPolling) {
          console.error('取得共享團購失敗:', err)
        }
      } finally {
        if (isSilentPolling) {
          this.isPollingFetching = false
        }
      }
    },
// 1. 訪客點擊「加入團購項目」時，打開名稱輸入框
    openGuestJoinDialog(restaurantId: number) {
      this.guestJoinRestaurantId = restaurantId
      this.showGuestNameDialog = true
    },
  // async 訪客確認名稱後，將本地暫存商品帶上訪客名稱送入共享團購伺服器
    // 2. 訪客確認名稱後，將本地暫存商品帶上訪客名稱送入共享團購伺服器
    async submitGuestItemsToGroup() {
      const restId = this.guestJoinRestaurantId
      if (!restId) return

      const groupOrder = this.groupOrders[restId]
      if (!groupOrder) return

      const finalGuestName = this.guestNickname.trim() || 'gust'

      // 取出該餐廳所有尚未送出到伺服器的本地訪客商品
      const guestLocalItems = this.items.filter(
        i => i.restaurantId === restId && !i.userId && !i.submittedToGroup
      )

      if (!guestLocalItems.length) {
        this.showGuestNameDialog = false
        return
      }

      // 強制補齊 groupCartId 與訪客身份標記，並合併本地相同品項數量
      const mergedPayloadMap = new Map<number, CartItem>()
      for (const item of guestLocalItems) {
        const existing = mergedPayloadMap.get(item.productId)
        if (existing) {
          existing.qty += item.qty
        } else {
          mergedPayloadMap.set(item.productId, {
            ...item,
            groupCartId: groupOrder.groupCartId,
            userName: finalGuestName,
            isGuest: true,
            submittedToGroup: true,
          })
        }
      }
      const itemsToSubmit = Array.from(mergedPayloadMap.values())

      this.syncingGroup = true
      this.lastLocalMutationAt = Date.now()
      try {
        // 1. 將訪客餐點寫入共享團購伺服器
        await $fetch(`/api/group-cart/${groupOrder.groupCartId}`, {
          method: 'POST',
          body: {
            participantName: finalGuestName,
            items: itemsToSubmit,
          },
        })

        // 2. 先標記本地暫存項目為已送出，避免 fetchSharedGroupCart 把它當成未送出重複保留
        this.items = this.items.map(i =>
          i.restaurantId === restId && !i.userId && !i.submittedToGroup
            ? {
                ...i,
                groupCartId: groupOrder.groupCartId,
                userName: finalGuestName,
                submittedToGroup: true,
              }
            : i
        )
        this.groupOrders[restId].isMerged = true
        this.saveGroupOrders()
        this.saveLocalOnly()

        this.showGuestNameDialog = false

        // 3. 立即向伺服器拉取合併後的完整團購清單，並啟動每 2 秒智慧輪詢
        await this.fetchSharedGroupCart(restId)
        this.startSmartGroupPolling(restId)
      } catch (err) {
        console.error('加入團購失敗:', err)
      } finally {
        this.syncingGroup = false
        this.lastLocalMutationAt = Date.now()
      }
    },


    // 3. 將該餐廳目前的團購商品推送到共享伺服器
    async pushGroupCartToServer(restaurantId: number) {
      const groupOrder = this.groupOrders[restaurantId]
      if (!groupOrder) return

      this.lastLocalMutationAt = Date.now()

      // 只推送已確認進入團購的品項（包含主揪商品與已送出的訪客商品）
      const restGroupItems = this.items.filter(
        i =>
          i.restaurantId === restaurantId &&
          i.groupCartId === groupOrder.groupCartId &&
          (i.userId || i.submittedToGroup)
      )

      try {
        await $fetch(`/api/group-cart/${groupOrder.groupCartId}`, {
          method: 'PUT',
          body: { items: restGroupItems },
        })
      } catch (err) {
        console.error('同步團購狀態失敗:', err)
      } finally {
        this.lastLocalMutationAt = Date.now()
      }
    },
   
    // 5. 統一同步方法：確保 groupOrders 與 items 內的 groupCartId 絕對同一筆相同
    async syncGroupCartId(restaurantId: number, groupCartId: string, isMerged = true) {
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const cleanShareUrl = `${origin}/restaurants/${restaurantId}/menu?groupCartId=${groupCartId}`

      this.groupOrders[restaurantId] = {
        groupCartId,
        shareUrl: cleanShareUrl,
        isMerged,
      }
      this.saveGroupOrders()

      let itemsUpdated = false
      this.items.forEach(item => {
        if (item.restaurantId === restaurantId && item.groupCartId !== groupCartId) {
          item.groupCartId = groupCartId
          itemsUpdated = true
        }
      })

      if (itemsUpdated) {
        await this.consolidateAndBindUser()
      }

      this.groupCartId = groupCartId
      this.shareUrl = cleanShareUrl

      // 若為主揪已登入且有合併商品，立即同步推送到伺服器給訪客看
      const auth = useAuthStore()
      if (auth.user?.id && itemsUpdated) {
        await this.pushGroupCartToServer(restaurantId)
      }
      // 啟動每 2 秒智慧輪詢，即時接收訪客加入的新項目
      this.startSmartGroupPolling(restaurantId)
    },
    // 6. 新增商品：若未登入（訪客），自動沿用已輸入的訪客名稱（預設 'gust'）與該餐廳的 groupCartId
    add(product: Product) {
      this.lastLocalMutationAt = Date.now()
      const auth = useAuthStore()
      const isLoggedIn = !!auth.user?.id
      const currentUserId = isLoggedIn ? auth.user!.id : undefined
      const currentGuestName = this.guestNickname.trim() || 'gust'
      const currentUserName = isLoggedIn ? auth.user!.name : currentGuestName
      const targetGroupId = this.groupOrders[product.restaurant_id]?.groupCartId

      const existing = this.items.find(
        i =>
          i.restaurantId === product.restaurant_id &&
          i.productId === product.id &&
          i.groupCartId === targetGroupId &&
          (isLoggedIn
            ? i.userId === currentUserId
            : !i.userId && i.isLocalOwner === true && !i.submittedToGroup)
      )

      if (existing) {
        existing.qty++
      } else {
        this.items.push({
          ...(targetGroupId ? { groupCartId: targetGroupId } : {}),
          ...(isLoggedIn
            ? {
                userId: currentUserId,
                userName: currentUserName,
                isGuest: false,
                isLocalOwner: true,
                submittedToGroup: true,
              }
            : {
                userName: currentGuestName,
                isGuest: true,
                isLocalOwner: true, // 標記為本機訪客親自點的餐點，登入後必定合併歸戶
                submittedToGroup: false,
              }),
          productId: product.id,
          restaurantId: product.restaurant_id,
          name: product.name,
          emoji: product.emoji,
          unitPrice: product.price,
          qty: 1,
        })
      }

      this.save()
      if (isLoggedIn && targetGroupId) {
        this.pushGroupCartToServer(product.restaurant_id)
      }
    },


      // 精準減少數量
    decrease(productId: number, groupCartId?: string | null, userId?: number | null, userName?: string | null) {
      this.lastLocalMutationAt = Date.now()
      const existing = this.items.find(
        i =>
          i.productId === productId &&
          (i.groupCartId ?? undefined) === (groupCartId ?? undefined) &&
          (i.userId ?? undefined) === (userId ?? undefined) &&
          (i.userName ?? 'gust') === (userName ?? 'gust')
      )
      if (!existing) return

      const restId = existing.restaurantId
      const wasSubmitted = existing.submittedToGroup
      existing.qty--

      if (existing.qty <= 0) {
        this.remove(productId, groupCartId, userId, userName)
      } else {
        this.save()
        if (groupCartId && (userId || wasSubmitted)) {
          this.pushGroupCartToServer(restId)
        }
      }
    },

  // 8. 精準刪除品項（支援區分不同訪客名稱，並同步伺服器）
    remove(productId: number, groupCartId?: string | null, userId?: number | null, userName?: string | null) {
      this.lastLocalMutationAt = Date.now() 
      const target = this.items.find(
        i =>
          i.productId === productId &&
          (i.groupCartId ?? undefined) === (groupCartId ?? undefined) &&
          (i.userId ?? undefined) === (userId ?? undefined) &&
          (i.userName ?? 'gust') === (userName ?? 'gust')
      )
        if (!target) return
      const restId = target.restaurantId
      const wasSubmitted = target.submittedToGroup
      this.items = this.items.filter(i => i !== target)
      this.save()
      if (groupCartId && (userId || wasSubmitted)) {
      this.pushGroupCartToServer(restId)
      }
    },

    // 防止登入/登出流程中誤呼叫 clear() 導致整個購物車被清空
    clear(restaurantId?: number, forceAll = false) {
      if (restaurantId !== undefined) {
        this.items = this.items.filter(i => i.restaurantId !== restaurantId)
        delete this.groupOrders[restaurantId]
         if (this.pollingRestaurantId === restaurantId) {
          this.stopSmartGroupPolling() // ✅ 建議補上這行
        }
      } else if (forceAll) {
        this.items = []
        this.groupOrders = {}
        this.stopSmartGroupPolling() // ✅ 建議補上這行
      } else {
        // 未指定餐廳且未強制全清時，直接返回不清空
        return
      }
      this.saveGroupOrders()
      this.save()
    },
    // 10. 合併與綁定邏輯
    async consolidateAndBindUser() {
      const auth = useAuthStore()
      const isLoggedIn = !!auth.user?.id
      const merged: any[] = []
      const affectedGroupRestaurants = new Set<number>()

      for (const rawItem of this.items) {
        // 只要沒有 userId，且屬於本機建立的訪客餐點（或尚未被其他團購訪客認領），登入後一律歸戶給該會員
        const shouldBindToCurrentUser =
          isLoggedIn && !rawItem.userId && (rawItem.isLocalOwner !== false || !rawItem.submittedToGroup)

        const item = isLoggedIn
          ? {
              ...rawItem,
              userId: shouldBindToCurrentUser ? auth.user!.id : rawItem.userId,
              userName: shouldBindToCurrentUser
                ? auth.user!.name
                : (rawItem.userName || auth.user!.name),
              isGuest: shouldBindToCurrentUser ? false : !rawItem.userId,
              submittedToGroup: true,
            }
          : {
              ...rawItem,
              userName: rawItem.userName || 'gust',
              isGuest: !rawItem.userId,
            }

        // 記錄需要同步更新到共享團購伺服器的餐廳
        if (isLoggedIn && item.groupCartId) {
          affectedGroupRestaurants.add(item.restaurantId)
        }

        // 合併「同餐廳、同商品、同 groupCartId、同會員 userId」的數量
        const existing = merged.find(
          m =>
            m.restaurantId === item.restaurantId &&
            m.productId === item.productId &&
            (m.groupCartId ?? undefined) === (item.groupCartId ?? undefined) &&
            (m.userId ?? undefined) === (item.userId ?? undefined) &&
            (m.userName ?? 'gust') === (item.userName ?? 'gust')
        )

        if (existing) {
          existing.qty += item.qty
        } else {
          merged.push(item)
        }
      }

      this.items = merged
      this.save()

      // 若該餐廳為團購，立即將合併後的最新會員餐點同步推送到共享團購伺服器
      if (isLoggedIn && affectedGroupRestaurants.size > 0) {
        for (const restId of affectedGroupRestaurants) {
          await this.pushGroupCartToServer(restId)
          this.startSmartGroupPolling(restId)
        }
      }
    },
    // 登入後從伺服器同步資料時，一併合併本地訪客團購商品與雲端會員商品
    // ✅ 必須修改：登入後載入購物車，絕對不能直接覆蓋本地原本的 items
  async loadFromServer() {
      try {
        // 1. 取得本地所有尚未綁定帳號的商品（包含未登入按團購所點的餐點）
        const localSavedItems = (typeof window !== 'undefined'
          ? JSON.parse(localStorage.getItem('cart') ?? '[]')
          : []) as CartItem[]
        const currentLocalItems = this.items.length > 0 ? this.items : localSavedItems

        // 2. 拉取帳號原本在雲端的購物車數據
        const serverItems = await $fetch<CartItem[]>('/api/cart')

        // 3. 合併雲端數據與本地訪客數據（不覆蓋）
        this.items = [...(Array.isArray(serverItems) ? serverItems : []), ...currentLocalItems]

        // 4. 執行訪客歸戶、相同商品數量加總，並同步寫回伺服器與團購共享清單
        await this.consolidateAndBindUser()
      } catch (err) {
        console.error('載入雲端購物車失敗，保留本地購物車並合併:', err)
        await this.consolidateAndBindUser()
      }
    },
    // 點擊「發起團購」按鈕
    startGroupOrder(restaurantId?: number) {
      if (!restaurantId) return

      // 檢查該餐廳購物車中，是否已有「尚未加入團購」的個人商品
      const hasExistingNormalItems = this.items.some(i =>
         i.restaurantId === restaurantId && !i.groupCartId
      )

      // 尚未建立團購，且購物車內已有該餐廳商品 => 跳出警告框詢問
      if (!this.groupOrders[restaurantId] && hasExistingNormalItems) {
        this.pendingGroupRestaurantId = restaurantId
        this.showMergeConfirm = true
        return
      }

      // 購物車原本是空的（或已建立過團購）=> 直接開啟分享彈窗
      const existingGroup = this.groupOrders[restaurantId]
      this.groupDialogTitle = existingGroup?.isMerged ? '餐廳團購' : '分享此頁面'
      this.activateGroupOrder(restaurantId, false)
    },
    // 使用者在警告視窗點擊「是」或「否」加入團購，後的處理
    confirmMergeGroupOrder(shouldMerge: boolean) {
      const restaurantId = this.pendingGroupRestaurantId
      this.showMergeConfirm = false
      this.pendingGroupRestaurantId = null

      if (!restaurantId) return

      if (shouldMerge) {
        // 選擇「是」：併入原本購物車，標題改為「餐廳團購」
        this.groupDialogTitle = '餐廳團購'
        this.activateGroupOrder(restaurantId, true)
      }
      // 選擇「否」：保持原狀，直接結束

    
    },
    
   // 修改 activateGroupOrder：統一呼叫 syncGroupCartId
    activateGroupOrder(restaurantId: number, mergeExisting: boolean) {
      // 若該餐廳尚未有團購編號，產生唯一一組；若已存在，直接沿用舊的
      let targetGroupId = this.groupOrders[restaurantId]?.groupCartId

      if (!targetGroupId) {
        const now = new Date()
        const currentYear = now.getFullYear()
        const currentMonth = String(now.getMonth() + 1).padStart(2, '0')
        const currentDate = String(now.getDate()).padStart(2, '0')
        targetGroupId = `${currentYear}-${currentMonth}-${currentDate}-${restaurantId}-${Date.now()}`
      }

      // 呼叫統一同步方法：若 mergeExisting 為 true，會將 items 內的商品全部同步為同一個 targetGroupId
      if (mergeExisting || !this.groupOrders[restaurantId]) {
        this.syncGroupCartId(restaurantId, targetGroupId, mergeExisting)
      } else {
        this.groupCartId = this.groupOrders[restaurantId].groupCartId
        this.shareUrl = this.groupOrders[restaurantId].shareUrl
        this.startSmartGroupPolling(restaurantId)
      }

      this.showGroupAlert = true
    },

    saveGroupOrders() {
      if (typeof window !== 'undefined') {
        localStorage.setItem('groupOrders', JSON.stringify(this.groupOrders))
      }
    },
    saveLocalOnly() {
      if (typeof window !== 'undefined') {
      localStorage.setItem('cart', JSON.stringify(this.items))
      }
    },
    save() {
      this.saveLocalOnly()
      const auth = useAuthStore()
      if (auth.user) {
        $fetch('/api/cart', {
          method: 'PUT',
          body: { userId: auth.user.id, items: this.items },
        })
      }
    },
  },
})
