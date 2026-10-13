<script setup>
import { RouterLink } from 'vue-router';
</script>

<template>
  <div class="row justify-content-center align-items-center min-vh-50 py-5">
    <div class="col-11 col-sm-9 col-md-7 col-lg-5 text-center">
      <div class="card shadow-sm border-0 rounded-4 p-4 p-sm-5">
        <div class="d-inline-flex p-3 bg-danger bg-opacity-10 text-danger rounded-circle mb-3 mx-auto">
          <i class="bi bi-shield-slash-fill fs-1"></i>
        </div>
        <h1 class="h3 fw-bold text-dark mb-2">403 — Không có quyền truy cập</h1>
        <p class="text-secondary small mb-4">
          Khu vực này yêu cầu quyền <strong>Quản trị viên (Admin)</strong>.
          Tài khoản hiện tại của bạn không có đủ thẩm quyền để truy cập trang này.
        </p>
        <div>
          <RouterLink to="/" class="btn btn-primary px-4 py-2 rounded-3 d-inline-flex align-items-center gap-2">
            <i class="bi bi-house-door-fill"></i>
            <span>Về trang chủ (Dashboard)</span>
          </RouterLink>
        </div>
      </div>
    </div>
  </div>
</template>
