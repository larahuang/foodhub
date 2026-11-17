export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
  }),

  getters: {
    isLoggedIn: state => !!state.user,
  },

  actions: {
    async login(email: string, password: string) {
      this.user = await $fetch<User>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      })
      useCurrentUser().value = this.user

      // 已實作合併：將本地訪客 ('gust') 與團購購物車跟帳號購物車合併，不覆蓋清空
      await useCartStore().loadFromServer()
    },

    async logout() {
      await $fetch('/api/auth/logout', { method: 'POST' })
      this.user = null
      useCurrentUser().value = null
     //. 避免登出時把本地購物車清掉
      // 若希望登出後將畫面上的會員標籤轉回訪客狀態，可呼叫下方方法（不清除商品）
      useCartStore().saveLocalOnly()
    },
  },
})
