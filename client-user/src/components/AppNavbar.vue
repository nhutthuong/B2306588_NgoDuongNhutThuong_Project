<script setup>
import { RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const authStore = useAuthStore();
</script>

<template>
  <nav class="navbar navbar-expand-lg navbar-dark bg-primary shadow-sm">
    <div class="container">
      <RouterLink class="navbar-brand d-flex align-items-center gap-2" to="/">
        <i class="bi bi-book-half fs-4"></i>
        <span>Thư viện điện tử</span>
      </RouterLink>

      <button
        class="navbar-toggler"
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#navbarSupportedContent"
        aria-controls="navbarSupportedContent"
        aria-expanded="false"
        aria-label="Chuyển đổi menu"
      >
        <span class="navbar-toggler-icon"></span>
      </button>

      <div class="collapse navbar-collapse" id="navbarSupportedContent">
        <ul class="navbar-nav me-auto mb-2 mb-lg-0">
          <li class="nav-item">
            <RouterLink class="nav-link" to="/" active-class="active">
              <i class="bi bi-house-door me-1"></i>
              Trang chủ
            </RouterLink>
          </li>
          <li class="nav-item">
            <RouterLink class="nav-link" to="/my-borrowings" active-class="active">
              <i class="bi bi-journal-check me-1"></i>
              Lịch sử mượn
            </RouterLink>
          </li>
        </ul>

        <div class="d-flex align-items-center gap-2">
          <template v-if="authStore.isAuthenticated">
            <RouterLink class="btn btn-outline-light btn-sm" to="/profile">
              <i class="bi bi-person-circle me-1"></i>
              Hồ sơ
            </RouterLink>
          </template>
          <template v-else>
            <RouterLink class="btn btn-outline-light btn-sm" to="/login">
              <i class="bi bi-box-arrow-in-right me-1"></i>
              Đăng nhập
            </RouterLink>
            <RouterLink class="btn btn-light btn-sm text-primary fw-semibold" to="/register">
              <i class="bi bi-person-plus me-1"></i>
              Đăng ký
            </RouterLink>
          </template>
        </div>
      </div>
    </div>
  </nav>
</template>
