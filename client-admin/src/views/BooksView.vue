<script setup>
import { RouterLink } from 'vue-router';
</script>

<template>
  <div class="card shadow-sm border-0">
    <div class="card-body p-4">
      <div class="d-flex align-items-center justify-content-between mb-3">
        <div class="d-flex align-items-center gap-2">
          <i class="bi bi-book text-primary fs-4"></i>
          <h1 class="h4 mb-0 fw-bold">Quản lý Sách</h1>
        </div>
        <RouterLink to="/books/new" class="btn btn-primary btn-sm">
          <i class="bi bi-plus-lg me-1"></i>
          Thêm sách mới
        </RouterLink>
      </div>
      <p class="text-muted">
        Danh sách tất cả các đầu sách trong kho, số lượng còn lại và thao tác chỉnh sửa/xóa mềm.
      </p>
      <div class="alert alert-info d-flex align-items-center gap-2 mb-0">
        <i class="bi bi-info-circle-fill"></i>
        <span>Chức năng quản lý sách và upload ảnh bìa sẽ được triển khai ở Phase 2 (P2-3).</span>
      </div>
    </div>
  </div>
</template>
