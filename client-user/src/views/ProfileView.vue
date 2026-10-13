<script setup>
import { useAuthStore } from '../stores/auth.js';

const authStore = useAuthStore();
</script>

<template>
  <div class="card shadow-sm border-0 rounded-4">
    <div class="card-body p-4">
      <div class="d-flex align-items-center gap-2 mb-3">
        <i class="bi bi-person-vcard text-primary fs-4"></i>
        <h1 class="h4 mb-0 fw-bold">Hồ sơ độc giả</h1>
      </div>
      <p class="text-muted">
        Thông tin cá nhân và tài khoản độc giả trong hệ thống thư viện.
      </p>

      <!-- Thông tin tóm tắt của độc giả đăng nhập -->
      <div v-if="authStore.user" class="bg-light p-3 rounded-3 mb-3 border">
        <div class="row g-2 small">
          <div class="col-sm-6">
            <span class="text-muted">Mã độc giả: </span>
            <span class="fw-semibold text-primary">{{ authStore.user.MaDocGia }}</span>
          </div>
          <div class="col-sm-6">
            <span class="text-muted">Họ và tên: </span>
            <span class="fw-semibold">{{ authStore.fullName }}</span>
          </div>
          <div class="col-sm-6">
            <span class="text-muted">Email: </span>
            <span class="fw-semibold">{{ authStore.user.Email }}</span>
          </div>
          <div class="col-sm-6">
            <span class="text-muted">Điện thoại: </span>
            <span class="fw-semibold">{{ authStore.user.DienThoai || 'Chưa cập nhật' }}</span>
          </div>
          <div class="col-sm-6">
            <span class="text-muted">Giới tính: </span>
            <span class="fw-semibold">{{ authStore.user.Phai === 'Nam' ? 'Nam' : authStore.user.Phai === 'Nu' ? 'Nữ' : 'Khác' }}</span>
          </div>
          <div class="col-sm-6">
            <span class="text-muted">Địa chỉ: </span>
            <span class="fw-semibold">{{ authStore.user.DiaChi || 'Chưa cập nhật' }}</span>
          </div>
        </div>
      </div>

      <div class="alert alert-info d-flex align-items-center gap-2 mb-0 rounded-3">
        <i class="bi bi-info-circle-fill fs-5 flex-shrink-0"></i>
        <div>
          Chức năng chỉnh sửa hồ sơ và đổi mật khẩu độc giả sẽ được hoàn thiện ở Phase 3 & Phase 4 (P4-4).
        </div>
      </div>
    </div>
  </div>
</template>
