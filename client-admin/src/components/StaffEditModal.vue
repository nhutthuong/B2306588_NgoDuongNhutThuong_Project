<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue';
import { Modal } from 'bootstrap';
import staffApi from '../api/staff.api.js';
import { getErrorMessage, getFieldErrors } from '../api/http.js';

const emit = defineEmits(['updated']);

const modalRef = ref(null);
let modalInstance = null;

const isSubmitting = ref(false);
const targetMsnv = ref('');

const form = reactive({
  HoTenNV: '',
  ChucVu: '',
  SoDienThoai: '',
  DiaChi: '',
});

const errors = reactive({
  HoTenNV: '',
  ChucVu: '',
  SoDienThoai: '',
  DiaChi: '',
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

const resetErrors = () => {
  errors.HoTenNV = '';
  errors.ChucVu = '';
  errors.SoDienThoai = '';
  errors.DiaChi = '';
  errors.general = '';
};

const open = (staff) => {
  if (!staff) return;
  resetErrors();
  targetMsnv.value = staff.MSNV;
  form.HoTenNV = staff.HoTenNV || '';
  form.ChucVu = staff.ChucVu || '';
  form.SoDienThoai = staff.SoDienThoai || '';
  form.DiaChi = staff.DiaChi || '';
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

const validateClient = () => {
  let isValid = true;
  resetErrors();

  const hoTen = form.HoTenNV.trim();
  if (!hoTen) {
    errors.HoTenNV = 'Họ và tên nhân viên không được để trống';
    isValid = false;
  } else if (hoTen.length < 2 || hoTen.length > 100) {
    errors.HoTenNV = 'Họ và tên phải từ 2 đến 100 ký tự';
    isValid = false;
  }

  if (form.ChucVu && form.ChucVu.trim().length > 100) {
    errors.ChucVu = 'Chức vụ không được vượt quá 100 ký tự';
    isValid = false;
  }

  const phone = form.SoDienThoai.trim();
  if (phone) {
    const phoneRegex = /^0[35789]\d{8}$/;
    if (!phoneRegex.test(phone)) {
      errors.SoDienThoai = 'Số điện thoại không đúng định dạng (10 chữ số, đầu số VN: 03, 05, 07, 08, 09)';
      isValid = false;
    }
  }

  if (form.DiaChi && form.DiaChi.trim().length > 200) {
    errors.DiaChi = 'Địa chỉ không được vượt quá 200 ký tự';
    isValid = false;
  }

  return isValid;
};

const handleSubmit = async () => {
  if (!validateClient()) {
    return;
  }

  isSubmitting.value = true;
  errors.general = '';

  try {
    const payload = {
      HoTenNV: form.HoTenNV.trim(),
      ChucVu: form.ChucVu.trim(),
      SoDienThoai: form.SoDienThoai.trim(),
      DiaChi: form.DiaChi.trim(),
    };

    const res = await staffApi.update(targetMsnv.value, payload);
    const updatedStaff = res.data?.data;

    close();
    emit('updated', updatedStaff);
  } catch (err) {
    const fieldErrs = getFieldErrors(err);
    if (fieldErrs && Object.keys(fieldErrs).length > 0) {
      Object.assign(errors, fieldErrs);
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
    aria-labelledby="staffEditModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content border-0 shadow">
        <div class="modal-header bg-light border-bottom">
          <div class="d-flex align-items-center gap-2">
            <div class="p-2 bg-primary-subtle text-primary rounded">
              <i class="bi bi-pencil-square fs-5"></i>
            </div>
            <div>
              <h5 id="staffEditModalLabel" class="modal-title fw-bold mb-0">
                Sửa thông tin nhân viên
              </h5>
              <div class="small text-muted font-monospace">Mã NV: {{ targetMsnv }}</div>
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

            <div class="row g-3">
              <!-- Mã nhân viên (Read-only) -->
              <div class="col-12">
                <label class="form-label fw-semibold small text-muted">
                  Mã nhân viên (Hệ thống cấp)
                </label>
                <input
                  type="text"
                  class="form-control bg-light font-monospace"
                  :value="targetMsnv"
                  disabled
                />
              </div>

              <!-- Họ và tên -->
              <div class="col-12">
                <label for="editHoTenNV" class="form-label fw-semibold small">
                  Họ và tên nhân viên <span class="text-danger">*</span>
                </label>
                <input
                  id="editHoTenNV"
                  v-model="form.HoTenNV"
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': errors.HoTenNV }"
                  placeholder="Ví dụ: Nguyễn Văn An"
                  maxlength="100"
                  required
                  :disabled="isSubmitting"
                />
                <div v-if="errors.HoTenNV" class="invalid-feedback">
                  {{ errors.HoTenNV }}
                </div>
              </div>

              <!-- Chức vụ -->
              <div class="col-12">
                <label for="editChucVu" class="form-label fw-semibold small">
                  Chức vụ công tác
                </label>
                <input
                  id="editChucVu"
                  v-model="form.ChucVu"
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': errors.ChucVu }"
                  placeholder="Ví dụ: Thủ thư mượn trả"
                  maxlength="100"
                  :disabled="isSubmitting"
                />
                <div v-if="errors.ChucVu" class="invalid-feedback">
                  {{ errors.ChucVu }}
                </div>
              </div>

              <!-- Số điện thoại -->
              <div class="col-12">
                <label for="editSoDienThoai" class="form-label fw-semibold small">
                  Số điện thoại
                </label>
                <div class="input-group">
                  <span class="input-group-text bg-light text-muted">
                    <i class="bi bi-telephone"></i>
                  </span>
                  <input
                    id="editSoDienThoai"
                    v-model="form.SoDienThoai"
                    type="tel"
                    class="form-control"
                    :class="{ 'is-invalid': errors.SoDienThoai }"
                    placeholder="Ví dụ: 0912345678"
                    maxlength="10"
                    :disabled="isSubmitting"
                  />
                  <div v-if="errors.SoDienThoai" class="invalid-feedback">
                    {{ errors.SoDienThoai }}
                  </div>
                </div>
              </div>

              <!-- Địa chỉ -->
              <div class="col-12">
                <label for="editDiaChi" class="form-label fw-semibold small">
                  Địa chỉ liên hệ
                </label>
                <input
                  id="editDiaChi"
                  v-model="form.DiaChi"
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': errors.DiaChi }"
                  placeholder="Ví dụ: Ninh Kiều, Cần Thơ"
                  maxlength="200"
                  :disabled="isSubmitting"
                />
                <div v-if="errors.DiaChi" class="invalid-feedback">
                  {{ errors.DiaChi }}
                </div>
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
              class="btn btn-primary px-4 d-flex align-items-center gap-2"
              :disabled="isSubmitting"
            >
              <span
                v-if="isSubmitting"
                class="spinner-border spinner-border-sm"
                role="status"
                aria-hidden="true"
              ></span>
              <i v-else class="bi bi-save"></i>
              <span>{{ isSubmitting ? 'Đang lưu...' : 'Lưu thay đổi' }}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
