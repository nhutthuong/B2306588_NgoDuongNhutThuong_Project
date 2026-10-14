<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue';
import { Modal } from 'bootstrap';
import publisherApi from '../api/publisher.api.js';
import { getErrorMessage, getFieldErrors } from '../api/http.js';

const emit = defineEmits(['saved']);

const modalRef = ref(null);
let modalInstance = null;

const mode = ref('create'); // 'create' | 'edit'
const targetMaNXB = ref('');
const isSubmitting = ref(false);

const form = reactive({
  TenNXB: '',
  DiaChi: '',
});

const errors = reactive({
  TenNXB: '',
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

const resetState = () => {
  form.TenNXB = '';
  form.DiaChi = '';
  errors.TenNXB = '';
  errors.DiaChi = '';
  errors.general = '';
  isSubmitting.value = false;
};

/**
 * Mở modal thêm mới NXB
 */
const openCreate = () => {
  resetState();
  mode.value = 'create';
  targetMaNXB.value = '';
  if (modalInstance) {
    modalInstance.show();
  }
};

/**
 * Mở modal chỉnh sửa NXB
 * @param {object} publisher
 */
const openEdit = (publisher) => {
  resetState();
  mode.value = 'edit';
  targetMaNXB.value = publisher.MaNXB;
  form.TenNXB = publisher.TenNXB || '';
  form.DiaChi = publisher.DiaChi || '';
  if (modalInstance) {
    modalInstance.show();
  }
};

const close = () => {
  if (!isSubmitting.value && modalInstance) {
    modalInstance.hide();
  }
};

/**
 * Validate form phía client (chỉ phục vụ trải nghiệm người dùng UX, backend vẫn kiểm tra bắt buộc)
 */
const validateForm = () => {
  let isValid = true;
  errors.TenNXB = '';
  errors.DiaChi = '';
  errors.general = '';

  const trimmedTen = form.TenNXB.trim();
  if (!trimmedTen) {
    errors.TenNXB = 'Tên nhà xuất bản là bắt buộc';
    isValid = false;
  } else if (trimmedTen.length > 100) {
    errors.TenNXB = 'Tên nhà xuất bản không được vượt quá 100 ký tự';
    isValid = false;
  }

  const trimmedDiaChi = form.DiaChi.trim();
  if (trimmedDiaChi.length > 200) {
    errors.DiaChi = 'Địa chỉ không được vượt quá 200 ký tự';
    isValid = false;
  }

  return isValid;
};

const handleSubmit = async () => {
  if (!validateForm()) return;

  isSubmitting.value = true;
  errors.general = '';

  const payload = {
    TenNXB: form.TenNXB.trim(),
    DiaChi: form.DiaChi.trim(),
  };

  try {
    let result;
    if (mode.value === 'create') {
      const response = await publisherApi.create(payload);
      result = response.data;
      emit('saved', {
        mode: 'create',
        data: result?.data,
        message: 'Thêm nhà xuất bản mới thành công.',
      });
    } else {
      const response = await publisherApi.update(targetMaNXB.value, payload);
      result = response.data;
      emit('saved', {
        mode: 'edit',
        data: result?.data,
        message: 'Cập nhật nhà xuất bản thành công.',
      });
    }
    close();
  } catch (error) {
    const status = error.response?.status;
    const errorCode = error.response?.data?.error?.code;

    // Lỗi 400 validation: gắn lỗi vào từng trường
    if (status === 400) {
      const fieldErrors = getFieldErrors(error);
      if (fieldErrors.TenNXB) errors.TenNXB = fieldErrors.TenNXB;
      if (fieldErrors.DiaChi) errors.DiaChi = fieldErrors.DiaChi;
      if (!fieldErrors.TenNXB && !fieldErrors.DiaChi) {
        errors.general = getErrorMessage(error);
      }
    }
    // Lỗi 409 trùng tên: gắn vào ô Tên NXB
    else if (status === 409 && errorCode === 'DUPLICATE') {
      errors.TenNXB = error.response?.data?.error?.message || 'Tên nhà xuất bản đã tồn tại trong hệ thống';
    } else {
      errors.general = getErrorMessage(error);
    }
  } finally {
    isSubmitting.value = false;
  }
};

defineExpose({
  openCreate,
  openEdit,
  close,
});
</script>

<template>
  <div
    ref="modalRef"
    class="modal fade"
    tabindex="-1"
    aria-labelledby="publisherFormModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content border-0 shadow">
        <form @submit.prevent="handleSubmit" novalidate>
          <div class="modal-header border-bottom">
            <h5 class="modal-title fw-bold d-flex align-items-center gap-2" id="publisherFormModalLabel">
              <i class="bi bi-building text-primary"></i>
              <span>{{ mode === 'create' ? 'Thêm Nhà xuất bản mới' : 'Chỉnh sửa Nhà xuất bản' }}</span>
            </h5>
            <button
              type="button"
              class="btn-close"
              :disabled="isSubmitting"
              aria-label="Đóng"
              @click="close"
            ></button>
          </div>

          <div class="modal-body py-3">
            <!-- Thông báo lỗi chung nếu có -->
            <div
              v-if="errors.general"
              class="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-3"
            >
              <i class="bi bi-exclamation-octagon-fill"></i>
              <span style="white-space: pre-line;">{{ errors.general }}</span>
            </div>

            <!-- Mã NXB (chỉ xem khi sửa) -->
            <div v-if="mode === 'edit'" class="mb-3">
              <label class="form-label small text-muted mb-1">Mã nhà xuất bản</label>
              <div>
                <span class="badge bg-light text-dark border px-2 py-1 fs-6 font-monospace">
                  {{ targetMaNXB }}
                </span>
              </div>
            </div>

            <!-- Tên NXB -->
            <div class="mb-3">
              <label for="publisherTenNXB" class="form-label small fw-bold">
                Tên nhà xuất bản <span class="text-danger">*</span>
              </label>
              <input
                id="publisherTenNXB"
                v-model="form.TenNXB"
                type="text"
                class="form-control"
                :class="{ 'is-invalid': errors.TenNXB }"
                placeholder="Nhập tên nhà xuất bản (tối đa 100 ký tự)"
                maxlength="100"
                :disabled="isSubmitting"
                required
              />
              <div v-if="errors.TenNXB" class="invalid-feedback">
                {{ errors.TenNXB }}
              </div>
            </div>

            <!-- Địa chỉ -->
            <div class="mb-2">
              <label for="publisherDiaChi" class="form-label small fw-bold">
                Địa chỉ
              </label>
              <input
                id="publisherDiaChi"
                v-model="form.DiaChi"
                type="text"
                class="form-control"
                :class="{ 'is-invalid': errors.DiaChi }"
                placeholder="Nhập địa chỉ nhà xuất bản (tối đa 200 ký tự)"
                maxlength="200"
                :disabled="isSubmitting"
              />
              <div v-if="errors.DiaChi" class="invalid-feedback">
                {{ errors.DiaChi }}
              </div>
            </div>
          </div>

          <div class="modal-footer border-top bg-light">
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="isSubmitting"
              @click="close"
            >
              Hủy
            </button>
            <button
              type="submit"
              class="btn btn-primary btn-sm d-flex align-items-center gap-1"
              :disabled="isSubmitting"
            >
              <span
                v-if="isSubmitting"
                class="spinner-border spinner-border-sm"
                role="status"
                aria-hidden="true"
              ></span>
              <span>{{ mode === 'create' ? 'Thêm mới' : 'Lưu thay đổi' }}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
