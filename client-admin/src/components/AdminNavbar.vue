<script setup>
import { RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const authStore = useAuthStore();
</script>

<template>
  <header class="admin-topbar d-flex align-items-center justify-content-between px-3 px-md-4">
    <div class="d-flex align-items-center gap-3">
      <!-- Nut mo sidebar tren mobile -->
      <button
        class="btn btn-outline-secondary btn-sm d-md-none"
        type="button"
        data-bs-toggle="offcanvas"
        data-bs-target="#adminSidebar"
        aria-controls="adminSidebar"
        aria-label="Mở danh mục quản lý"
      >
        <i class="bi bi-list fs-5"></i>
      </button>

      <div class="d-flex align-items-center gap-2">
        <i class="bi bi-grid-3x3-gap-fill text-primary fs-5 d-none d-sm-inline"></i>
        <span class="fw-semibold text-dark">Hệ thống Quản trị Thư viện</span>
      </div>
    </div>

    <div class="d-flex align-items-center gap-3">
      <template v-if="authStore.isAuthenticated">
        <div class="dropdown">
          <button
            class="btn btn-sm btn-outline-secondary dropdown-toggle d-flex align-items-center gap-2"
            type="button"
            data-bs-toggle="dropdown"
            aria-expanded="false"
          >
            <i class="bi bi-person-circle"></i>
            <span>{{ authStore.currentUser?.HoTen || 'Quản trị viên' }}</span>
          </button>
          <ul class="dropdown-menu dropdown-menu-end shadow-sm">
            <li>
              <button class="dropdown-item text-danger" @click="authStore.clearSession">
                <i class="bi bi-box-arrow-right me-2"></i>
                Đăng xuất
              </button>
            </li>
          </ul>
        </div>
      </template>
      <template v-else>
        <RouterLink to="/login" class="btn btn-sm btn-primary d-flex align-items-center gap-1">
          <i class="bi bi-box-arrow-in-right"></i>
          <span>Đăng nhập</span>
        </RouterLink>
      </template>
    </div>
  </header>
</template>
