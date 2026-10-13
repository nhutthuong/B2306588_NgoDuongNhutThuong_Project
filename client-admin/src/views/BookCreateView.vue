<script setup>
import { RouterLink } from 'vue-router';
</script>

<template>
  <div class="card shadow-sm border-0">
    <div class="card-body p-4">
      <div class="d-flex align-items-center gap-2 mb-3">
        <i class="bi bi-file-earmark-plus text-primary fs-4"></i>
        <h1 class="h4 mb-0 fw-bold">Thêm Sách Mới</h1>
      </div>
      <p class="text-muted">Nhập thông tin sách, đơn giá, số quyển, năm xuất bản và tải lên hình ảnh bìa sách.</p>
      <div class="alert alert-info d-flex align-items-center gap-2 mb-3">
        <i class="bi bi-info-circle-fill"></i>
        <span>Biểu mẫu thêm sách mới sẽ được triển khai ở Phase 2 (P2-3).</span>
      </div>
      <RouterLink to="/books" class="btn btn-outline-secondary btn-sm">
        <i class="bi bi-arrow-left me-1"></i>
        Quay lại danh sách sách
      </RouterLink>
    </div>
  </div>
</template>
