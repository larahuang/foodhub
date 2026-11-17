<script setup lang="ts">
const route = useRoute()
const cart = useCartStore()
const order = useOrderStore()
const currentUser = useCurrentUser()

// 自動確保團購狀態與 2 秒智慧輪詢已啟動
const ensureGroupStateAndPolling = async () => {
  const queryGroupId = typeof route.query.groupCartId === 'string' ? route.query.groupCartId : null
  const currentRestId = Number(route.params.id || route.params.restaurantId)

  // 1. 若網址帶有 groupCartId，確保該餐廳已註冊進 cart.groupOrders
  if (queryGroupId && currentRestId && !cart.groupOrders[currentRestId]) {
    await cart.syncGroupCartId(currentRestId, queryGroupId, true)
  }

  // 2. 檢查購物車內商品是否自帶 groupCartId，若有也補註冊進 groupOrders
  for (const item of cart.items) {
    if (item.groupCartId && !cart.groupOrders[item.restaurantId]) {
      await cart.syncGroupCartId(item.restaurantId, item.groupCartId, true)
    }
  }

  // 3. 對所有團購餐廳啟動 2 秒智慧輪詢並立即拉取最新數據
  const restIds = Object.keys(cart.groupOrders).map(Number)
  for (const rId of restIds) {
    cart.startSmartGroupPolling(rId)
  }
}

watch(
  () => cart.drawer,
  (isOpen) => {
    if (isOpen) {
      ensureGroupStateAndPolling()
    }
  }
)

onMounted(() => {
  ensureGroupStateAndPolling()
})

const getRestaurantLink = (restId: number | string) => {
  const numericId = Number(restId)
  const groupOrder = cart.groupOrders[numericId]

  return {
    path: `/restaurants/${numericId}/menu`,
    query: groupOrder ? { groupCartId: groupOrder.groupCartId } : {},
  }
}

// 判斷該餐廳是否有尚未送入主團購的訪客本地商品
const hasPendingGuestItems = (items: any[]) => {
  return items.some(i => !i.userId && !i.submittedToGroup)
}
</script>

