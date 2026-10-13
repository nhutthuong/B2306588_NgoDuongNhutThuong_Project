<script setup>
import { ref, computed } from 'vue';
import { useRouter, RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { getErrorMessage, getFieldErrors } from '../api/http.js';

const router = useRouter();
const authStore = useAuthStore();

// Trạng thái form
const form = ref({
  HoLot: '',
  Ten: '',
  NgaySinh: '',
  Phai: 'Nam',
  DiaChi: '',
  DienThoai: '',
  Email: '',
  Password: '',
  ConfirmPassword: '',
});

// Trạng thái giao diện
const showPassword = ref(false);
const showConfirmPassword = ref(false);
const isLoading = ref(false);
const errorMessage = ref('');
const fieldErrors = ref({});

// Ngày sinh tối đa cho phép chọn trên lịch (hôm nay trừ 5 năm để thỏa độ tuổi tối thiểu)
const maxBirthDate = computed(() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 5);
  return d.toISOString().split('T')[0];
});

// Ngày hôm nay (chặn chọn ngày tương lai)
const todayStr = computed(() => {
  return new Date().toISOString().split('T')[0];
});

// Kiểm tra quy tắc mật khẩu phía client (phục vụ hiển thị gợi ý trực quan)
const passwordChecks = computed(() => {
  const pwd = form.value.Password || '';
  const emailVal = form.value.Email.trim().toLowerCase();
  const localPart = emailVal.split('@')[0];

  const hasMinLength = pwd.length >= 8;
  const hasUpperCase = /[A-Z]/.test(pwd);
  const hasLowerCase = /[a-z]/.test(pwd);
  const hasNumber = /[0-9]/.test(pwd);
  const notContainsEmail =
    !emailVal ||
    pwd.toLowerCase().indexOf(emailVal) === -1 &&
    (!localPart || pwd.toLowerCase().indexOf(localPart) === -1);
  const matchesConfirm = pwd.length > 0 && pwd === form.value.ConfirmPassword;

  return {
    hasMinLength,
    hasUpperCase,
    hasLowerCase,
    hasNumber,
    notContainsEmail,
    matchesConfirm,
    isValid:
      hasMinLength &&
      hasUpperCase &&
      hasLowerCase &&
      hasNumber &&
      notContainsEmail &&
      matchesConfirm,
  };
});

// Kiểm tra validation UX phía client trước khi gửi lên máy chủ
const validateClientSide = () => {
  const errors = {};

  if (!form.value.HoLot.trim()) {
    errors.HoLot = 'Vui lòng nhập họ lót';
  } else if (form.value.HoLot.trim().length > 50) {
    errors.HoLot = 'Họ lót không được vượt quá 50 ký tự';
  }

  if (!form.value.Ten.trim()) {
    errors.Ten = 'Vui lòng nhập tên';
  } else if (form.value.Ten.trim().length > 30) {
    errors.Ten = 'Tên không được vượt quá 30 ký tự';
  }

  if (!form.value.NgaySinh) {
    errors.NgaySinh = 'Vui lòng chọn ngày sinh';
  } else {
    const birthDate = new Date(form.value.NgaySinh);
    const today = new Date();
    if (birthDate > today) {
      errors.NgaySinh = 'Ngày sinh không thể ở tương lai';
    } else {
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      if (age < 5) {
        errors.NgaySinh = 'Độc giả phải từ 5 tuổi trở lên';
      } else if (age > 120) {
        errors.NgaySinh = 'Ngày sinh không hợp lệ (tối đa 120 tuổi)';
      }
    }
  }

  if (!['Nam', 'Nu', 'Khac'].includes(form.value.Phai)) {
    errors.Phai = 'Vui lòng chọn giới tính';
  }

  if (form.value.DiaChi.trim().length > 200) {
    errors.DiaChi = 'Địa chỉ không được vượt quá 200 ký tự';
  }

  const phoneRegex = /^(0|\+84)\d{9}$/;
  if (!form.value.DienThoai.trim()) {
    errors.DienThoai = 'Vui lòng nhập số điện thoại';
  } else if (!phoneRegex.test(form.value.DienThoai.trim())) {
    errors.DienThoai = 'Số điện thoại không hợp lệ (ví dụ: 0912345678 hoặc +84912345678)';
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!form.value.Email.trim()) {
    errors.Email = 'Vui lòng nhập địa chỉ email';
  } else if (!emailRegex.test(form.value.Email.trim())) {
    errors.Email = 'Địa chỉ email không đúng định dạng';
  }

  if (!form.value.Password) {
    errors.Password = 'Vui lòng nhập mật khẩu';
  } else if (form.value.Password.length < 8) {
    errors.Password = 'Mật khẩu phải có tối thiểu 8 ký tự';
  } else if (!/[A-Z]/.test(form.value.Password)) {
    errors.Password = 'Mật khẩu phải chứa ít nhất một chữ hoa';
  } else if (!/[a-z]/.test(form.value.Password)) {
    errors.Password = 'Mật khẩu phải chứa ít nhất một chữ thường';
  } else if (!/[0-9]/.test(form.value.Password)) {
    errors.Password = 'Mật khẩu phải chứa ít nhất một chữ số';
  }

  if (!form.value.ConfirmPassword) {
    errors.ConfirmPassword = 'Vui lòng nhập lại mật khẩu';
  } else if (form.value.Password !== form.value.ConfirmPassword) {
    errors.ConfirmPassword = 'Mật khẩu nhập lại không khớp';
  }

  return errors;
};

