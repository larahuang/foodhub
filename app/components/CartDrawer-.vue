<script setup lang="ts">
const router = useRouter()
const route = useRoute()
const cart = useCartStore()
const order = useOrderStore()
const currentUser = useCurrentUser()
// 監聽登入狀態：一旦登入，自動將團購內的訪客商品歸戶到登入者並合併數量
watch(
  () => currentUser.value?.id,
  (newId) => {
    if (newId) {
      cart.consolidateAndBindUser()
    }
  },
  { immediate: true }
)
const gotoRestaurant = (restId: number | string) => {
  cart.drawer = false
  router.push(getRestaurantLink(restId))
}
// 統一處理跳轉到餐廳頁面（若為團購餐廳，自動帶入 ?groupCartId=...）
const getRestaurantLink = (restId: number | string) => {
  const numericId = Number(restId)
  const groupOrder = cart.groupOrders[numericId]

  return {
    path: `/restaurants/${numericId}/menu`, // 補回 /menu
    query: groupOrder ? { groupCartId: groupOrder.groupCartId } : {},
  }
}


</script>

<template>
  <v-navigation-drawer v-model="cart.drawer" location="right" temporary width="360">
    <div class="pa-4 d-flex align-center">
      <h2 class="text-h6">購物車</h2>
      <v-spacer />
      <v-btn icon="mdi-close" variant="text" size="small" @click="cart.drawer = false" />
    </div>
    <v-divider />

    <div v-if="!cart.items.length" class="pa-8 text-center text-medium-emphasis">
      購物車是空的
    </div>

    <!-- CartDrawer.vue 列表區塊修改範例 -->
<div v-else class="pa-3">
  <v-card 
    v-for="(items, restId) in cart.cartsByRestaurant" 
    :key="restId" 
    variant="outlined" 
    class="mb-4"
  >
  <!-- 動態標題與團購網址 -->
        <v-card-title class="text-subtitle-1 font-weight-bold bg-grey-lighten-4 pa-0">
          <NuxtLink 
            :to="getRestaurantLink(restId)" 
            class="restaurant-link d-flex align-center justify-space-between px-4 py-3 text-decoration-none text-high-emphasis"
            @click="cart.drawer = false"
          >
            <span>
              {{ cart.groupOrders[Number(restId)]?.isMerged ? '餐廳團購' : '餐廳' }} #{{ restId }}
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
    <!-- <v-card-title class="text-subtitle-1 font-weight-bold bg-grey-lighten-4">
     <NuxtLink 
        :to="`/restaurants/${restId}/menu`" 
        class="restaurant-link d-flex align-center justify-space-between px-4 py-3"
        @click="cart.drawer = false"
      >
      餐廳 #{{ restId }}
    </NuxtLink>
    </v-card-title> -->
    
    <v-list density="compact">
      <v-list-item v-for="item in items" :key="`${item.productId}-${item.groupCartId || 'normal'}-${item.userId || 'guest'}`">
        <template #prepend>
          <span class="text-h6 mr-2">{{ item.emoji }}</span>
        </template>
        <v-list-item-title>{{ item.name }}</v-list-item-title>
        <v-list-item-subtitle>${{ item.unitPrice }} × {{ item.qty }}</v-list-item-subtitle>
         <!-- 若有使用者資訊，顯示使用者姓名與 ID -->
      <div v-if="item.userName || item.userId" class="text-caption text-primary mt-1">
        <v-icon icon="mdi-account-outline" size="x-small" class="mr-1" />
        {{ item.userName }} (ID: {{ item.userId }})
      </div>
        <template #append>
          <v-btn icon="mdi-minus" size="x-small" variant="tonal" @click="cart.decrease(item.productId, item.groupCartId, item.userId)" />
          <v-btn icon="mdi-delete-outline" size="x-small" variant="text" class="ml-1" @click="cart.remove(item.productId, item.groupCartId, item.userId)" />
        </template>
      </v-list-item>
    </v-list>

    <v-divider />
    <div class="pa-3">
      <div class="d-flex mb-2 text-body-2">
        <span>小計</span>
        <v-spacer />
        <strong>${{ items.reduce((s, i) => s + i.unitPrice * i.qty, 0).toFixed(2) }}</strong>
      </div>
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


    <template v-if="cart.items.length" #append>
      <div class="pa-4">
        <div v-if="currentUser" class="text-caption text-medium-emphasis mb-2">
          外送至：{{ currentUser.address }}
        </div>
        <div class="d-flex mb-3">
          <span>小計</span>
          <v-spacer />
          <strong>${{ cart.total.toFixed(2) }}</strong>
        </div>
        <v-btn block color="primary" size="large" :loading="order.submitting" @click="order.placeOrder()">
          結帳
        </v-btn>
      </div>
    </template>
  </v-navigation-drawer>
</template>
