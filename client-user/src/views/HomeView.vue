<script setup>
import { RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import ServerHealthCheck from '../components/ServerHealthCheck.vue';

const authStore = useAuthStore();
</script>

<template>
  <div>
    <!-- Lời chào mừng khi độc giả đã đăng nhập -->
    <div v-if="authStore.isAuthenticated" class="card shadow-sm border-0 bg-primary bg-opacity-10 mb-4 rounded-4">
      <div class="card-body p-4 d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
        <div class="d-flex align-items-center gap-3">
          <div class="p-3 bg-primary text-white rounded-circle shadow-sm">
            <i class="bi bi-person-fill fs-3"></i>
          </div>
          <div>
            <h2 class="h5 fw-bold text-dark mb-1">
              Xin chào, {{ authStore.fullName || 'Độc giả' }}!
            </h2>
            <p class="text-muted small mb-0">
              Mã độc giả: <span class="fw-semibold text-primary">{{ authStore.user?.MaDocGia }}</span> |
              Email: <span>{{ authStore.user?.Email }}</span>
            </p>
          </div>
        </div>
        <div class="d-flex align-items-center gap-2">
          <RouterLink to="/my-borrowings" class="btn btn-primary btn-sm px-3 rounded-pill shadow-sm">
            <i class="bi bi-journal-check me-1"></i> Xem lịch sử mượn
          </RouterLink>
          <RouterLink to="/profile" class="btn btn-outline-primary btn-sm px-3 rounded-pill">
            <i class="bi bi-person-circle me-1"></i> Hồ sơ
          </RouterLink>
        </div>
      </div>
    </div>

    <!-- Khối kiểm tra kết nối server (Giữ lại từ P0-5 phục vụ kiểm tra tình trạng kết nối API) -->
    <ServerHealthCheck class="mb-4" />

    <!-- Nội dung chính giữ chỗ của Trang chủ -->
    <div class="card shadow-sm border-0 rounded-4">
      <div class="card-body p-4">
        <div class="d-flex align-items-center gap-2 mb-3">
          <i class="bi bi-book text-primary fs-4"></i>
          <h1 class="h4 mb-0 fw-bold">Danh mục sách Thư viện</h1>
        </div>
        <p class="text-muted">
          Trang chủ độc giả hiển thị danh mục sách và tìm kiếm sách trực tuyến.
        </p>
        <div class="alert alert-info d-flex align-items-center gap-2 mb-0 rounded-3">
          <i class="bi bi-info-circle-fill fs-5 flex-shrink-0"></i>
          <div>
            Tính năng tra cứu và hiển thị danh mục sách sẽ được hoàn thiện ở Phase 2 (P2-5).
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
