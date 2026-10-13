<script setup>
import { computed } from 'vue';
import { useRoute, RouterView } from 'vue-router';
import { useAuthStore } from './stores/auth.js';
import AdminSidebar from './components/AdminSidebar.vue';
import AdminNavbar from './components/AdminNavbar.vue';

const route = useRoute();
const authStore = useAuthStore();

const isAuthLayout = computed(() => route.meta.layout === 'auth');
const isForcedChange = computed(() => authStore.mustChangePassword);
</script>

<template>
  <!-- Màn hình chờ spinner nhẹ nhàng khi đang khôi phục phiên lần đầu (tránh nháy trang login) -->
  <div
    v-if="!authStore.initialized"
    class="d-flex flex-column align-items-center justify-content-center min-vh-100 bg-light"
  >
    <div class="spinner-border text-primary mb-3" style="width: 2.75rem; height: 2.75rem;" role="status">
      <span class="visually-hidden">Đang tải...</span>
    </div>
    <div class="text-secondary small fw-medium">Đang tải phiên làm việc...</div>
  </div>

  <!-- Layout xác thực (trang Login) -->
  <div v-else-if="isAuthLayout" class="container">
    <RouterView />
  </div>

  <!-- Layout khi đang bị bắt buộc đổi mật khẩu: Ẩn sidebar và menu điều hướng khác -->
  <div v-else-if="isForcedChange" class="d-flex flex-column min-vh-100 bg-light">
    <AdminNavbar />
    <main class="container py-4 flex-grow-1">
      <RouterView />
    </main>
  </div>

  <!-- Layout quản trị đầy đủ -->
  <div v-else class="d-flex min-vh-100">
    <AdminSidebar />
    <div class="admin-content-wrapper">
      <AdminNavbar />
      <main class="admin-content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin-content-wrapper {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.admin-content {
  flex: 1;
  padding: 1.5rem;
}
</style>
