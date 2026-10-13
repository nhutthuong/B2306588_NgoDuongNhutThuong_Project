<script setup>
import { RouterLink } from 'vue-router';
</script>

<template>
  <div class="row justify-content-center">
    <div class="col-md-6 col-lg-5">
      <div class="card shadow-sm border-0">
        <div class="card-body p-4">
          <div class="text-center mb-4">
            <i class="bi bi-person-plus text-primary fs-1"></i>
            <h1 class="h4 fw-bold mt-2">Đăng ký tài khoản</h1>
            <p class="text-muted small">Tạo tài khoản độc giả mới để sử dụng dịch vụ thư viện</p>
          </div>

          <div class="alert alert-secondary d-flex align-items-center gap-2 mb-3">
            <i class="bi bi-clock-history"></i>
            <span>Chức năng đăng ký sẽ được hoàn thiện ở Phase 1 (P1-5).</span>
          </div>

          <div class="text-center mt-3">
            <span class="text-muted small">Đã có tài khoản? </span>
            <RouterLink to="/login" class="small fw-semibold">Đăng nhập</RouterLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