const handleRegister = async () => {
  if (isLoading.value) return;

  errorMessage.value = '';
  fieldErrors.value = {};

  // Kiểm tra client-side trước để phản hồi tức thì
  const clientErrors = validateClientSide();
  if (Object.keys(clientErrors).length > 0) {
    fieldErrors.value = clientErrors;
    errorMessage.value = 'Vui lòng kiểm tra lại các trường thông tin có đánh dấu màu đỏ.';
    return;
  }

  isLoading.value = true;

  // Whitelist payload gửi lên server: TUYỆT ĐỐI không gửi ConfirmPassword hay trường thừa
  const payload = {
    HoLot: form.value.HoLot.trim(),
    Ten: form.value.Ten.trim(),
    NgaySinh: form.value.NgaySinh,
    Phai: form.value.Phai,
    DiaChi: form.value.DiaChi.trim(),
    DienThoai: form.value.DienThoai.trim(),
    Email: form.value.Email.trim().toLowerCase(),
    Password: form.value.Password,
  };

  try {
    await authStore.register(payload);

    // Đăng ký thành công, điều hướng sang trang đăng nhập kèm query thông báo
    router.push({
      path: '/login',
      query: { registered: 'success' },
    });
  } catch (err) {
    // Trích xuất lỗi chi tiết cho từng trường từ server (400 validation, 409 trùng email)
    const serverFieldErrors = getFieldErrors(err);
    if (Object.keys(serverFieldErrors).length > 0) {
      fieldErrors.value = serverFieldErrors;
    }
    errorMessage.value = getErrorMessage(err);
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="row justify-content-center align-items-center py-4">
    <div class="col-12 col-md-10 col-lg-8 col-xl-7">
      <div class="card shadow-sm border-0 rounded-4">
        <div class="card-body p-4 p-sm-5">
          <!-- Logo & Tiêu đề -->
          <div class="text-center mb-4">
            <div class="d-inline-flex p-3 bg-primary bg-opacity-10 text-primary rounded-circle mb-3 shadow-sm">
              <i class="bi bi-person-plus-fill fs-1"></i>
            </div>
            <h1 class="h4 fw-bold text-dark mb-1">Đăng ký Tài khoản Độc giả</h1>
            <p class="text-muted small mb-0">Tạo tài khoản để tra cứu và mượn sách trực tuyến</p>
          </div>

          <!-- Thông báo lỗi tổng quát -->
          <div
            v-if="errorMessage"
            class="alert alert-danger d-flex align-items-start gap-2 py-2 px-3 small rounded-3 mb-4"
            role="alert"
          >
            <i class="bi bi-x-circle-fill fs-5 text-danger flex-shrink-0"></i>
            <div>{{ errorMessage }}</div>
          </div>

          <!-- Form đăng ký -->
          <form @submit.prevent="handleRegister" novalidate>
            <!-- Họ lót & Tên -->
            <div class="row g-3 mb-3">
              <div class="col-md-7">
                <label for="hoLotInput" class="form-label small fw-semibold text-secondary">
                  Họ và tên lót <span class="text-danger">*</span>
                </label>
                <input
                  id="hoLotInput"
                  v-model="form.HoLot"
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': fieldErrors.HoLot }"
                  placeholder="Ví dụ: Nguyễn Văn"
                  maxlength="50"
                  :disabled="isLoading"
                  required
                />
                <div v-if="fieldErrors.HoLot" class="invalid-feedback">
                  {{ fieldErrors.HoLot }}
                </div>
              </div>

              <div class="col-md-5">
                <label for="tenInput" class="form-label small fw-semibold text-secondary">
                  Tên <span class="text-danger">*</span>
                </label>
                <input
                  id="tenInput"
                  v-model="form.Ten"
                  type="text"
                  class="form-control"
                  :class="{ 'is-invalid': fieldErrors.Ten }"
                  placeholder="Ví dụ: An"
                  maxlength="30"
                  :disabled="isLoading"
                  required
                />
                <div v-if="fieldErrors.Ten" class="invalid-feedback">
                  {{ fieldErrors.Ten }}
                </div>
              </div>
            </div>

            <!-- Ngày sinh & Giới tính -->
            <div class="row g-3 mb-3">
              <div class="col-md-6">
                <label for="ngaySinhInput" class="form-label small fw-semibold text-secondary">
                  Ngày sinh <span class="text-danger">*</span>
                </label>
                <input
                  id="ngaySinhInput"
                  v-model="form.NgaySinh"
                  type="date"
                  class="form-control"
                  :class="{ 'is-invalid': fieldErrors.NgaySinh }"
                  :max="todayStr"
                  :disabled="isLoading"
                  required
                />
                <div v-if="fieldErrors.NgaySinh" class="invalid-feedback">
                  {{ fieldErrors.NgaySinh }}
                </div>
                <div class="form-text small">Độc giả phải từ 5 tuổi trở lên.</div>
              </div>

              <div class="col-md-6">
                <label class="form-label small fw-semibold text-secondary d-block">
                  Giới tính <span class="text-danger">*</span>
                </label>
                <div class="d-flex align-items-center gap-3 pt-2">
                  <div class="form-check">
                    <input
                      id="genderNam"
                      v-model="form.Phai"
                      class="form-check-input"
                      type="radio"
                      value="Nam"
                      name="genderRadio"
                      :disabled="isLoading"
                    />
                    <label class="form-check-label small" for="genderNam">Nam</label>
                  </div>
                  <div class="form-check">
                    <input
                      id="genderNu"
                      v-model="form.Phai"
                      class="form-check-input"
                      type="radio"
                      value="Nu"
                      name="genderRadio"
                      :disabled="isLoading"
                    />
                    <label class="form-check-label small" for="genderNu">Nữ</label>
                  </div>
                  <div class="form-check">
                    <input
                      id="genderKhac"
                      v-model="form.Phai"
                      class="form-check-input"
                      type="radio"
                      value="Khac"
                      name="genderRadio"
                      :disabled="isLoading"
                    />
                    <label class="form-check-label small" for="genderKhac">Khác</label>
                  </div>
                </div>
                <div v-if="fieldErrors.Phai" class="text-danger small mt-1">
                  {{ fieldErrors.Phai }}
                </div>
              </div>
            </div>

            <!-- Điện thoại & Email -->
            <div class="row g-3 mb-3">
              <div class="col-md-6">
                <label for="dienThoaiInput" class="form-label small fw-semibold text-secondary">
                  Số điện thoại <span class="text-danger">*</span>
                </label>
                <div class="input-group">
                  <span class="input-group-text bg-light text-muted border-end-0">
                    <i class="bi bi-telephone"></i>
                  </span>
                  <input
                    id="dienThoaiInput"
                    v-model="form.DienThoai"
                    type="tel"
                    class="form-control border-start-0"
                    :class="{ 'is-invalid': fieldErrors.DienThoai }"
                    placeholder="Ví dụ: 0912345678"
                    :disabled="isLoading"
                    required
                  />
                  <div v-if="fieldErrors.DienThoai" class="invalid-feedback">
                    {{ fieldErrors.DienThoai }}
                  </div>
                </div>
              </div>

              <div class="col-md-6">
                <label for="emailInput" class="form-label small fw-semibold text-secondary">
                  Địa chỉ Email <span class="text-danger">*</span>
                </label>
                <div class="input-group">
                  <span class="input-group-text bg-light text-muted border-end-0">
                    <i class="bi bi-envelope"></i>
                  </span>
                  <input
                    id="emailInput"
                    v-model="form.Email"
                    type="email"
                    class="form-control border-start-0"
                    :class="{ 'is-invalid': fieldErrors.Email }"
                    placeholder="name@example.com"
                    autocomplete="email"
                    :disabled="isLoading"
                    required
                  />
                  <div v-if="fieldErrors.Email" class="invalid-feedback">
                    {{ fieldErrors.Email }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Địa chỉ -->
            <div class="mb-3">
              <label for="diaChiInput" class="form-label small fw-semibold text-secondary">
                Địa chỉ cư trú
              </label>
              <div class="input-group">
                <span class="input-group-text bg-light text-muted border-end-0">
                  <i class="bi bi-geo-alt"></i>
                </span>
                <input
                  id="diaChiInput"
                  v-model="form.DiaChi"
                  type="text"
                  class="form-control border-start-0"
                  :class="{ 'is-invalid': fieldErrors.DiaChi }"
                  placeholder="Ví dụ: Số 123 Đường 3/2, Quận Ninh Kiều, Cần Thơ"
                  maxlength="200"
                  :disabled="isLoading"
                />
                <div v-if="fieldErrors.DiaChi" class="invalid-feedback">
                  {{ fieldErrors.DiaChi }}
                </div>
              </div>
            </div>

            <!-- Mật khẩu & Xác nhận mật khẩu -->
            <div class="row g-3 mb-3">
              <div class="col-md-6">
                <label for="passwordInput" class="form-label small fw-semibold text-secondary">
                  Mật khẩu <span class="text-danger">*</span>
                </label>
                <div class="input-group">
                  <span class="input-group-text bg-light text-muted border-end-0">
                    <i class="bi bi-key"></i>
                  </span>
                  <input
                    id="passwordInput"
                    v-model="form.Password"
                    :type="showPassword ? 'text' : 'password'"
                    class="form-control border-start-0 border-end-0"
                    :class="{ 'is-invalid': fieldErrors.Password }"
                    placeholder="Tối thiểu 8 ký tự"
                    autocomplete="new-password"
                    :disabled="isLoading"
                    required
                  />
                  <button
                    class="btn btn-outline-secondary border-start-0 text-muted"
                    type="button"
                    :disabled="isLoading"
                    @click="showPassword = !showPassword"
                    aria-label="Ẩn hoặc hiện mật khẩu"
                  >
                    <i class="bi" :class="showPassword ? 'bi-eye-slash' : 'bi-eye'"></i>
                  </button>
                  <div v-if="fieldErrors.Password" class="invalid-feedback">
                    {{ fieldErrors.Password }}
                  </div>
                </div>
              </div>

              <div class="col-md-6">
                <label for="confirmPasswordInput" class="form-label small fw-semibold text-secondary">
                  Nhập lại mật khẩu <span class="text-danger">*</span>
                </label>
                <div class="input-group">
                  <span class="input-group-text bg-light text-muted border-end-0">
                    <i class="bi bi-check2-circle"></i>
                  </span>
                  <input
                    id="confirmPasswordInput"
                    v-model="form.ConfirmPassword"
                    :type="showConfirmPassword ? 'text' : 'password'"
                    class="form-control border-start-0 border-end-0"
                    :class="{ 'is-invalid': fieldErrors.ConfirmPassword }"
                    placeholder="Khớp với mật khẩu trên"
                    autocomplete="new-password"
                    :disabled="isLoading"
                    required
                  />
                  <button
                    class="btn btn-outline-secondary border-start-0 text-muted"
                    type="button"
                    :disabled="isLoading"
                    @click="showConfirmPassword = !showConfirmPassword"
                    aria-label="Ẩn hoặc hiện xác nhận mật khẩu"
                  >
                    <i class="bi" :class="showConfirmPassword ? 'bi-eye-slash' : 'bi-eye'"></i>
                  </button>
                  <div v-if="fieldErrors.ConfirmPassword" class="invalid-feedback">
                    {{ fieldErrors.ConfirmPassword }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Gợi ý quy tắc mật khẩu trực quan -->
            <div class="p-3 bg-light rounded-3 mb-4 border">
              <div class="small fw-semibold text-secondary mb-2">Quy tắc bảo mật mật khẩu:</div>
              <div class="row g-2 small">
                <div class="col-sm-6 d-flex align-items-center gap-2">
                  <i
                    class="bi"
                    :class="passwordChecks.hasMinLength ? 'bi-check-circle-fill text-success' : 'bi-circle text-muted'"
                  ></i>
                  <span :class="{ 'text-success fw-medium': passwordChecks.hasMinLength }">Tối thiểu 8 ký tự</span>
                </div>
                <div class="col-sm-6 d-flex align-items-center gap-2">
                  <i
                    class="bi"
                    :class="passwordChecks.hasUpperCase ? 'bi-check-circle-fill text-success' : 'bi-circle text-muted'"
                  ></i>
                  <span :class="{ 'text-success fw-medium': passwordChecks.hasUpperCase }">Ít nhất 1 chữ hoa (A-Z)</span>
                </div>
                <div class="col-sm-6 d-flex align-items-center gap-2">
                  <i
                    class="bi"
                    :class="passwordChecks.hasLowerCase ? 'bi-check-circle-fill text-success' : 'bi-circle text-muted'"
                  ></i>
                  <span :class="{ 'text-success fw-medium': passwordChecks.hasLowerCase }">Ít nhất 1 chữ thường (a-z)</span>
                </div>
                <div class="col-sm-6 d-flex align-items-center gap-2">
                  <i
                    class="bi"
                    :class="passwordChecks.hasNumber ? 'bi-check-circle-fill text-success' : 'bi-circle text-muted'"
                  ></i>
                  <span :class="{ 'text-success fw-medium': passwordChecks.hasNumber }">Ít nhất 1 chữ số (0-9)</span>
                </div>
                <div class="col-sm-12 d-flex align-items-center gap-2">
                  <i
                    class="bi"
                    :class="passwordChecks.matchesConfirm ? 'bi-check-circle-fill text-success' : 'bi-circle text-muted'"
                  ></i>
                  <span :class="{ 'text-success fw-medium': passwordChecks.matchesConfirm }">Mật khẩu nhập lại trùng khớp</span>
                </div>
              </div>
            </div>

            <!-- Nút gửi đăng ký -->
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
              <i v-else class="bi bi-person-plus-fill"></i>
              <span>{{ isLoading ? 'Đang tạo tài khoản...' : 'Đăng ký tài khoản' }}</span>
            </button>
          </form>

          <div class="text-center mt-4">
            <span class="text-muted small">Đã có tài khoản độc giả? </span>
            <RouterLink to="/login" class="small fw-semibold text-decoration-none">
              Đăng nhập ngay
            </RouterLink>
          </div>
        </div>

        <div class="card-footer bg-light border-0 py-3 text-center rounded-bottom-4">
          <RouterLink to="/" class="text-muted small text-decoration-none">
            <i class="bi bi-arrow-left me-1"></i> Quay lại trang chủ
          </RouterLink>
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
