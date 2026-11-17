export interface User {
  id: number
  email: string
  name: string
  phone: string
  address: string
}

export interface Restaurant {
  id: number
  name: string
  cuisine: string
  emoji: string
  rating: number
  delivery_minutes: number
  intro: string
}

export interface Product {
  id: number
  restaurant_id: number
  category: string
  name: string
  description: string
  emoji: string
  price: number
  stock: number | null
  is_veg: number
  is_spicy: number
}

export interface CartItem {
  productId: number
  groupCartId?: string | null
  userId?: number| null
  userName?: string | null
  restaurantId: number
  name: string
  emoji: string
  unitPrice: number
  qty: number
  isGuest?: boolean
  submittedToGroup?: boolean
  isLocalOwner?: boolean
}

export interface OrderItem {
  id: number
  order_id?: number
  product_id: number
  name: string
  qty: number
  unit_price: number
  user_name?: string | null     // 寫入資料庫的訂購人姓名（主揪或訪客名稱）
  group_cart_id?: string | null // 若需在明細層級也記錄團購編號可一併保留
}

export interface Order {
  id: number
  user_id: number
  total: number
  address: string
  phone: string
  status: string
  created_at: string
  group_cart_id?: string | null // 區分單一訂單 (null) 與團購訂單 (字串編號)
  items: OrderItem[]
}
