<script setup>
import { computed } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const router = useRouter();
const authStore = useAuthStore();

const isForcedChange = computed(() => authStore.mustChangePassword);

const roleBadge = computed(() => {
  if (authStore.isAdmin) {
    return { text: 'Quản trị viên', class: 'bg-primary' };
  }
  if (authStore.role === 'thuthu') {
    return { text: 'Thủ thư', class: 'bg-info text-dark' };
  }
  return { text: 'Nhân viên', class: 'bg-secondary' };
});

const handleLogout = async () => {
  await authStore.logout();
  router.push('/login');
};
</script>

<template>
  <header class="admin-topbar d-flex align-items-center justify-content-between px-3 px-md-4 py-2 bg-white border-bottom shadow-sm">
    <div class="d-flex align-items-center gap-3">
      <!-- Nút mở sidebar trên mobile (chỉ hiện khi không bắt buộc đổi mật khẩu) -->
      <button
        v-if="!isForcedChange"
        class="btn btn-outline-secondary btn-sm d-md-none"
        type="button"
        data-bs-toggle="offcanvas"
        data-bs-target="#adminSidebar"
        aria-controls="adminSidebar"
        aria-label="Mở danh mục quản lý"
      >
        <i class="bi bi-list fs-5"></i>
      </button>

      <div class="d-flex align-items-center gap-2">
        <i class="bi bi-shield-lock-fill text-primary fs-5"></i>
        <span class="fw-semibold text-dark">Hệ thống Quản trị Thư viện</span>
      </div>
    </div>

    <div class="d-flex align-items-center gap-3">
      <template v-if="authStore.isAuthenticated">
        <!-- Huy hiệu vai trò -->
        <span
          class="badge py-1 px-2 fw-medium rounded-pill d-none d-sm-inline-block"
          :class="roleBadge.class"
        >
          {{ roleBadge.text }}
        </span>

        <!-- Dropdown người dùng -->
        <div class="dropdown">
          <button
            class="btn btn-sm btn-outline-secondary dropdown-toggle d-flex align-items-center gap-2 rounded-3"
            type="button"
            data-bs-toggle="dropdown"
            aria-expanded="false"
          >
            <i class="bi bi-person-circle fs-6"></i>
            <span class="fw-medium">{{ authStore.currentUser?.HoTenNV || 'Tài khoản' }}</span>
          </button>

          <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 rounded-3 py-2 mt-1">
            <li class="px-3 py-1 border-bottom mb-1">
              <div class="fw-bold small text-dark">{{ authStore.currentUser?.HoTenNV }}</div>
              <div class="text-muted small">MSNV: {{ authStore.currentUser?.MSNV }}</div>
            </li>

            <!-- Chỉ hiện link Đổi mật khẩu nếu không trong trạng thái bắt buộc đổi -->
            <li v-if="!isForcedChange">
              <RouterLink to="/change-password" class="dropdown-item d-flex align-items-center gap-2 py-2">
                <i class="bi bi-key text-secondary"></i>
                <span>Đổi mật khẩu</span>
              </RouterLink>
            </li>

            <li>
              <button
                class="dropdown-item text-danger d-flex align-items-center gap-2 py-2"
                type="button"
                @click="handleLogout"
              >
                <i class="bi bi-box-arrow-right"></i>
                <span>Đăng xuất</span>
              </button>
            </li>
          </ul>
        </div>
      </template>

      <template v-else>
        <RouterLink to="/login" class="btn btn-sm btn-primary d-flex align-items-center gap-1">
          <i class="bi bi-box-arrow-in-right"></i>
          <span>Đăng nhập</span>
        </RouterLink>
      </template>
    </div>
  </header>
</template>

<style scoped>
.admin-topbar {
  min-height: 58px;
}
</style>
