<script setup>
import { computed } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const route = useRoute();
const authStore = useAuthStore();

// Danh sách menu quản trị theo CONVENTIONS.md §3 & Yêu cầu P1-4
const menuItems = [
  { path: '/', label: 'Dashboard', icon: 'bi-speedometer2' },
  { path: '/books', label: 'Sách', icon: 'bi-book' },
  { path: '/publishers', label: 'Nhà xuất bản', icon: 'bi-building' },
  { path: '/borrowings', label: 'Mượn sách', icon: 'bi-journal-bookmark' },
  { path: '/readers', label: 'Độc giả', icon: 'bi-people' },
  { path: '/staff', label: 'Nhân viên', icon: 'bi-person-badge', adminOnly: true },
  { path: '/settings', label: 'Cấu hình', icon: 'bi-gear', adminOnly: true },
  { path: '/audit-logs', label: 'Nhật ký', icon: 'bi-journal-text', adminOnly: true },
];

// Xác định mục menu đang sáng theo đường dẫn hiện tại (kể cả các trang con như /books/new, /books/:maSach/edit)
const isItemActive = (path) => {
  if (path === '/') return route.path === '/';
  return route.path === path || route.path.startsWith(`${path}/`);
};

// Lọc menu theo quyền vai trò: thủ thư sẽ ẩn các mục chỉ dành riêng cho Admin
const visibleMenuItems = computed(() => {
  return menuItems.filter((item) => {
    if (item.adminOnly) {
      return authStore.isAdmin;
    }
    return true;
  });
});
</script>

<template>
  <aside
    class="offcanvas-md offcanvas-start admin-sidebar text-bg-dark"
    tabindex="-1"
    id="adminSidebar"
    aria-labelledby="adminSidebarLabel"
  >
    <div class="d-flex align-items-center justify-content-between p-3 border-bottom border-secondary">
      <RouterLink to="/" class="d-flex align-items-center gap-2 text-white text-decoration-none fw-bold fs-5">
        <i class="bi bi-shield-lock-fill text-primary"></i>
        <span id="adminSidebarLabel">Thư Viện Admin</span>
      </RouterLink>
      <button
        type="button"
        class="btn-close btn-close-white d-md-none"
        data-bs-dismiss="offcanvas"
        data-bs-target="#adminSidebar"
        aria-label="Đóng"
      ></button>
    </div>

    <div class="offcanvas-body p-0 d-flex flex-column justify-content-between">
      <nav class="nav nav-pills flex-column py-3 w-100">
        <div class="px-3 pb-2 text-uppercase text-muted fw-bold small">
          Danh mục quản lý
        </div>
        <template v-for="item in visibleMenuItems" :key="item.path">
          <RouterLink
            :to="item.path"
            class="nav-link"
            :class="{ active: isItemActive(item.path) }"
          >
            <i class="bi fs-5" :class="item.icon"></i>
            <span>{{ item.label }}</span>
            <span
              v-if="item.adminOnly"
              class="badge bg-secondary ms-auto text-uppercase"
              style="font-size: 0.65rem;"
            >
              Admin
            </span>
          </RouterLink>
        </template>
      </nav>

      <div class="p-3 border-top border-secondary small text-secondary">
        <div class="text-white-50">Hệ thống Quản lý Thư viện</div>
        <div class="text-muted mt-1">
          Vai trò:
          <span class="text-white fw-medium">
            {{ authStore.isAdmin ? 'Quản trị viên' : 'Thủ thư' }}
          </span>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.offcanvas-md {
  min-height: 100vh;
}
</style>
