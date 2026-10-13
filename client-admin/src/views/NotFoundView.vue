<script setup>
import { RouterLink } from 'vue-router';
</script>

<template>
  <div class="row justify-content-center text-center py-5">
    <div class="col-md-6">
      <div class="display-1 fw-bold text-primary mb-3">404</div>
      <h1 class="h3 fw-bold mb-2">Không tìm thấy trang quản trị</h1>
      <p class="text-muted mb-4">
        Trang bạn truy cập không tồn tại hoặc đã được di chuyển.
      </p>
      <RouterLink to="/" class="btn btn-primary">
        <i class="bi bi-speedometer2 me-1"></i>
        Về bảng điều khiển
      </RouterLink>
    </div>
  </div>
</template>
