<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const id = Number(route.params.id)
const cart = useCartStore()
const { data: restaurant } = await useFetch<Restaurant>(`/api/restaurants/${id}`)
// 1. 進入頁面時，若該餐廳已有發起團購但網址沒帶參數，自動補上 ?groupCartId=...
onMounted(() => {
  const existingGroup = cart.groupOrders[id]
  if (existingGroup && route.query.groupCartId !== existingGroup.groupCartId) {
    router.replace({
      query: { ...route.query, groupCartId: existingGroup.groupCartId }
    })
  }
})
const tab = ref('order')
const selected = ref<string>()

const { data: menu, status, refresh } = await useFetch('/api/menu', {
  query: { restaurantId: id, category: selected.value },
})
watch(selected, () => refresh())

const activeCategory = computed(() => selected.value ?? menu.value?.categories[0])

const copied = ref(false)
// if (!cart.shareUrl || !cart.groupCartId) return
// 預設帶入當前網址，也可替換成自訂網址
const shareUrl = ref(window.location.href)

const copyUrl = async () => {
  try {
    router.push(cart.shareUrl)
   // 更新當前分頁網址，帶入正確的 groupCartId
    // await router.replace({
    //   query: { ...route.query, groupCartId: cart.groupCartId }
    // })
    // 複製包含完整網域與 ?groupCartId=... 的分享網址
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
    <!-- 跳出框 (Dialog) -->
      <v-dialog v-model="cart.showGroupAlert" max-width="500">
        <v-card title="分享此頁面" prepend-icon="mdi-link-variant">
          <v-card-text>
            <p class="text-body-2 text-medium-emphasis mb-3">
              點擊下方按鈕即可複製網址並分享給其他人：
            </p>

            <!-- 網址輸入框 + 內建複製按鈕 -->
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