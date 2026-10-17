<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { Modal } from 'bootstrap';
import staffApi from '../api/staff.api.js';
import { getErrorMessage } from '../api/http.js';

const emit = defineEmits(['updated']);

const modalRef = ref(null);
let modalInstance = null;

const isSubmitting = ref(false);
const staffData = ref(null);
const selectedRole = ref('thuthu');
const errorMessage = ref('');

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

const isDowngrade = computed(() => {
  return staffData.value?.VaiTro === 'admin' && selectedRole.value === 'thuthu';
});

const isSameRole = computed(() => {
  return staffData.value?.VaiTro === selectedRole.value;
});

const open = (staff) => {
  if (!staff) return;
  staffData.value = staff;
  selectedRole.value = staff.VaiTro === 'admin' ? 'thuthu' : 'admin';
  errorMessage.value = '';
  isSubmitting.value = false;

  if (modalInstance) {
    modalInstance.show();
  }
};

const close = () => {
  if (!isSubmitting.value && modalInstance) {
    modalInstance.hide();
  }
};

const handleSubmit = async () => {
  if (!staffData.value || isSameRole.value) {
    return;
  }

  isSubmitting.value = true;
  errorMessage.value = '';

  try {
    const res = await staffApi.changeRole(staffData.value.MSNV, {
      VaiTro: selectedRole.value,
    });
    const updated = res.data?.data;

    close();
    emit('updated', updated);
  } catch (err) {
    errorMessage.value = getErrorMessage(err);
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
    aria-labelledby="staffRoleModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content border-0 shadow">
        <div class="modal-header bg-light border-bottom">
          <div class="d-flex align-items-center gap-2">
            <div class="p-2 bg-warning-subtle text-warning-emphasis rounded">
              <i class="bi bi-shield-check fs-5"></i>
            </div>
            <div>
              <h5 id="staffRoleModalLabel" class="modal-title fw-bold mb-0">
                Thay đổi vai trò nhân viên
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
            <!-- Thông báo lỗi nếu có -->
            <div
              v-if="errorMessage"
              class="alert alert-danger d-flex align-items-center gap-2 mb-3 py-2"
              role="alert"
            >
              <i class="bi bi-exclamation-triangle-fill flex-shrink-0"></i>
              <div class="small">{{ errorMessage }}</div>
            </div>

            <!-- Thông tin nhân viên hiện tại -->
            <div class="card bg-light border-0 p-3 mb-3">
              <div class="d-flex align-items-center justify-content-between mb-2">
                <span class="text-muted small">Họ và tên:</span>
                <span class="fw-bold">{{ staffData?.HoTenNV }}</span>
              </div>
              <div class="d-flex align-items-center justify-content-between">
                <span class="text-muted small">Vai trò hiện tại:</span>
                <span
                  v-if="staffData?.VaiTro === 'admin'"
                  class="badge bg-primary-subtle text-primary border border-primary-subtle"
                >
                  <i class="bi bi-shield-lock-fill me-1"></i>Quản trị viên
                </span>
                <span
                  v-else
                  class="badge bg-secondary-subtle text-secondary border border-secondary-subtle"
                >
                  <i class="bi bi-book-half me-1"></i>Thủ thư
                </span>
              </div>
            </div>

            <!-- Lựa chọn vai trò mới -->
            <div class="mb-3">
              <label class="form-label fw-semibold small d-block mb-2">
                Chọn vai trò mới:
              </label>
              <div class="d-flex flex-column gap-2">
                <label
                  class="card p-3 border cursor-pointer transition-all"
                  :class="selectedRole === 'thuthu' ? 'border-primary bg-primary-subtle bg-opacity-25' : 'border-light-subtle'"
                >
                  <div class="form-check">
                    <input
                      id="newRoleThuThu"
                      v-model="selectedRole"
                      class="form-check-input"
                      type="radio"
                      name="newRole"
                      value="thuthu"
                      :disabled="isSubmitting"
                    />
                    <label class="form-check-label fw-bold text-dark cursor-pointer" for="newRoleThuThu">
                      <i class="bi bi-book-half text-secondary me-1"></i>
                      Thủ thư (thuthu)
                    </label>
                  </div>
                  <div class="small text-muted mt-1 ps-4">
                    Quản lý sách, nhà xuất bản, xử lý mượn/trả sách cho độc giả.
                  </div>
                </label>

                <label
                  class="card p-3 border cursor-pointer transition-all"
                  :class="selectedRole === 'admin' ? 'border-primary bg-primary-subtle bg-opacity-25' : 'border-light-subtle'"
                >
                  <div class="form-check">
                    <input
                      id="newRoleAdmin"
                      v-model="selectedRole"
                      class="form-check-input"
                      type="radio"
                      name="newRole"
                      value="admin"
                      :disabled="isSubmitting"
                    />
                    <label class="form-check-label fw-bold text-dark cursor-pointer" for="newRoleAdmin">
                      <i class="bi bi-shield-lock-fill text-primary me-1"></i>
                      Quản trị viên (admin)
                    </label>
                  </div>
                  <div class="small text-muted mt-1 ps-4">
                    Toàn quyền hệ thống: quản lý tài khoản nhân viên, cấu hình, nhật ký kiểm toán.
                  </div>
                </label>
              </div>
            </div>

            <!-- Cảnh báo nếu hạ quyền từ admin xuống thuthu -->
            <div
              v-if="isDowngrade"
              class="alert alert-warning d-flex align-items-start gap-2 mb-0 py-2"
              role="alert"
            >
              <i class="bi bi-exclamation-circle-fill text-warning mt-1 flex-shrink-0"></i>
              <div class="small">
                <strong>Lưu ý quan trọng:</strong> Hạ quyền Quản trị viên sẽ tước quyền quản lý tài khoản và thiết lập hệ thống.
                Hệ thống yêu cầu phải luôn có ít nhất 1 Quản trị viên đang hoạt động.
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
              class="btn px-4 d-flex align-items-center gap-2"
              :class="isDowngrade ? 'btn-warning' : 'btn-primary'"
              :disabled="isSubmitting || isSameRole"
            >
              <span
                v-if="isSubmitting"
                class="spinner-border spinner-border-sm"
                role="status"
                aria-hidden="true"
              ></span>
              <i v-else class="bi bi-check-lg"></i>
              <span>{{ isSubmitting ? 'Đang cập nhật...' : 'Xác nhận đổi vai trò' }}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
.transition-all {
  transition: all 0.2s ease-in-out;
}
</style>
