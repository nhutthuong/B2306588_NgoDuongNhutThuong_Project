<script setup>
import { RouterView } from 'vue-router';
import AppNavbar from './components/AppNavbar.vue';
import AppFooter from './components/AppFooter.vue';
import { useAuthStore } from './stores/auth.js';

const authStore = useAuthStore();
</script>

<template>
  <!-- Màn hình chờ nhỏ khi khôi phục phiên lần đầu sau khi tải trang, tránh nháy giao diện -->
  <div
    v-if="!authStore.initialized"
    class="d-flex flex-column align-items-center justify-content-center min-vh-100 bg-light"
  >
    <div class="spinner-border text-primary mb-3" role="status" style="width: 2.5rem; height: 2.5rem;">
      <span class="visually-hidden">Đang tải...</span>
    </div>
    <div class="text-muted small fw-medium">Đang khởi tạo phiên làm việc...</div>
  </div>

  <div v-else class="d-flex flex-column min-vh-100">
    <AppNavbar />
    <main class="main-content container py-4">
      <RouterView />
    </main>
    <AppFooter />
  </div>
</template>

<style scoped>
.main-content {
  flex: 1 0 auto;
}
</style>
