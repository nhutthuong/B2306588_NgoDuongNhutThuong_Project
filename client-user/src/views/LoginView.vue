<script setup>
import { RouterLink } from 'vue-router';
</script>

<template>
  <div class="row justify-content-center">
    <div class="col-md-6 col-lg-5">
      <div class="card shadow-sm border-0">
        <div class="card-body p-4">
          <div class="text-center mb-4">
            <i class="bi bi-person-lock text-primary fs-1"></i>
            <h1 class="h4 fw-bold mt-2">Đăng nhập độc giả</h1>
            <p class="text-muted small">Đăng nhập tài khoản để mượn sách trực tuyến</p>
          </div>

          <div class="alert alert-secondary d-flex align-items-center gap-2 mb-3">
            <i class="bi bi-clock-history"></i>
            <span>Chức năng đăng nhập sẽ được hoàn thiện ở Phase 1 (P1-5).</span>
          </div>

          <div class="text-center mt-3">
            <span class="text-muted small">Chưa có tài khoản? </span>
            <RouterLink to="/register" class="small fw-semibold">Đăng ký ngay</RouterLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
