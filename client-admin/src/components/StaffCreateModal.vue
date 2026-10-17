<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue';
import { Modal } from 'bootstrap';
import staffApi from '../api/staff.api.js';
import { getErrorMessage, getFieldErrors } from '../api/http.js';

const emit = defineEmits(['created']);

const modalRef = ref(null);
let modalInstance = null;

const isSubmitting = ref(false);
const showPassword = ref(false);

const form = reactive({
  HoTenNV: '',
  ChucVu: '',
  VaiTro: 'thuthu',
  SoDienThoai: '',
  DiaChi: '',
  Password: '',
});

const errors = reactive({
  HoTenNV: '',
  ChucVu: '',
  VaiTro: '',
  SoDienThoai: '',
  DiaChi: '',
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

const resetForm = () => {
  form.HoTenNV = '';
  form.ChucVu = '';
  form.VaiTro = 'thuthu';
  form.SoDienThoai = '';
  form.DiaChi = '';
  form.Password = '';
  showPassword.value = false;

  errors.HoTenNV = '';
  errors.ChucVu = '';
  errors.VaiTro = '';
  errors.SoDienThoai = '';
  errors.DiaChi = '';
  errors.Password = '';
  errors.general = '';

  isSubmitting.value = false;
};

const open = () => {
  resetForm();
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
  errors.HoTenNV = '';
  errors.ChucVu = '';
  errors.VaiTro = '';
  errors.SoDienThoai = '';
  errors.DiaChi = '';
  errors.Password = '';
  errors.general = '';

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

  if (!['thuthu', 'admin'].includes(form.VaiTro)) {
    errors.VaiTro = 'Vai trò chỉ có thể là Thủ thư hoặc Quản trị viên';
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

  const pwd = form.Password;
  if (!pwd) {
    errors.Password = 'Mật khẩu tạm thời không được để trống';
    isValid = false;
  } else {
    if (pwd.length < 8) {
      errors.Password = 'Mật khẩu phải có độ dài ít nhất 8 ký tự';
      isValid = false;
    } else if (!/[A-Z]/.test(pwd)) {
      errors.Password = 'Mật khẩu phải chứa ít nhất 1 chữ hoa';
      isValid = false;
    } else if (!/[a-z]/.test(pwd)) {
      errors.Password = 'Mật khẩu phải chứa ít nhất 1 chữ thường';
      isValid = false;
    } else if (!/[0-9]/.test(pwd)) {
      errors.Password = 'Mật khẩu phải chứa ít nhất 1 chữ số';
      isValid = false;
    } else if (!/[^A-Za-z0-9]/.test(pwd)) {
      errors.Password = 'Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt (@, #, $, %, ...)';
      isValid = false;
    }
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
      VaiTro: form.VaiTro,
      Password: form.Password,
    };

    if (form.ChucVu.trim()) {
      payload.ChucVu = form.ChucVu.trim();
    }
    if (form.SoDienThoai.trim()) {
      payload.SoDienThoai = form.SoDienThoai.trim();
    }
    if (form.DiaChi.trim()) {
      payload.DiaChi = form.DiaChi.trim();
    }

    const res = await staffApi.create(payload);
    const createdStaff = res.data?.data;

    close();
    emit('created', createdStaff);
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
    aria-labelledby="staffCreateModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content border-0 shadow">
        <div class="modal-header bg-light border-bottom">
          <div class="d-flex align-items-center gap-2">
            <div class="p-2 bg-primary-subtle text-primary rounded">
              <i class="bi bi-person-plus-fill fs-5"></i>
            </div>
            <h5 id="staffCreateModalLabel" class="modal-title fw-bold mb-0">
              Thêm nhân viên mới
            </h5>
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

            <!-- Hướng dẫn tài khoản mới -->
            <div class="alert alert-info d-flex align-items-start gap-2 mb-3 py-2">
              <i class="bi bi-info-circle-fill text-info mt-1 flex-shrink-0"></i>
              <div class="small">
                Mã nhân viên (MSNV) sẽ được hệ thống tự động sinh theo mẫu <code>NV001, NV002...</code>.
                Tài khoản tạo mới có trạng thái <strong>Hoạt động</strong> và cờ <strong>Bắt buộc đổi mật khẩu</strong> khi nhân viên đăng nhập lần đầu tiên.
              </div>
            </div>

            <div class="row g-3">
              <!-- Họ và tên -->
              <div class="col-md-7">
                <label for="createHoTenNV" class="form-label fw-semibold small">
                  Họ và tên nhân viên <span class="text-danger">*</span>
                </label>
                <input
                  id="createHoTenNV"
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
              <div class="col-md-5">
                <label for="createChucVu" class="form-label fw-semibold small">
                  Chức vụ công tác
                </label>
                <input
                  id="createChucVu"
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

              <!-- Vai trò hệ thống -->
              <div class="col-12">
                <label class="form-label fw-semibold small d-block mb-2">
                  Vai trò phân quyền <span class="text-danger">*</span>
                </label>
                <div class="row g-3">
                  <div class="col-md-6">
                    <label
                      class="card h-100 p-3 border cursor-pointer"
                      :class="form.VaiTro === 'thuthu' ? 'border-primary bg-primary-subtle bg-opacity-25' : 'border-light-subtle'"
                    >
                      <div class="form-check">
                        <input
                          id="roleThuThu"
                          v-model="form.VaiTro"
                          class="form-check-input"
                          type="radio"
                          name="staffRole"
                          value="thuthu"
                          :disabled="isSubmitting"
                        />
                        <label class="form-check-label fw-bold text-dark cursor-pointer" for="roleThuThu">
                          <i class="bi bi-book-half text-secondary me-1"></i>
                          Thủ thư (thuthu)
                        </label>
                      </div>
                      <p class="small text-muted mb-0 mt-2 ps-4">
                        Quản lý sách, nhà xuất bản, xử lý mượn/trả và thu phạt độc giả. Không được quản lý nhân viên hay cấu hình.
                      </p>
                    </label>
                  </div>
                  <div class="col-md-6">
                    <label
                      class="card h-100 p-3 border cursor-pointer"
                      :class="form.VaiTro === 'admin' ? 'border-primary bg-primary-subtle bg-opacity-25' : 'border-light-subtle'"
                    >
                      <div class="form-check">
                        <input
                          id="roleAdmin"
                          v-model="form.VaiTro"
                          class="form-check-input"
                          type="radio"
                          name="staffRole"
                          value="admin"
                          :disabled="isSubmitting"
                        />
                        <label class="form-check-label fw-bold text-dark cursor-pointer" for="roleAdmin">
                          <i class="bi bi-shield-lock-fill text-primary me-1"></i>
                          Quản trị viên (admin)
                        </label>
                      </div>
                      <p class="small text-muted mb-0 mt-2 ps-4">
                        Toàn quyền hệ thống: quản lý tài khoản nhân viên, đổi vai trò, thiết lập hệ thống và kiểm tra nhật ký kiểm toán.
                      </p>
                    </label>
                  </div>
                </div>
                <div v-if="errors.VaiTro" class="text-danger small mt-1">
                  {{ errors.VaiTro }}
                </div>
              </div>

              <!-- Số điện thoại -->
              <div class="col-md-6">
                <label for="createSoDienThoai" class="form-label fw-semibold small">
                  Số điện thoại
                </label>
                <div class="input-group">
                  <span class="input-group-text bg-light text-muted">
                    <i class="bi bi-telephone"></i>
                  </span>
                  <input
                    id="createSoDienThoai"
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

              <!-- Mật khẩu tạm thời -->
              <div class="col-md-6">
                <label for="createPassword" class="form-label fw-semibold small">
                  Mật khẩu tạm thời <span class="text-danger">*</span>
                </label>
                <div class="input-group">
                  <span class="input-group-text bg-light text-muted">
                    <i class="bi bi-key"></i>
                  </span>
                  <input
                    id="createPassword"
                    v-model="form.Password"
                    :type="showPassword ? 'text' : 'password'"
                    class="form-control"
                    :class="{ 'is-invalid': errors.Password }"
                    placeholder="Tối thiểu 8 ký tự (hoa, thường, số, ký tự đặc biệt)"
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
                  Bao gồm: ≥ 8 ký tự, 1 hoa, 1 thường, 1 số, 1 ký tự đặc biệt.
                </div>
              </div>

              <!-- Địa chỉ -->
              <div class="col-12">
                <label for="createDiaChi" class="form-label fw-semibold small">
                  Địa chỉ liên hệ
                </label>
                <input
                  id="createDiaChi"
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
              <i v-else class="bi bi-check-lg"></i>
              <span>{{ isSubmitting ? 'Đang tạo...' : 'Tạo nhân viên' }}</span>
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
</style>
