<script setup>
import { useRoute, RouterLink } from 'vue-router';

const route = useRoute();
</script>

<template>
  <div class="card shadow-sm border-0">
    <div class="card-body p-4">
      <div class="d-flex align-items-center gap-2 mb-3">
        <i class="bi bi-pencil-square text-primary fs-4"></i>
        <h1 class="h4 mb-0 fw-bold">Chỉnh sửa Sách</h1>
      </div>
      <p class="text-muted">
        Mã sách đang chỉnh sửa: <code class="fw-bold">{{ route.params.maSach }}</code>
      </p>
      <div class="alert alert-info d-flex align-items-center gap-2 mb-3">
        <i class="bi bi-info-circle-fill"></i>
        <span>Biểu mẫu chỉnh sửa sách sẽ được triển khai ở Phase 2 (P2-3).</span>
      </div>
      <RouterLink to="/books" class="btn btn-outline-secondary btn-sm">
        <i class="bi bi-arrow-left me-1"></i>
        Quay lại danh sách sách
      </RouterLink>
    </div>
  </div>
</template>
