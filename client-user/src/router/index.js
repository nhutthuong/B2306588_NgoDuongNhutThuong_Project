import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import HomeView from '../views/HomeView.vue';

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

/**
 * Navigation Guard kiểm tra xác thực độc giả
 * Lưu ý: Route guard ở frontend chỉ nhằm mục đích nâng cao trải nghiệm người dùng (UX).
 * Quyền truy cập và kiểm soát IDOR thực tế được thực thi nghiêm ngặt tại backend (authUser).
 */
router.beforeEach(async (to, from, next) => {
  // Cập nhật tiêu đề trình duyệt
  if (to.meta.title) {
    document.title = `${to.meta.title} — Thư viện điện tử`;
  }

  const authStore = useAuthStore();

  // 1. Khôi phục phiên làm việc qua cookie nếu chưa initialized
  if (!authStore.initialized) {
    await authStore.initSession();
  }

  // 2. Route yêu cầu đăng nhập (requiresAuth): chưa đăng nhập thì chuyển về /login
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return next({
      name: 'login',
      query: { redirect: to.fullPath },
    });
  }

  // 3. Đã đăng nhập mà truy cập /login hoặc /register: chuyển về trang chủ
  if ((to.name === 'login' || to.name === 'register') && authStore.isAuthenticated) {
    return next({ path: '/' });
  }

  next();
});

export default router;
