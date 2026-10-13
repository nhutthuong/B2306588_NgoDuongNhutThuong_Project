import { createRouter, createWebHistory } from 'vue-router';
import DashboardView from '../views/DashboardView.vue';

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { title: 'Đăng nhập Quản trị', layout: 'auth' },
  },
  {
    path: '/',
    name: 'dashboard',
    component: DashboardView,
    meta: { requiresAuth: true, title: 'Bảng điều khiển (Dashboard)' },
  },
  {
    path: '/books',
    name: 'books',
    component: () => import('../views/BooksView.vue'),
    meta: { requiresAuth: true, title: 'Quản lý Sách' },
  },
  {
    path: '/books/new',
    name: 'book-create',
    component: () => import('../views/BookCreateView.vue'),
    meta: { requiresAuth: true, title: 'Thêm Sách mới' },
  },
  {
    path: '/books/:maSach/edit',
    name: 'book-edit',
    component: () => import('../views/BookEditView.vue'),
    meta: { requiresAuth: true, title: 'Chỉnh sửa Sách' },
  },
  {
    path: '/publishers',
    name: 'publishers',
    component: () => import('../views/PublishersView.vue'),
    meta: { requiresAuth: true, title: 'Nhà xuất bản' },
  },
  {
    path: '/borrowings',
    name: 'borrowings',
    component: () => import('../views/BorrowingsView.vue'),
    meta: { requiresAuth: true, title: 'Quản lý Mượn sách' },
  },
  {
    path: '/readers',
    name: 'readers',
    component: () => import('../views/ReadersView.vue'),
    meta: { requiresAuth: true, title: 'Quản lý Độc giả' },
  },
  {
    path: '/staff',
    name: 'staff',
    component: () => import('../views/StaffView.vue'),
    meta: { requiresAuth: true, roles: ['admin'], title: 'Quản lý Nhân viên' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../views/SettingsView.vue'),
    meta: { requiresAuth: true, roles: ['admin'], title: 'Cấu hình Hệ thống' },
  },
  {
    path: '/audit-logs',
    name: 'audit-logs',
    component: () => import('../views/AuditLogsView.vue'),
    meta: { requiresAuth: true, roles: ['admin'], title: 'Nhật ký Hệ thống' },
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
  // Cap nhat tieu de trinh duyet
  if (to.meta.title) {
    document.title = `${to.meta.title} — Quản trị Thư viện`;
  }

  // TODO (P1-4): Kiem tra authStore.isAuthenticated va authStore.user.VaiTro khi backend hoan thanh Phase 1
  // const requiresAuth = to.meta.requiresAuth;
  // const roles = to.meta.roles;
  // if (requiresAuth && !authStore.isAuthenticated) {
  //   return next({ name: 'login', query: { redirect: to.fullPath } });
  // }
  // if (roles && !roles.includes(authStore.user?.VaiTro)) {
  //   return next({ name: 'dashboard' });
  // }

  // Giai doan P0-5: chua chan ai, cho phep di tiep de kiem tra giao dien
  next();
});

export default router;
