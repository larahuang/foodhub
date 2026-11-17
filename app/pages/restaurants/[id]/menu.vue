<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const id = Number(route.params.id)
const cart = useCartStore()
const { data: restaurant } = await useFetch<Restaurant>(`/api/restaurants/${id}`)
// 1. 進入頁面時，若該餐廳已有發起團購但網址沒帶參數，自動補上 ?groupCartId=...
// ✅ 訪客透過分享網址 (?groupCartId=...) 進入時，自動將團購編號綁定到該餐廳
// 統一讀取網址上的 groupCartId 並綁定到該餐廳
const bindGroupFromUrl = async () => {
  const urlGroupId = route.query.groupCartId as string | undefined
  if (urlGroupId) {
    await cart.syncGroupCartId(id, urlGroupId, true)
    await cart.fetchSharedGroupCart(id) // 立即從伺服器拉取主揪與其他訪客的餐點
  } else if (cart.groupOrders[id]) {
    const existingGroupId = cart.groupOrders[id].groupCartId
    await cart.syncGroupCartId(id, existingGroupId, cart.groupOrders[id].isMerged)
    await cart.fetchSharedGroupCart(id)
  }
}
// 若在同頁面切換網址參數，也即時同步
watch(() => route.query.groupCartId, () => {
  bindGroupFromUrl()
})
onMounted(() => {
  bindGroupFromUrl()
  // const urlGroupId = route.query.groupCartId as string | undefined

  // if (urlGroupId) {
  //   // 情況 A：網址帶有 groupCartId（例如訪客點分享連結進來），強制同步 groupOrders 與 items 為同一筆
  //   cart.syncGroupCartId(id, urlGroupId, true)
  // } else if (cart.groupOrders[id]) {
  //   // 情況 B：網址沒帶參數，但本地該餐廳已有團購紀錄，同步 items 並補上網址列參數
  //   const existingGroupId = cart.groupOrders[id].groupCartId
  //   cart.syncGroupCartId(id, existingGroupId, cart.groupOrders[id].isMerged)
  //   router.replace({
  //     path: `/restaurants/${id}/menu`,
  //     query: { ...route.query, groupCartId: existingGroupId },
  //   })
  // }
})
const tab = ref('order')
const selected = ref<string>()

const { data: menu, status, refresh } = await useFetch('/api/menu', {
  query: { restaurantId: id, category: selected.value },
})
watch(selected, () => refresh())

const activeCategory = computed(() => selected.value ?? menu.value?.categories[0])

const copied = ref(false)
// ✅ 修正：改用 Nuxt 內建的 useRequestURL()，SSR 伺服器端與瀏覽器端皆可安全執行
const requestUrl = useRequestURL()
const shareUrl = ref(requestUrl.href)

const copyUrl = async () => {
  if (!cart.groupCartId) return
  try {
    // 加上 /menu 避免 404
    const cleanShareUrl = `${window.location.origin}/restaurants/${id}/menu?groupCartId=${cart.groupCartId}`
    cart.shareUrl = cleanShareUrl
    // router.push(cart.shareUrl)
   await router.replace({
      path: `/restaurants/${id}/menu`,
      query: { groupCartId: cart.groupCartId },
    })
    await navigator.clipboard.writeText(cart.shareUrl)

    copied.value = true
    // 2 秒後恢復成原本的「複製」按鈕狀態
    setTimeout(() => {
      copied.value = false
    }, 2000)
  } catch (err) {
    console.error('複製失敗:', err)
  }
}
useSeoMeta({ title: () => `${restaurant.value?.name ?? '餐廳'} - FoodHub` })
</script>

<template>
<!-- 1. 新增：購物車已有商品時的警告確認框 -->
<v-dialog v-model="cart.showMergeConfirm" max-width="420" persistent>
  <v-card title="發起團購提醒" prepend-icon="mdi-alert-circle-outline">
    <v-card-text class="text-body-1">
      購物車內已有此餐廳的餐點，發起團購是否要將<strong>原購物車商品一併加入團購</strong>？
    </v-card-text>
    <v-card-actions>
      <v-spacer />
      <!-- 點擊「否」：保持原狀 -->
      <v-btn variant="text" color="grey" @click="cart.confirmMergeGroupOrder(false)">
        否
      </v-btn>
      <!-- 點擊「是」：加入 groupCartId 並改標題為「餐廳團購」 -->
      <v-btn variant="tonal" color="primary" @click="cart.confirmMergeGroupOrder(true)">
        是，加入團購
      </v-btn>
    </v-card-actions>
  </v-card>
