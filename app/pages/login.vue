<script setup lang="ts">
const auth = useAuthStore()
const cart = useCartStore()
const route = useRoute()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function onSubmit() {
  loading.value = true
  error.value = ''
  try {
    await auth.login(email.value, password.value)

    // 若網址有 redirect（例如從購物車按結帳導過來的），跳轉回去並自動展開購物車
    const redirectPath = route.query.redirect as string | undefined
    if (redirectPath) {
      cart.drawer = true
      await navigateTo(redirectPath)
    } else {
      await navigateTo('/')
    }
  } catch {
    error.value = '帳號或密碼錯誤'
  } finally {
    loading.value = false
  }
}

useSeoMeta({ title: '登入 - FoodHub' })
</script>

<template>
  <v-card max-width="420" class="mx-auto pa-4" variant="outlined">
    <v-card-title class="text-h5">登入</v-card-title>
    <v-card-text>
      <v-form @submit.prevent="onSubmit">
        <v-text-field v-model="email" label="Email" type="email" autocomplete="username" />
        <v-text-field v-model="password" label="密碼" type="password" autocomplete="current-password" />
        <v-alert v-if="error" type="error" density="compact" class="mb-4">{{ error }}</v-alert>
        <v-btn type="submit" color="primary" block size="large" :loading="loading">登入</v-btn>
      </v-form>
    </v-card-text>
  </v-card>
</template>
