<script setup lang="ts">
const route = useRoute()
const orderId = computed(() => route.query.id)

useSeoMeta({ title: '訂單已送出 - FoodHub' })
</script>

<template>
  <v-card max-width="480" class="mx-auto pa-8 text-center" variant="outlined">
    <div class="text-h2 mb-4">🎉</div>
    <h1 class="text-h5 font-weight-bold mb-2">訂單已送出！</h1>
    <p class="text-medium-emphasis mb-6">餐廳正在準備您的餐點</p>
   <!-- 判斷是否為團購訂單 -->
<div class="d-flex align-center gap-2 mb-3">
  <h2 class="text-h6">訂單 #{{ order.id }}</h2>
  <v-chip
    v-if="order.group_cart_id"
    size="small"
    color="primary"
    variant="tonal"
    prepend-icon="mdi-account-group"
  >
    團購訂單 ({{ order.group_cart_id }})
  </v-chip>
</div>

<!-- 餐點明細列表：顯示訂購人（主揪與訪客名稱） -->
<v-list density="compact">
  <v-list-item v-for="item in order.items" :key="item.id">
    <v-list-item-title>
      {{ item.name }} × {{ item.qty }}
    </v-list-item-title>
    <v-list-item-subtitle v-if="item.user_name">
      訂購人：{{ item.user_name }}
    </v-list-item-subtitle>
    <template #append>
      <strong>${{ (item.unit_price * item.qty).toFixed(2) }}</strong>
    </template>
  </v-list-item>
</v-list>
    <v-btn to="/" variant="outlined">回首頁</v-btn>
  </v-card>
</template>
