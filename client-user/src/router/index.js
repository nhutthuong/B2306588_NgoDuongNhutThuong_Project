import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
    meta: { title: 'Trang chủ - Danh sách sách' },
  },
  {
    path: '/books/:maSach',
    name: 'book-detail',
    component: () => import('../views/BookDetailView.vue'),
    meta: { title: 'Chi tiết sách' },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { title: 'Đăng nhập độc giả' },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('../views/RegisterView.vue'),
    meta: { title: 'Đăng ký tài khoản' },
  },
  {
    path: '/my-borrowings',
    name: 'my-borrowings',
    component: () => import('../views/MyBorrowingsView.vue'),
    meta: { requiresAuth: true, title: 'Lịch sử mượn sách' },
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('../views/ProfileView.vue'),
    meta: { requiresAuth: true, title: 'Hồ sơ độc giả' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('../views/NotFoundView.vue'),
    meta: { title: 'Không tìm thấy trang' },
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

// Navigation guard
router.beforeEach((to, from, next) => {
  // Cap nhat tieu de trang
  if (to.meta.title) {
    document.title = `${to.meta.title} — Thư viện điện tử`;
  }

  // TODO (P1-5): Kiem tra authStore.isAuthenticated va vai tro khi backend hoan thanh Phase 1
  // const requiresAuth = to.meta.requiresAuth;
  // const roles = to.meta.roles;
  // if (requiresAuth && !authStore.isAuthenticated) {
  //   return next({ name: 'login', query: { redirect: to.fullPath } });
  // }

  // Giai doan P0-5: chua chan ai, cho phep di tiep de kiem tra giao dien
  next();
});

export default router;
