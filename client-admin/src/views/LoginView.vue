<script setup>
</script>

<template>
  <div class="row justify-content-center align-items-center min-vh-100 py-5">
    <div class="col-md-6 col-lg-4">
      <div class="card shadow-sm border-0">
        <div class="card-body p-4">
          <div class="text-center mb-4">
            <div class="d-inline-flex p-3 bg-primary bg-opacity-10 text-primary rounded-circle mb-2">
              <i class="bi bi-shield-lock-fill fs-2"></i>
            </div>
            <h1 class="h4 fw-bold">Đăng nhập Quản trị</h1>
            <p class="text-muted small">Dành cho Nhân viên và Quản trị viên thư viện</p>
          </div>

          <div class="alert alert-secondary d-flex align-items-center gap-2 mb-3">
            <i class="bi bi-clock-history"></i>
            <span>Chức năng xác thực JWT cho Admin sẽ được triển khai ở Phase 1 (P1-4).</span>
          </div>

          <div class="text-center mt-3">
            <RouterLink to="/" class="small fw-semibold text-decoration-none">
              <i class="bi bi-arrow-left me-1"></i>
              Về bảng điều khiển (Tạm thời)
            </RouterLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
