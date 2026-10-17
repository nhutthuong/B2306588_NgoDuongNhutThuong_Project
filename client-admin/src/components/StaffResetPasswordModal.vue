<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue';
import { Modal } from 'bootstrap';
import staffApi from '../api/staff.api.js';
import { getErrorMessage, getFieldErrors } from '../api/http.js';

const emit = defineEmits(['updated']);

const modalRef = ref(null);
let modalInstance = null;

const isSubmitting = ref(false);
const showPassword = ref(false);
const staffData = ref(null);
const newPassword = ref('');

const errors = reactive({
  Password: '',
  general: '',
});

onMounted(() => {
  if (modalRef.value) {
    modalInstance = new Modal(modalRef.value, {
      backdrop: 'static',
      keyboard: true,
    });
  }
});

onUnmounted(() => {
  if (modalInstance) {
    modalInstance.dispose();
    modalInstance = null;
  }
});

const resetState = () => {
  newPassword.value = '';
  showPassword.value = false;
  errors.Password = '';
  errors.general = '';
  isSubmitting.value = false;
};

const open = (staff) => {
  if (!staff) return;
  resetState();
  staffData.value = staff;

  if (modalInstance) {
    modalInstance.show();
  }
};

const close = () => {
  if (!isSubmitting.value && modalInstance) {
    modalInstance.hide();
  }
};

const validatePassword = () => {
  errors.Password = '';
  errors.general = '';
  const pwd = newPassword.value;

  if (!pwd) {
    errors.Password = 'Vui lòng nhập mật khẩu tạm thời mới';
    return false;
  }
  if (pwd.length < 8) {
    errors.Password = 'Mật khẩu phải có độ dài ít nhất 8 ký tự';
    return false;
  }
  if (!/[A-Z]/.test(pwd)) {
    errors.Password = 'Mật khẩu phải chứa ít nhất 1 chữ in hoa';
    return false;
  }
  if (!/[a-z]/.test(pwd)) {
    errors.Password = 'Mật khẩu phải chứa ít nhất 1 chữ thường';
    return false;
  }
  if (!/[0-9]/.test(pwd)) {
    errors.Password = 'Mật khẩu phải chứa ít nhất 1 chữ số';
    return false;
  }
  if (!/[^A-Za-z0-9]/.test(pwd)) {
    errors.Password = 'Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt (@, #, $, %, ...)';
    return false;
  }
  return true;
};

const handleSubmit = async () => {
  if (!validatePassword() || !staffData.value) {
    return;
  }

  isSubmitting.value = true;
  errors.general = '';

  try {
    await staffApi.resetPassword(staffData.value.MSNV, {
      Password: newPassword.value,
    });

    close();
    emit('updated', staffData.value);
  } catch (err) {
    const fieldErrs = getFieldErrors(err);
    if (fieldErrs?.Password) {
      errors.Password = fieldErrs.Password;
    } else {
      errors.general = getErrorMessage(err);
    }
  } finally {
    isSubmitting.value = false;
  }
};

defineExpose({
  open,
  close,
});
</script>

<template>
  <div
    ref="modalRef"
    class="modal fade"
    tabindex="-1"
    aria-labelledby="staffResetPasswordModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content border-0 shadow">
        <div class="modal-header bg-light border-bottom">
          <div class="d-flex align-items-center gap-2">
            <div class="p-2 bg-danger-subtle text-danger rounded">
              <i class="bi bi-key-fill fs-5"></i>
            </div>
            <div>
              <h5 id="staffResetPasswordModalLabel" class="modal-title fw-bold mb-0">
                Cấp lại mật khẩu tạm thời
              </h5>
              <div class="small text-muted font-monospace">Mã NV: {{ staffData?.MSNV }}</div>
            </div>
          </div>
          <button
            type="button"
            class="btn-close"
            :disabled="isSubmitting"
            @click="close"
            aria-label="Đóng"
          ></button>
        </div>

        <form @submit.prevent="handleSubmit">
          <div class="modal-body p-4">
            <!-- Thông báo lỗi chung -->
            <div
              v-if="errors.general"
              class="alert alert-danger d-flex align-items-center gap-2 mb-3 py-2"
              role="alert"
            >
              <i class="bi bi-exclamation-triangle-fill flex-shrink-0"></i>
              <div class="small">{{ errors.general }}</div>
            </div>

            <!-- Nhân viên mục tiêu -->
            <div class="card bg-light border-0 p-3 mb-3">
              <div class="d-flex align-items-center justify-content-between">
                <span class="text-muted small">Nhân viên:</span>
                <span class="fw-bold">{{ staffData?.HoTenNV }} ({{ staffData?.MSNV }})</span>
              </div>
            </div>

            <!-- Cảnh báo an toàn -->
            <div class="alert alert-warning d-flex align-items-start gap-2 mb-3 py-2">
              <i class="bi bi-exclamation-triangle-fill text-warning mt-1 flex-shrink-0"></i>
              <div class="small">
                Khi cấp mật khẩu tạm: toàn bộ phiên đăng nhập của nhân viên này sẽ <strong>bị thu hồi ngay lập tức</strong>.
                Nhân viên sẽ phải đăng nhập bằng mật khẩu tạm này và <strong>bắt buộc đổi mật khẩu mới</strong>.
              </div>
            </div>

            <!-- Mật khẩu tạm thời mới -->
            <div class="mb-3">
              <label for="newStaffPassword" class="form-label fw-semibold small">
                Mật khẩu tạm thời mới <span class="text-danger">*</span>
              </label>
              <div class="input-group">
                <span class="input-group-text bg-light text-muted">
                  <i class="bi bi-lock"></i>
                </span>
                <input
                  id="newStaffPassword"
                  v-model="newPassword"
                  :type="showPassword ? 'text' : 'password'"
                  class="form-control"
                  :class="{ 'is-invalid': errors.Password }"
                  placeholder="Nhập mật khẩu tạm thời mới..."
                  autocomplete="new-password"
                  required
                  :disabled="isSubmitting"
                />
                <button
                  type="button"
                  class="btn btn-outline-secondary"
                  :disabled="isSubmitting"
                  tabindex="-1"
                  @click="showPassword = !showPassword"
                  :title="showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'"
                >
                  <i class="bi" :class="showPassword ? 'bi-eye-slash' : 'bi-eye'"></i>
                </button>
                <div v-if="errors.Password" class="invalid-feedback">
                  {{ errors.Password }}
                </div>
              </div>
              <div class="form-text small text-muted">
                Yêu cầu: ≥ 8 ký tự, ít nhất 1 chữ hoa, 1 chữ thường, 1 số và 1 ký tự đặc biệt.
              </div>
            </div>
          </div>

          <div class="modal-footer bg-light border-top">
            <button
              type="button"
              class="btn btn-outline-secondary px-3"
              :disabled="isSubmitting"
              @click="close"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              class="btn btn-danger px-4 d-flex align-items-center gap-2"
              :disabled="isSubmitting"
            >
              <span
                v-if="isSubmitting"
                class="spinner-border spinner-border-sm"
                role="status"
                aria-hidden="true"
              ></span>
              <i v-else class="bi bi-key"></i>
              <span>{{ isSubmitting ? 'Đang cấp lại...' : 'Cấp lại mật khẩu' }}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
