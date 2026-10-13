<script setup>
import ServerHealthCheck from '../components/ServerHealthCheck.vue';
</script>

<template>
  <div>
    <!-- Khối kiểm tra kết nối server (task P0-5) -->
    <ServerHealthCheck />

    <div class="card shadow-sm border-0">
      <div class="card-body p-4">
        <div class="d-flex align-items-center gap-2 mb-3">
          <i class="bi bi-book text-primary fs-4"></i>
          <h1 class="h4 mb-0 fw-bold">Danh sách sách trong thư viện</h1>
        </div>
        <p class="text-muted">
          Trang chủ độc giả hiển thị danh mục sách và tìm kiếm sách trực tuyến.
        </p>
        <div class="alert alert-info d-flex align-items-center gap-2 mb-0">
          <i class="bi bi-info-circle-fill"></i>
          <span>
            Tính năng tra cứu và hiển thị sách sẽ được hoàn thiện ở Phase 2 (P2-5).
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
