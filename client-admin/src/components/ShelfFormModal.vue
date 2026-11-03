<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue';
import { Modal } from 'bootstrap';
import shelfApi from '../api/shelf.api.js';
import { getErrorMessage, getFieldErrors } from '../api/http.js';

const emit = defineEmits(['saved']);

const modalRef = ref(null);
let modalInstance = null;

const mode = ref('create'); // 'create' | 'edit'
const targetMaKe = ref('');
const isSubmitting = ref(false);

const form = reactive({
  TenKe: '',
  KhuVuc: '',
  SoNgan: 5,
});

const errors = reactive({
  TenKe: '',
  KhuVuc: '',
  SoNgan: '',
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
  form.TenKe = '';
  form.KhuVuc = '';
  form.SoNgan = 5;
  errors.TenKe = '';
  errors.KhuVuc = '';
  errors.SoNgan = '';
  errors.general = '';
  isSubmitting.value = false;
};

const openCreate = () => {
  resetState();
  mode.value = 'create';
  targetMaKe.value = '';
  if (modalInstance) {
    modalInstance.show();
  }
};

const openEdit = (shelf) => {
  resetState();
  mode.value = 'edit';
  targetMaKe.value = shelf.MaKe;
  form.TenKe = shelf.TenKe || '';
  form.KhuVuc = shelf.KhuVuc || '';
  form.SoNgan = shelf.SoNgan || 5;
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
  let valid = true;
  errors.TenKe = '';
  errors.KhuVuc = '';
  errors.SoNgan = '';
  errors.general = '';

  const trimmedTen = form.TenKe.trim();
  if (!trimmedTen) {
    errors.TenKe = 'Tên kệ sách là bắt buộc';
    valid = false;
  } else if (trimmedTen.length > 100) {
    errors.TenKe = 'Tên kệ sách không được vượt quá 100 ký tự';
    valid = false;
  }

  const trimmedKhuVuc = form.KhuVuc.trim();
  if (!trimmedKhuVuc) {
    errors.KhuVuc = 'Khu vực đặt kệ là bắt buộc';
    valid = false;
  } else if (trimmedKhuVuc.length > 100) {
    errors.KhuVuc = 'Khu vực không được vượt quá 100 ký tự';
    valid = false;
  }

  const soNganNum = Number(form.SoNgan);
  if (!soNganNum || isNaN(soNganNum) || soNganNum < 1 || soNganNum > 20) {
    errors.SoNgan = 'Số ngăn phải là số nguyên từ 1 đến 20';
    valid = false;
  }

  return valid;
};

const handleSubmit = async () => {
  if (!validateClient()) return;

  isSubmitting.value = true;
  errors.general = '';

  const payload = {
    TenKe: form.TenKe.trim(),
    KhuVuc: form.KhuVuc.trim(),
    SoNgan: Math.floor(Number(form.SoNgan)),
  };

  try {
    let res;
    if (mode.value === 'create') {
      res = await shelfApi.create(payload);
    } else {
      res = await shelfApi.update(targetMaKe.value, payload);
    }

    close();
    emit('saved', {
      mode: mode.value,
      shelf: res.data?.data,
      message:
        mode.value === 'create'
          ? `Thêm mới kệ sách "${payload.TenKe}" thành công.`
          : `Cập nhật kệ sách "${payload.TenKe}" thành công.`,
    });
  } catch (err) {
    const fieldErrs = getFieldErrors(err);
    if (fieldErrs && Object.keys(fieldErrs).length > 0) {
      if (fieldErrs.TenKe) errors.TenKe = fieldErrs.TenKe;
      if (fieldErrs.KhuVuc) errors.KhuVuc = fieldErrs.KhuVuc;
      if (fieldErrs.SoNgan) errors.SoNgan = fieldErrs.SoNgan;
    }
    errors.general = getErrorMessage(err);
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
    aria-labelledby="shelfFormModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content shadow border-0 rounded-4">
        <form @submit.prevent="handleSubmit" novalidate>
          <div class="modal-header border-bottom py-3 px-4">
            <h5 class="modal-title fw-bold text-dark d-flex align-items-center gap-2" id="shelfFormModalLabel">
              <i class="bi text-primary" :class="mode === 'create' ? 'bi-plus-circle-fill' : 'bi-pencil-square'"></i>
              <span>{{ mode === 'create' ? 'Thêm mới kệ sách' : `Chỉnh sửa kệ sách (${targetMaKe})` }}</span>
            </h5>
            <button
              type="button"
              class="btn-close"
              :disabled="isSubmitting"
              @click="close"
              aria-label="Đóng"
            ></button>
          </div>

          <div class="modal-body p-4">
            <!-- Thông báo lỗi chung -->
            <div v-if="errors.general" class="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-3">
              <i class="bi bi-exclamation-triangle-fill flex-shrink-0"></i>
              <div>{{ errors.general }}</div>
            </div>

            <!-- Tên kệ sách -->
            <div class="mb-3">
              <label for="shelfName" class="form-label fw-semibold small text-dark">
                Tên kệ sách <span class="text-danger">*</span>
              </label>
              <input
                id="shelfName"
                v-model="form.TenKe"
                type="text"
                class="form-control"
                :class="{ 'is-invalid': errors.TenKe }"
                placeholder="Ví dụ: Kệ CNTT 01, Kệ Văn học Việt Nam..."
                maxlength="100"
                :disabled="isSubmitting"
                required
              />
              <div v-if="errors.TenKe" class="invalid-feedback">
                {{ errors.TenKe }}
              </div>
            </div>

            <!-- Khu vực -->
            <div class="mb-3">
              <label for="shelfArea" class="form-label fw-semibold small text-dark">
                Khu vực / Tầng <span class="text-danger">*</span>
              </label>
              <input
                id="shelfArea"
                v-model="form.KhuVuc"
                type="text"
                class="form-control"
                :class="{ 'is-invalid': errors.KhuVuc }"
                placeholder="Ví dụ: Tầng 1 - Phòng đọc mở, Tầng 2 - Khu B..."
                maxlength="100"
                :disabled="isSubmitting"
                required
              />
              <div v-if="errors.KhuVuc" class="invalid-feedback">
                {{ errors.KhuVuc }}
              </div>
            </div>

            <!-- Số tầng / ngăn của kệ -->
            <div class="mb-3">
              <label for="shelfTiers" class="form-label fw-semibold small text-dark">
                Số ngăn / tầng của kệ <span class="text-danger">*</span>
              </label>
              <div class="input-group">
                <input
                  id="shelfTiers"
                  v-model.number="form.SoNgan"
                  type="number"
                  min="1"
                  max="20"
                  class="form-control"
                  :class="{ 'is-invalid': errors.SoNgan }"
                  placeholder="5"
                  :disabled="isSubmitting"
                  required
                />
                <span class="input-group-text text-muted">ngăn (tầng)</span>
                <div v-if="errors.SoNgan" class="invalid-feedback">
                  {{ errors.SoNgan }}
                </div>
              </div>
              <div class="form-text small text-muted">
                Số tầng ngăn giúp phân chia vị trí sách (từ 1 đến 20 ngăn).
              </div>
            </div>
          </div>

          <div class="modal-footer border-top py-3 px-4 bg-light bg-opacity-50">
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
              <span v-if="isSubmitting" class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
              <i v-else class="bi bi-check2"></i>
              <span>{{ mode === 'create' ? 'Tạo kệ sách' : 'Lưu thay đổi' }}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

