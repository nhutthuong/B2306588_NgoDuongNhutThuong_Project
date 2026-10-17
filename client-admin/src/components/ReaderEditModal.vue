<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { Modal } from 'bootstrap';
import readerApi from '../api/reader.api.js';
import { getErrorMessage, getFieldErrors } from '../api/http.js';

const emit = defineEmits(['saved']);

const modalRef = ref(null);
let modalInstance = null;

const targetMaDocGia = ref('');
const isSubmitting = ref(false);

const form = reactive({
  HoLot: '',
  Ten: '',
  NgaySinh: '',
  Phai: 'Nam',
  DiaChi: '',
  DienThoai: '',
  Email: '',
});

const errors = reactive({
  HoLot: '',
  Ten: '',
  NgaySinh: '',
  Phai: '',
  DiaChi: '',
  DienThoai: '',
  general: '',
});

// Ngày tối đa cho ô chọn ngày sinh là ngày hôm nay (không cho chọn ngày tương lai)
const maxDate = computed(() => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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
  errors.HoLot = '';
  errors.Ten = '';
  errors.NgaySinh = '';
  errors.Phai = '';
  errors.DiaChi = '';
  errors.DienThoai = '';
  errors.general = '';
};

/**
 * Mở modal chỉnh sửa thông tin độc giả
 * @param {object} readerData - Bản ghi độc giả hiện tại
 */
const open = (readerData) => {
  resetErrors();
  targetMaDocGia.value = readerData.MaDocGia;

  // Format ngày sinh sang YYYY-MM-DD cho input type="date"
  let formattedNgaySinh = '';
  if (readerData.NgaySinh) {
    const d = new Date(readerData.NgaySinh);
    if (!isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      formattedNgaySinh = `${yyyy}-${mm}-${dd}`;
    }
  }

  form.HoLot = readerData.HoLot || '';
  form.Ten = readerData.Ten || '';
  form.NgaySinh = formattedNgaySinh;
  form.Phai = readerData.Phai || 'Nam';
  form.DiaChi = readerData.DiaChi || '';
  form.DienThoai = readerData.DienThoai || '';
  form.Email = readerData.Email || '';

  isSubmitting.value = false;

  if (modalInstance) {
    modalInstance.show();
  }
};

const close = () => {
  if (modalInstance && !isSubmitting.value) {
    modalInstance.hide();
  }
};

/**
 * Kiểm tra dữ liệu phía client trước khi gửi (chỉ để tối ưu UX)
 */
const validateClient = () => {
  resetErrors();
  let isValid = true;

  if (!form.HoLot.trim()) {
    errors.HoLot = 'Họ lót là bắt buộc';
    isValid = false;
  } else if (form.HoLot.trim().length > 50) {
    errors.HoLot = 'Họ lót không được vượt quá 50 ký tự';
    isValid = false;
  }

  if (!form.Ten.trim()) {
    errors.Ten = 'Tên là bắt buộc';
    isValid = false;
  } else if (form.Ten.trim().length > 30) {
    errors.Ten = 'Tên không được vượt quá 30 ký tự';
    isValid = false;
  }

  if (!form.NgaySinh) {
    errors.NgaySinh = 'Ngày sinh là bắt buộc';
    isValid = false;
  } else {
    const birthDate = new Date(form.NgaySinh);
    const today = new Date();
    if (birthDate >= today) {
      errors.NgaySinh = 'Ngày sinh phải nhỏ hơn ngày hiện tại';
      isValid = false;
    } else {
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      if (age < 5) {
        errors.NgaySinh = 'Độc giả phải có độ tuổi từ 5 tuổi trở lên';
        isValid = false;
      } else if (age > 120) {
        errors.NgaySinh = 'Ngày sinh không hợp lệ (độ tuổi tối đa là 120 tuổi)';
        isValid = false;
      }
    }
  }

  if (!['Nam', 'Nu', 'Khac'].includes(form.Phai)) {
    errors.Phai = 'Phái phải là Nam, Nữ hoặc Khác';
    isValid = false;
  }

  if (!form.DienThoai.trim()) {
    errors.DienThoai = 'Số điện thoại là bắt buộc';
    isValid = false;
  } else if (!/^(0|\+84)\d{9}$/.test(form.DienThoai.trim())) {
    errors.DienThoai = 'Số điện thoại không hợp lệ (vd: 0912345678 hoặc +84912345678)';
    isValid = false;
  }

  if (form.DiaChi && form.DiaChi.trim().length > 200) {
    errors.DiaChi = 'Địa chỉ không được vượt quá 200 ký tự';
    isValid = false;
  }

  return isValid;
};

