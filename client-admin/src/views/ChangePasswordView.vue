<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { getErrorMessage } from '../api/http.js';

const router = useRouter();
const authStore = useAuthStore();

const matKhauCu = ref('');
const matKhauMoi = ref('');
const xacNhanMatKhau = ref('');

const showOldPassword = ref(false);
const showNewPassword = ref(false);
const showConfirmPassword = ref(false);

const isLoading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const isForcedChange = computed(() => authStore.mustChangePassword);

// Kiểm tra quy tắc mật khẩu mới theo thời gian thực
const hasMinLength = computed(() => matKhauMoi.value.length >= 8);
const hasUppercase = computed(() => /[A-Z]/.test(matKhauMoi.value));
const hasLowercase = computed(() => /[a-z]/.test(matKhauMoi.value));
const hasNumber = computed(() => /[0-9]/.test(matKhauMoi.value));
const isDifferentFromOld = computed(
  () => !matKhauMoi.value || !matKhauCu.value || matKhauMoi.value !== matKhauCu.value
);
const isMatching = computed(
  () => !xacNhanMatKhau.value || matKhauMoi.value === xacNhanMatKhau.value
);

const isPasswordStrong = computed(
  () =>
    hasMinLength.value &&
    hasUppercase.value &&
    hasLowercase.value &&
    hasNumber.value
);

