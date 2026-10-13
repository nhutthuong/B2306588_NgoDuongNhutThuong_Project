<script setup>
import { RouterLink, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const router = useRouter();
const authStore = useAuthStore();

const handleLogout = async () => {
  await authStore.logout();
  router.push('/login');
};
</script>

<template>
  <nav class="navbar navbar-expand-lg navbar-dark bg-primary shadow-sm sticky-top">
    <div class="container">
      <RouterLink class="navbar-brand d-flex align-items-center gap-2 fw-bold" to="/">
        <i class="bi bi-book-half fs-4"></i>
        <span>Thư viện điện tử</span>
      </RouterLink>

      <button
        class="navbar-toggler border-0"
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#navbarSupportedContent"
        aria-controls="navbarSupportedContent"
        aria-expanded="false"
        aria-label="Chuyển đổi thanh điều hướng"
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
          <!-- Liên kết 'Lịch sử mượn' CHỈ hiển thị khi độc giả đã đăng nhập -->
          <li v-if="authStore.isAuthenticated" class="nav-item">
            <RouterLink class="nav-link" to="/my-borrowings" active-class="active">
              <i class="bi bi-journal-check me-1"></i>
              Lịch sử mượn
            </RouterLink>
          </li>
        </ul>

        <div class="d-flex align-items-center gap-2">
          <!-- Khi ĐÃ đăng nhập: Hiện menu dropdown tên người dùng -->
          <template v-if="authStore.isAuthenticated">
            <div class="dropdown">
              <button
                class="btn btn-outline-light btn-sm dropdown-toggle d-flex align-items-center gap-2 py-1 px-3 rounded-pill"
                type="button"
                id="userMenuButton"
                data-bs-toggle="dropdown"
                aria-expanded="false"
              >
                <i class="bi bi-person-circle fs-5"></i>
                <span class="fw-semibold">
                  {{ authStore.fullName || authStore.user?.Email || 'Độc giả' }}
                </span>
              </button>

              <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0 rounded-3 mt-2" aria-labelledby="userMenuButton">
                <li class="px-3 py-2 border-bottom">
                  <div class="fw-bold text-dark text-truncate" style="max-width: 220px;">
                    {{ authStore.fullName || 'Độc giả' }}
                  </div>
                  <div class="small text-muted text-truncate" style="max-width: 220px;">
                    {{ authStore.user?.Email }}
                  </div>
                  <div v-if="authStore.user?.MaDocGia" class="badge bg-light text-primary border mt-1">
                    Mã: {{ authStore.user.MaDocGia }}
                  </div>
                </li>
                <li>
                  <RouterLink class="dropdown-item py-2 d-flex align-items-center gap-2" to="/my-borrowings">
                    <i class="bi bi-journal-check text-primary"></i>
                    <span>Lịch sử mượn</span>
                  </RouterLink>
                </li>
                <li>
                  <RouterLink class="dropdown-item py-2 d-flex align-items-center gap-2" to="/profile">
                    <i class="bi bi-person-vcard text-primary"></i>
                    <span>Hồ sơ cá nhân</span>
                  </RouterLink>
                </li>
                <li><hr class="dropdown-divider my-1" /></li>
                <li>
                  <button
                    class="dropdown-item py-2 text-danger d-flex align-items-center gap-2"
                    type="button"
                    @click="handleLogout"
                  >
                    <i class="bi bi-box-arrow-right"></i>
                    <span>Đăng xuất</span>
                  </button>
                </li>
              </ul>
            </div>
          </template>

          <!-- Khi CHƯA đăng nhập: Hiện nút Đăng nhập và Đăng ký -->
          <template v-else>
            <RouterLink class="btn btn-outline-light btn-sm px-3 rounded-pill" to="/login">
              <i class="bi bi-box-arrow-in-right me-1"></i>
              Đăng nhập
            </RouterLink>
            <RouterLink class="btn btn-light btn-sm text-primary fw-semibold px-3 rounded-pill" to="/register">
              <i class="bi bi-person-plus me-1"></i>
              Đăng ký
            </RouterLink>
          </template>
        </div>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.navbar-brand {
  letter-spacing: 0.5px;
}
</style>
