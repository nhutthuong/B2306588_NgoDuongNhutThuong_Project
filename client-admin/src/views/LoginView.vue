<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { getErrorMessage } from '../api/http.js';
import { getSafeRedirectUrl } from '../router/index.js';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const msnv = ref('');
const password = ref('');
const showPassword = ref(false);
const isLoading = ref(false);
const errorMessage = ref('');
const alertMessage = ref('');

onMounted(() => {
  if (route.query.error === 'account_locked') {
    alertMessage.value = 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên để được hỗ trợ.';
  }
});

const togglePasswordVisibility = () => {
  showPassword.value = !showPassword.value;
};

const handleLogin = async () => {
  if (isLoading.value) return;

  errorMessage.value = '';
  alertMessage.value = '';

  const trimmedMsnv = msnv.value.trim().toUpperCase();
  if (!trimmedMsnv) {
    errorMessage.value = 'Vui lòng nhập mã số nhân viên (MSNV).';
    return;
  }
  if (!password.value) {
    errorMessage.value = 'Vui lòng nhập mật khẩu.';
    return;
  }

  isLoading.value = true;

  try {
    await authStore.login(trimmedMsnv, password.value);

    // Nếu tài khoản bắt buộc đổi mật khẩu lần đầu
    if (authStore.mustChangePassword) {
      router.push('/change-password');
      return;
    }

    // Chuyển hướng an toàn chống open redirect
    const targetUrl = getSafeRedirectUrl(route.query.redirect);
    router.push(targetUrl);
  } catch (err) {
    errorMessage.value = getErrorMessage(err);
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="row justify-content-center align-items-center min-vh-100 py-5">
    <div class="col-11 col-sm-9 col-md-7 col-lg-5 col-xl-4">
      <div class="card shadow-lg border-0 rounded-4">
        <div class="card-body p-4 p-sm-5">
          <!-- Logo & Tiêu đề -->
          <div class="text-center mb-4">
            <div class="d-inline-flex p-3 bg-primary bg-opacity-10 text-primary rounded-circle mb-3 shadow-sm">
              <i class="bi bi-shield-lock-fill fs-1"></i>
            </div>
            <h1 class="h4 fw-bold text-dark mb-1">Đăng nhập Quản trị</h1>
            <p class="text-muted small mb-0">Hệ thống Quản lý Thư viện</p>
          </div>

          <!-- Thông báo tài khoản bị khóa -->
          <div
            v-if="alertMessage"
            class="alert alert-warning d-flex align-items-start gap-2 py-2 px-3 small rounded-3 mb-3"
            role="alert"
          >
            <i class="bi bi-exclamation-triangle-fill fs-5 text-warning flex-shrink-0"></i>
            <div>{{ alertMessage }}</div>
          </div>

          <!-- Thông báo lỗi từ server -->
          <div
            v-if="errorMessage"
            class="alert alert-danger d-flex align-items-start gap-2 py-2 px-3 small rounded-3 mb-3"
            role="alert"
          >
            <i class="bi bi-x-circle-fill fs-5 text-danger flex-shrink-0"></i>
            <div>{{ errorMessage }}</div>
          </div>

          <!-- Form đăng nhập -->
          <form @submit.prevent="handleLogin" novalidate>
            <!-- MSNV -->
            <div class="mb-3">
              <label for="msnvInput" class="form-label small fw-semibold text-secondary">
                Mã số nhân viên (MSNV)
              </label>
              <div class="input-group">
                <span class="input-group-text bg-light text-muted border-end-0">
                  <i class="bi bi-person-badge"></i>
                </span>
                <input
                  id="msnvInput"
                  v-model="msnv"
                  type="text"
                  class="form-control border-start-0"
                  placeholder="Ví dụ: NV001"
                  autocomplete="username"
                  autofocus
                  :disabled="isLoading"
                  required
                />
              </div>
            </div>

            <!-- Mật khẩu -->
            <div class="mb-4">
              <label for="passwordInput" class="form-label small fw-semibold text-secondary">
                Mật khẩu
              </label>
              <div class="input-group">
                <span class="input-group-text bg-light text-muted border-end-0">
                  <i class="bi bi-key-fill"></i>
                </span>
                <input
                  id="passwordInput"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  class="form-control border-start-0 border-end-0"
                  placeholder="Nhập mật khẩu"
                  autocomplete="current-password"
                  :disabled="isLoading"
                  required
                />
                <button
                  class="btn btn-outline-secondary border-start-0 text-muted"
                  type="button"
                  :disabled="isLoading"
                  @click="togglePasswordVisibility"
                  aria-label="Ẩn hoặc hiện mật khẩu"
                >
                  <i class="bi" :class="showPassword ? 'bi-eye-slash' : 'bi-eye'"></i>
                </button>
              </div>
            </div>

            <!-- Nút Đăng nhập -->
            <button
              type="submit"
              class="btn btn-primary w-100 py-2 fw-semibold rounded-3 shadow-sm d-flex align-items-center justify-content-center gap-2"
              :disabled="isLoading"
            >
              <span
                v-if="isLoading"
                class="spinner-border spinner-border-sm"
                role="status"
                aria-hidden="true"
              ></span>
              <i v-else class="bi bi-box-arrow-in-right"></i>
              <span>{{ isLoading ? 'Đang xác thực...' : 'Đăng nhập' }}</span>
            </button>
          </form>
        </div>

        <div class="card-footer bg-light border-0 py-3 text-center rounded-bottom-4">
          <span class="text-muted small">
            Dành riêng cho Thủ thư và Quản trị viên
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.form-control:focus {
  box-shadow: none;
  border-color: var(--bs-primary);
}
</style>
