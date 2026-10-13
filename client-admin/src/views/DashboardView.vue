<script setup>
import { computed } from 'vue';
import { useAuthStore } from '../stores/auth.js';
import ServerHealthCheck from '../components/ServerHealthCheck.vue';

const authStore = useAuthStore();

const greetingName = computed(() => authStore.currentUser?.HoTenNV || 'Nhân viên');
const roleLabel = computed(() =>
  authStore.isAdmin ? 'Quản trị viên (Admin)' : 'Thủ thư (Staff)'
);
</script>

<template>
  <div>
    <!-- Banner chào mừng người dùng -->
    <div class="card shadow-sm border-0 rounded-4 bg-primary text-white mb-4 overflow-hidden">
      <div class="card-body p-4 p-md-5 position-relative">
        <div class="row align-items-center">
          <div class="col-md-8">
            <span class="badge bg-white text-primary mb-2 px-3 py-1 fw-bold text-uppercase" style="font-size: 0.75rem;">
              {{ roleLabel }}
            </span>
            <h1 class="h3 fw-bold mb-2">
              Xin chào, {{ greetingName }}!
            </h1>
            <p class="mb-0 text-white-50">
              Chào mừng bạn đến với Hệ thống Quản trị Thư viện. Hãy chọn danh mục quản lý bên thanh điều hướng để bắt đầu công việc.
            </p>
          </div>
          <div class="col-md-4 text-end d-none d-md-block">
            <i class="bi bi-person-badge fs-1 text-white-50" style="font-size: 4.5rem !important;"></i>
          </div>
        </div>
      </div>
    </div>

    <!-- Khối kiểm tra kết nối server backend (P0-5) -->
    <ServerHealthCheck />

    <!-- Các thẻ thống kê tổng quan (giữ chỗ cho Phase 4) -->
    <div class="row g-3">
      <div class="col-sm-6 col-xl-3">
        <div class="card shadow-sm border-0 h-100 rounded-3">
          <div class="card-body d-flex align-items-center gap-3">
            <div class="p-3 bg-primary bg-opacity-10 text-primary rounded-3">
              <i class="bi bi-book fs-3"></i>
            </div>
            <div>
              <div class="text-muted small">Tổng đầu sách</div>
              <div class="fs-4 fw-bold">--</div>
            </div>
          </div>
        </div>
      </div>

      <div class="col-sm-6 col-xl-3">
        <div class="card shadow-sm border-0 h-100 rounded-3">
          <div class="card-body d-flex align-items-center gap-3">
            <div class="p-3 bg-success bg-opacity-10 text-success rounded-3">
              <i class="bi bi-people fs-3"></i>
            </div>
            <div>
              <div class="text-muted small">Độc giả đăng ký</div>
              <div class="fs-4 fw-bold">--</div>
            </div>
          </div>
        </div>
      </div>

      <div class="col-sm-6 col-xl-3">
        <div class="card shadow-sm border-0 h-100 rounded-3">
          <div class="card-body d-flex align-items-center gap-3">
            <div class="p-3 bg-warning bg-opacity-10 text-warning rounded-3">
              <i class="bi bi-hourglass-split fs-3"></i>
            </div>
            <div>
              <div class="text-muted small">Phiếu chờ duyệt</div>
              <div class="fs-4 fw-bold">--</div>
            </div>
          </div>
        </div>
      </div>

      <div class="col-sm-6 col-xl-3">
        <div class="card shadow-sm border-0 h-100 rounded-3">
          <div class="card-body d-flex align-items-center gap-3">
            <div class="p-3 bg-info bg-opacity-10 text-info rounded-3">
              <i class="bi bi-journal-bookmark fs-3"></i>
            </div>
            <div>
              <div class="text-muted small">Sách đang mượn</div>
              <div class="fs-4 fw-bold">--</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