const handleChangePassword = async () => {
  if (isLoading.value) return;

  errorMessage.value = '';
  successMessage.value = '';

  if (!matKhauCu.value) {
    errorMessage.value = 'Vui lòng nhập mật khẩu hiện tại.';
    return;
  }
  if (!matKhauMoi.value) {
    errorMessage.value = 'Vui lòng nhập mật khẩu mới.';
    return;
  }
  if (!isPasswordStrong.value) {
    errorMessage.value =
      'Mật khẩu mới phải có tối thiểu 8 ký tự, bao gồm ít nhất 1 chữ hoa, 1 chữ thường và 1 số.';
    return;
  }
  if (matKhauMoi.value === matKhauCu.value) {
    errorMessage.value = 'Mật khẩu mới phải khác mật khẩu hiện tại.';
    return;
  }
  if (matKhauMoi.value !== xacNhanMatKhau.value) {
    errorMessage.value = 'Xác nhận mật khẩu mới không trùng khớp.';
    return;
  }

  isLoading.value = true;

  try {
    await authStore.changePassword(matKhauCu.value, matKhauMoi.value);
    successMessage.value = 'Đổi mật khẩu thành công! Đang chuyển về trang chủ...';

    setTimeout(() => {
      router.push('/');
    }, 1200);
  } catch (err) {
    errorMessage.value = getErrorMessage(err);
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="row justify-content-center py-4">
    <div class="col-12 col-md-9 col-lg-7 col-xl-6">
      <!-- Banner bắt buộc đổi mật khẩu lần đầu -->
      <div
        v-if="isForcedChange"
        class="alert alert-warning border-warning shadow-sm rounded-3 mb-4 p-3 d-flex align-items-start gap-3"
        role="alert"
      >
        <i class="bi bi-shield-exclamation fs-3 text-warning flex-shrink-0"></i>
        <div>
          <h2 class="h6 fw-bold mb-1">Yêu cầu đổi mật khẩu lần đầu</h2>
          <p class="small mb-0 text-secondary">
            Tài khoản của bạn đang sử dụng mật khẩu mặc định hoặc mật khẩu tạm thời do hệ thống cấp.
            Để đảm bảo an toàn thông tin, vui lòng đổi mật khẩu mới trước khi thực hiện các tác vụ khác.
          </p>
        </div>
      </div>

      <div class="card shadow-sm border-0 rounded-4">
        <div class="card-header bg-white border-bottom py-3 px-4">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-key-fill text-primary fs-5"></i>
            <h1 class="h5 fw-bold mb-0">
              {{ isForcedChange ? 'Thiết lập mật khẩu mới' : 'Đổi mật khẩu tài khoản' }}
            </h1>
          </div>
        </div>

        <div class="card-body p-4">
          <!-- Thông báo thành công -->
          <div
            v-if="successMessage"
            class="alert alert-success d-flex align-items-center gap-2 py-2 px-3 small rounded-3 mb-3"
            role="alert"
          >
            <i class="bi bi-check-circle-fill fs-5 text-success"></i>
            <div>{{ successMessage }}</div>
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

          <form @submit.prevent="handleChangePassword" novalidate>
            <!-- Mật khẩu cũ -->
            <div class="mb-3">
              <label for="oldPassword" class="form-label small fw-semibold text-secondary">
                Mật khẩu hiện tại
              </label>
              <div class="input-group">
                <input
                  id="oldPassword"
                  v-model="matKhauCu"
                  :type="showOldPassword ? 'text' : 'password'"
                  class="form-control border-end-0"
                  placeholder="Nhập mật khẩu đang dùng"
                  autocomplete="current-password"
                  :disabled="isLoading"
                  required
                />
                <button
                  class="btn btn-outline-secondary border-start-0 text-muted"
                  type="button"
                  :disabled="isLoading"
                  @click="showOldPassword = !showOldPassword"
                  aria-label="Ẩn hoặc hiện mật khẩu cũ"
                >
                  <i class="bi" :class="showOldPassword ? 'bi-eye-slash' : 'bi-eye'"></i>
                </button>
              </div>
            </div>

            <!-- Mật khẩu mới -->
            <div class="mb-3">
              <label for="newPassword" class="form-label small fw-semibold text-secondary">
                Mật khẩu mới
              </label>
              <div class="input-group">
                <input
                  id="newPassword"
                  v-model="matKhauMoi"
                  :type="showNewPassword ? 'text' : 'password'"
                  class="form-control border-end-0"
                  placeholder="Nhập mật khẩu mới"
                  autocomplete="new-password"
                  :disabled="isLoading"
                  required
                />
                <button
                  class="btn btn-outline-secondary border-start-0 text-muted"
                  type="button"
                  :disabled="isLoading"
                  @click="showNewPassword = !showNewPassword"
                  aria-label="Ẩn hoặc hiện mật khẩu mới"
                >
                  <i class="bi" :class="showNewPassword ? 'bi-eye-slash' : 'bi-eye'"></i>
                </button>
              </div>

              <!-- Gợi ý quy tắc mật khẩu -->
              <div class="mt-2 p-2 bg-light rounded-2 border">
                <div class="small fw-semibold text-muted mb-1">Yêu cầu độ mạnh:</div>
                <div class="d-flex flex-wrap gap-2 small">
                  <span
                    class="badge rounded-pill"
                    :class="hasMinLength ? 'bg-success' : 'bg-secondary bg-opacity-50 text-dark'"
                  >
                    <i class="bi" :class="hasMinLength ? 'bi-check' : 'bi-dot'"></i>
                    Tối thiểu 8 ký tự
                  </span>
                  <span
                    class="badge rounded-pill"
                    :class="hasUppercase ? 'bg-success' : 'bg-secondary bg-opacity-50 text-dark'"
                  >
                    <i class="bi" :class="hasUppercase ? 'bi-check' : 'bi-dot'"></i>
                    Ít nhất 1 chữ hoa (A-Z)
                  </span>
                  <span
                    class="badge rounded-pill"
                    :class="hasLowercase ? 'bg-success' : 'bg-secondary bg-opacity-50 text-dark'"
                  >
                    <i class="bi" :class="hasLowercase ? 'bi-check' : 'bi-dot'"></i>
                    Ít nhất 1 chữ thường (a-z)
                  </span>
                  <span
                    class="badge rounded-pill"
                    :class="hasNumber ? 'bg-success' : 'bg-secondary bg-opacity-50 text-dark'"
                  >
                    <i class="bi" :class="hasNumber ? 'bi-check' : 'bi-dot'"></i>
                    Ít nhất 1 chữ số (0-9)
                  </span>
                </div>
              </div>
            </div>

            <!-- Xác nhận mật khẩu mới -->
            <div class="mb-4">
              <label for="confirmPassword" class="form-label small fw-semibold text-secondary">
                Nhập lại mật khẩu mới
              </label>
              <div class="input-group">
                <input
                  id="confirmPassword"
                  v-model="xacNhanMatKhau"
                  :type="showConfirmPassword ? 'text' : 'password'"
                  class="form-control border-end-0"
                  :class="{ 'is-invalid': xacNhanMatKhau && !isMatching }"
                  placeholder="Nhập lại mật khẩu mới"
                  autocomplete="new-password"
                  :disabled="isLoading"
                  required
                />
                <button
                  class="btn btn-outline-secondary border-start-0 text-muted"
                  type="button"
                  :disabled="isLoading"
                  @click="showConfirmPassword = !showConfirmPassword"
                  aria-label="Ẩn hoặc hiện mật khẩu xác nhận"
                >
                  <i class="bi" :class="showConfirmPassword ? 'bi-eye-slash' : 'bi-eye'"></i>
                </button>
              </div>
              <div v-if="xacNhanMatKhau && !isMatching" class="text-danger small mt-1">
                <i class="bi bi-x-circle me-1"></i>
                Mật khẩu xác nhận không trùng khớp
              </div>
            </div>

            <!-- Nút Lưu & Hủy -->
            <div class="d-flex align-items-center justify-content-end gap-2 pt-2 border-top">
              <RouterLink
                v-if="!isForcedChange"
                to="/"
                class="btn btn-outline-secondary px-3"
                :class="{ disabled: isLoading }"
              >
                Hủy bỏ
              </RouterLink>
              <button
                type="submit"
                class="btn btn-primary px-4 fw-semibold d-flex align-items-center gap-2"
                :disabled="isLoading || (matKhauMoi && !isPasswordStrong)"
              >
                <span
                  v-if="isLoading"
                  class="spinner-border spinner-border-sm"
                  role="status"
                  aria-hidden="true"
                ></span>
                <i v-else class="bi bi-check2"></i>
                <span>{{ isLoading ? 'Đang cập nhật...' : 'Lưu mật khẩu mới' }}</span>
              </button>
            </div>
          </form>
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
