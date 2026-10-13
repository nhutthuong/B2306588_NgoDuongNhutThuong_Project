import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import DashboardView from '../views/DashboardView.vue';

/**
 * Hàm kiểm tra và chuẩn hóa đường dẫn chuyển hướng an toàn chống Open Redirect
 * Chỉ chấp nhận đường dẫn nội bộ (bắt đầu bằng đúng một dấu '/' và không chứa '://' hoặc '//')
 * @param {string|null} redirect
 * @returns {string}
 */
export const getSafeRedirectUrl = (redirect) => {
  if (
    typeof redirect === 'string' &&
    redirect.startsWith('/') &&
    !redirect.startsWith('//') &&
    !redirect.includes('://')
  ) {
    return redirect;
  }
  return '/';
};

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue'),
    meta: { title: 'Đăng nhập Quản trị', layout: 'auth' },
  },
  {
    path: '/change-password',
    name: 'change-password',
    component: () => import('../views/ChangePasswordView.vue'),
    meta: { requiresAuth: true, title: 'Đổi mật khẩu' },
  },
  {
    path: '/forbidden',
    name: 'forbidden',
    component: () => import('../views/ForbiddenView.vue'),
    meta: { requiresAuth: true, title: 'Không có quyền truy cập (403)' },
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

/**
 * Navigation Guard kiểm tra xác thực và phân quyền
 * Lưu ý quan trọng: Route guard ở frontend chỉ nhằm mục đích nâng cao trải nghiệm người dùng (UX).
 * Toàn bộ quyền truy cập và tính bảo mật được thực thi và kiểm tra bắt buộc ở backend qua middlewares.
 */
router.beforeEach(async (to, from, next) => {
  // Cập nhật tiêu đề trang
  if (to.meta.title) {
    document.title = `${to.meta.title} — Quản trị Thư viện`;
  }

  const authStore = useAuthStore();

  // 1. Nếu chưa khởi tạo phiên (ví dụ sau khi tải lại trang F5), đợi khôi phục phiên từ cookie
  if (!authStore.initialized) {
    await authStore.initSession();
  }

  // 2. Kiểm tra route yêu cầu đăng nhập
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return next({
      name: 'login',
      query: { redirect: to.fullPath },
    });
  }

  // 3. Đã đăng nhập mà truy cập trang /login: chuyển về trang chủ
  if (to.name === 'login' && authStore.isAuthenticated) {
    if (authStore.mustChangePassword) {
      return next({ name: 'change-password' });
    }
    return next({ path: '/' });
  }

  // 4. Nếu tài khoản bắt buộc đổi mật khẩu (lần đầu): chỉ cho phép vào /change-password
  if (authStore.isAuthenticated && authStore.mustChangePassword) {
    if (to.name !== 'change-password') {
      return next({ name: 'change-password' });
    }
  }

  // 5. Kiểm tra phân quyền theo vai trò (meta.roles: ['admin'])
  if (to.meta.roles && to.meta.roles.length > 0) {
    if (!to.meta.roles.includes(authStore.role)) {
      return next({ name: 'forbidden' });
    }
  }

  next();
});

export default router;