<template>
  <!-- 訪客填寫名稱加入團購的彈窗 -->
  <v-dialog v-model="cart.showGuestNameDialog" max-width="400">
    <v-card title="新增到團購項目" prepend-icon="mdi-account-edit">
      <v-card-text>
        <p class="text-body-2 text-medium-emphasis mb-3">
          請輸入您的名稱，按下確認後將立即同步至主揪的團購購物車中：
        </p>
        <v-text-field
          v-model="cart.guestNickname"
          label="您的名稱（例如：小美、阿強）"
          placeholder="若留空將顯示為 gust"
          variant="outlined"
          autofocus
          hide-details
          @keyup.enter="cart.submitGuestItemsToGroup()"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="cart.showGuestNameDialog = false">取消</v-btn>
        <v-btn
          color="success"
          variant="elevated"
          :loading="cart.syncingGroup"
          @click="cart.submitGuestItemsToGroup()"
        >
          確認新增到團購
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-navigation-drawer v-model="cart.drawer" location="right" temporary width="380">
    <div class="pa-4 d-flex align-center">
      <h2 class="text-h6">購物車 ({{ cart.count }} 件)</h2>
      <v-spacer />
      <v-btn icon="mdi-close" variant="text" size="small" @click="cart.drawer = false" />
    </div>
    <v-divider />

    <div v-if="!cart.items.length" class="pa-8 text-center text-medium-emphasis">
      購物車是空的
    </div>

    <div v-else class="pa-3">
      <v-card
        v-for="(items, restId) in cart.cartsByRestaurant"
        :key="restId"
        variant="outlined"
        class="mb-4"
      >
        <!-- 餐廳標題 -->
        <v-card-title class="text-subtitle-1 font-weight-bold bg-grey-lighten-4 pa-0">
          <NuxtLink
            :to="getRestaurantLink(restId)"
            class="restaurant-link d-flex align-center justify-space-between px-4 py-3 text-decoration-none text-high-emphasis"
            @click="cart.drawer = false"
          >
            <span>
              {{ cart.groupOrders[Number(restId)] ? '餐廳團購' : '餐廳' }} #{{ restId }}
            </span>
            <v-chip
              v-if="cart.groupOrders[Number(restId)]"
              size="x-small"
              color="primary"
              variant="tonal"
            >
              團購中
            </v-chip>
          </NuxtLink>
        </v-card-title>

        <!-- 餐點列表 -->
        <v-list density="compact">
          <v-list-item
            v-for="(item, idx) in items"
            :key="`${item.productId}-${item.groupCartId || 'normal'}-${item.userId || item.userName}-${idx}`"
          >
            <template #prepend>
              <span class="text-h6 mr-2">{{ item.emoji }}</span>
            </template>

            <v-list-item-title class="font-weight-medium">
              {{ item.name }}
            </v-list-item-title>

            <v-list-item-subtitle>
              <div class="mt-1">
                ${{ item.unitPrice }} × {{ item.qty }} =
                <strong class="text-high-emphasis">${{ (item.unitPrice * item.qty).toFixed(2) }}</strong>
              </div>

              <!-- 顯示主揪名稱或各個訪客名稱 -->
              <div class="mt-1">
                <v-chip
                  v-if="item.userId"
                  size="x-small"
                  color="primary"
                  variant="tonal"
                  prepend-icon="mdi-crown"
                >
                  {{ item.userName }} (主揪)
                </v-chip>
                <v-chip
                  v-else
                  size="x-small"
                  :color="item.submittedToGroup ? 'success' : 'warning'"
                  variant="tonal"
                  prepend-icon="mdi-account-outline"
                >
                  訪客：{{ item.userName || 'gust' }}
                  <span v-if="!item.submittedToGroup" class="ml-1">(待送出)</span>
                </v-chip>
              </div>
            </v-list-item-subtitle>

            <template #append>
              <v-btn
                icon="mdi-minus"
                size="x-small"
                variant="tonal"
                @click="cart.decrease(item.productId, item.groupCartId, item.userId, item.userName)"
              />
              <v-btn
                icon="mdi-delete-outline"
                size="x-small"
                variant="text"
                class="ml-1"
                @click="cart.remove(item.productId, item.groupCartId, item.userId, item.userName)"
              />
            </template>
          </v-list-item>
        </v-list>

        <v-divider />

        <!-- 分組小計與操作按鈕 -->
        <div class="pa-3 bg-grey-lighten-5">
          <div
            v-for="(summary, idx) in cart.groupSummaryByRestaurant(Number(restId))"
            :key="idx"
            class="d-flex justify-space-between text-caption text-medium-emphasis mb-1"
          >
            <span>{{ summary.userLabel }} × {{ summary.qty }} 件</span>
            <span>${{ summary.subtotal.toFixed(2) }}</span>
          </div>

          <v-divider class="my-2" />

          <div class="d-flex mb-2 text-body-2">
            <span class="font-weight-bold">餐廳小計</span>
            <v-spacer />
            <strong class="text-primary">${{ cart.restaurantSubtotal(Number(restId)).toFixed(2) }}</strong>
          </div>

          <!-- 訪客模式：顯示「新增到團購項目」按鈕  v-if="!currentUser && (cart.groupOrders[Number(restId)] || items.some(i => i.groupCartId))" -->
          <v-btn
          
            block
            color="success"
            size="small"
            prepend-icon="mdi-account-multiple-plus"
            :disabled="!hasPendingGuestItems(items)"
            @click="cart.openGuestJoinDialog(Number(restId))"
          >
            {{ hasPendingGuestItems(items) ? '新增到團購項目' : '已新增到團購項目' }}
          </v-btn>

          <!-- 主揪（已登入會員）模式：顯示「結帳此餐廳」 v-else-if="currentUser" -->
          <v-btn
           
            block
            color="primary"
            size="small"
            :loading="order.submitting"
            @click="order.placeOrder(Number(restId))"
          >
            結帳此餐廳
          </v-btn>
        </div>
      </v-card>
    </div>

    <!-- 底部全購物車總額（訪客模式完全隱藏結帳按鈕） -->
    <template v-if="cart.items.length" #append>
      <div class="pa-4 border-t">
        <div v-if="currentUser" class="text-caption text-medium-emphasis mb-2">
          外送至：{{ currentUser.address }}
        </div>
        <div class="d-flex align-center mb-3">
          <span class="text-subtitle-1 font-weight-bold">總計金額 ({{ cart.count }} 件)</span>
          <v-spacer />
          <strong class="text-h6 text-primary">${{ cart.total.toFixed(2) }}</strong>
        </div>
        <!-- <v-btn
          v-if="currentUser"
          block
          color="primary"
          size="large"
          :loading="order.submitting"
          @click="order.placeOrder()"
        >
          全部結帳
        </v-btn> -->
      </div>
    </template>
  </v-navigation-drawer>
</template>