const handleSubmit = async () => {
  if (!validateClient()) return;

  isSubmitting.value = true;
  errors.general = '';

  const payload = {
    HoLot: form.HoLot.trim(),
    Ten: form.Ten.trim(),
    NgaySinh: form.NgaySinh,
    Phai: form.Phai,
    DiaChi: form.DiaChi.trim(),
    DienThoai: form.DienThoai.trim(),
  };

  try {
    const res = await readerApi.update(targetMaDocGia.value, payload);
    const updatedReader = res.data?.data;
    close();
    emit('saved', updatedReader);
  } catch (err) {
    const fieldErrMap = getFieldErrors(err);
    if (Object.keys(fieldErrMap).length > 0) {
      if (fieldErrMap.HoLot) errors.HoLot = fieldErrMap.HoLot;
      if (fieldErrMap.Ten) errors.Ten = fieldErrMap.Ten;
      if (fieldErrMap.NgaySinh) errors.NgaySinh = fieldErrMap.NgaySinh;
      if (fieldErrMap.Phai) errors.Phai = fieldErrMap.Phai;
      if (fieldErrMap.DiaChi) errors.DiaChi = fieldErrMap.DiaChi;
      if (fieldErrMap.DienThoai) errors.DienThoai = fieldErrMap.DienThoai;
    }
    errors.general = getErrorMessage(err);
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
    id="readerEditModal"
    tabindex="-1"
    aria-labelledby="readerEditModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content border-0 shadow">
        <div class="modal-header bg-light">
          <h5 class="modal-title fw-bold d-flex align-items-center gap-2" id="readerEditModalLabel">
            <i class="bi bi-pencil-square text-primary"></i>
            <span>Chỉnh sửa thông tin độc giả ({{ targetMaDocGia }})</span>
          </h5>
          <button
            type="button"
            class="btn-close"
            :disabled="isSubmitting"
            aria-label="Đóng"
            @click="close"
          ></button>
        </div>

        <form @submit.prevent="handleSubmit" novalidate>
          <div class="modal-body p-4">
            <!-- Thông báo lỗi chung nếu có -->
            <div
              v-if="errors.general"
              class="alert alert-danger d-flex align-items-center gap-2 py-2 mb-3"
              role="alert"
            >
              <i class="bi bi-exclamation-triangle-fill flex-shrink-0"></i>
              <div>{{ errors.general }}</div>
            </div>

            <div class="row g-3">
              <!-- Email (Chỉ đọc) -->
              <div class="col-12">
                <label class="form-label fw-medium text-secondary">Địa chỉ Email</label>
                <div class="input-group">
                  <span class="input-group-text bg-light"><i class="bi bi-envelope"></i></span>
                  <input
                    type="email"
                    class="form-control bg-light"
                    :value="form.Email"
                    disabled
                    readonly
                  />
                </div>
                <div class="form-text text-muted">
                  <i class="bi bi-info-circle me-1"></i>Email đăng nhập không được phép thay đổi.
                </div>
              </div>

              <!-- Họ lót -->
              <div class="col-md-7">
                <label for="editHoLot" class="form-label fw-medium">
                  Họ lót <span class="text-danger">*</span>
                </label>
                <input
                  id="editHoLot"
                  v-model="form.HoLot"
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': errors.HoLot }"
                  placeholder="Ví dụ: Nguyễn Văn"
                  maxlength="50"
                  required
                />
                <div v-if="errors.HoLot" class="invalid-feedback">
                  {{ errors.HoLot }}
                </div>
              </div>

              <!-- Tên -->
              <div class="col-md-5">
                <label for="editTen" class="form-label fw-medium">
                  Tên <span class="text-danger">*</span>
                </label>
                <input
                  id="editTen"
                  v-model="form.Ten"
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': errors.Ten }"
                  placeholder="Ví dụ: An"
                  maxlength="30"
                  required
                />
                <div v-if="errors.Ten" class="invalid-feedback">
                  {{ errors.Ten }}
                </div>
              </div>

              <!-- Ngày sinh -->
              <div class="col-md-6">
                <label for="editNgaySinh" class="form-label fw-medium">
                  Ngày sinh <span class="text-danger">*</span>
                </label>
                <input
                  id="editNgaySinh"
                  v-model="form.NgaySinh"
                  type="date"
                  class="form-control"
                  :class="{ 'is-invalid': errors.NgaySinh }"
                  :max="maxDate"
                  required
                />
                <div v-if="errors.NgaySinh" class="invalid-feedback">
                  {{ errors.NgaySinh }}
                </div>
              </div>

              <!-- Giới tính -->
              <div class="col-md-6">
                <label for="editPhai" class="form-label fw-medium">
                  Giới tính <span class="text-danger">*</span>
                </label>
                <select
                  id="editPhai"
                  v-model="form.Phai"
                  class="form-select"
                  :class="{ 'is-invalid': errors.Phai }"
                  required
                >
                  <option value="Nam">Nam</option>
                  <option value="Nu">Nữ</option>
                  <option value="Khac">Khác</option>
                </select>
                <div v-if="errors.Phai" class="invalid-feedback">
                  {{ errors.Phai }}
                </div>
              </div>

              <!-- Số điện thoại -->
              <div class="col-md-6">
                <label for="editDienThoai" class="form-label fw-medium">
                  Số điện thoại <span class="text-danger">*</span>
                </label>
                <input
                  id="editDienThoai"
                  v-model="form.DienThoai"
                  type="tel"
                  class="form-control"
                  :class="{ 'is-invalid': errors.DienThoai }"
                  placeholder="Ví dụ: 0912345678"
                  required
                />
                <div v-if="errors.DienThoai" class="invalid-feedback">
                  {{ errors.DienThoai }}
                </div>
              </div>

              <!-- Địa chỉ -->
              <div class="col-md-6">
                <label for="editDiaChi" class="form-label fw-medium">Địa chỉ</label>
                <input
                  id="editDiaChi"
                  v-model="form.DiaChi"
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': errors.DiaChi }"
                  placeholder="Ví dụ: 123 Đường 3/2, Ninh Kiều, Cần Thơ"
                  maxlength="200"
                />
                <div v-if="errors.DiaChi" class="invalid-feedback">
                  {{ errors.DiaChi }}
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer bg-light">
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="isSubmitting"
              @click="close"
            >
              Hủy bỏ
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
              <i v-else class="bi bi-check-lg"></i>
              <span>Lưu thay đổi</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