</v-dialog>

<!-- 2. 原本的分享網址跳出框（標題改為動態綁定 cart.groupDialogTitle） -->
<v-dialog v-model="cart.showGroupAlert" max-width="500">
  <v-card :title="cart.groupDialogTitle" prepend-icon="mdi-link-variant">
    <v-card-text>
      <p class="text-body-2 text-medium-emphasis mb-3">
        點擊下方按鈕即可複製網址並分享給其他人：
      </p>

      <v-text-field
        v-model="cart.shareUrl"
        label="頁面網址"
        variant="outlined"
        readonly
        hide-details
        @focus="$event.target.select()"
      >
        <template v-slot:append-inner>
          <v-btn
            :color="copied ? 'success' : 'primary'"
            :prepend-icon="copied ? 'mdi-check' : 'mdi-content-copy'"
            variant="tonal"
            size="small"
            @click="copyUrl"
          >
            {{ copied ? '已複製' : '複製' }}
          </v-btn>
        </template>
      </v-text-field>
    </v-card-text>

    <v-card-actions>
      <v-spacer />
      <v-btn variant="text" @click="cart.showGroupAlert = false">關閉</v-btn>
    </v-card-actions>
  </v-card>
</v-dialog>
<!--餐廳名稱-->
  <div v-if="restaurant">
    <section class="d-flex align-center mb-4">
      <span class="text-h2 mr-4">{{ restaurant.emoji }}</span>
      <div>
        <h1 class="text-h4 font-weight-bold">{{ restaurant.id }}-{{ restaurant.name }}</h1>
        <div class="text-medium-emphasis">
          {{ restaurant.cuisine }} · ⭐ {{ restaurant.rating }} · {{ restaurant.delivery_minutes }} 分鐘
        </div>
        <RestaurantIntro :intro="restaurant.intro" class="mt-2" />
      </div>

        <!-- 新增：團購按鈕 -->
      <v-btn
        color="primary"
        variant="tonal"
        prepend-icon="mdi-account-group"
        @click="cart.startGroupOrder(restaurant.id)"
      >
      {{ restaurant.id }}
        發起團購
      </v-btn>
    </section>

    <v-tabs v-model="tab" color="primary" class="mb-4">
      <v-tab value="order">Order Online</v-tab>
      <v-tab value="reviews">Reviews</v-tab>
    </v-tabs>

    <v-window v-model="tab">
      <v-window-item value="order">
        <v-row>
          <v-col cols="12" md="3">
            <v-list nav density="compact" class="border rounded">
              <v-list-item
                v-for="c in menu?.categories"
                :key="c"
                :title="c"
                :active="c === activeCategory"
                color="primary"
                @click="selected = c"
              />
            </v-list>
          </v-col>

          <v-col cols="12" md="9">
            <h2 class="text-h6 mb-4">{{ activeCategory }}</h2>
            <v-progress-linear v-if="status === 'pending'" indeterminate color="primary" class="mb-4" />
            <v-row>
              <v-col v-for="p in menu?.products" :key="p.id" cols="12" sm="6" lg="4">
                <ProductCard :product="p" />
              </v-col>
            </v-row>
          </v-col>
        </v-row>
      </v-window-item>

      <v-window-item value="reviews">
        <div class="text-medium-emphasis pa-8 text-center">尚無評論</div>
      </v-window-item>
    </v-window>
  </div>
</template>

<style scoped>
.custom-top-alert {
  /* Vuetify 的 v-dialog 預設 z-index 約為 2400，設為 3000 可確保蓋過彈窗與導覽列 */
  z-index: 3000;
  max-width: 400px;
}
</style>