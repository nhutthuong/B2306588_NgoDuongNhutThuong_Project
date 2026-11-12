<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import { userApi } from '../api/user.api.js';
import { borrowingApi } from '../api/borrowing.api.js';
import { getErrorMessage, getFieldErrors } from '../api/http.js';
import { formatDate, formatCurrency, getAvatarUrl } from '../utils/format.js';
import AppAlert from '../components/AppAlert.vue';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import ConfirmModal from '../components/ConfirmModal.vue';

const authStore = useAuthStore();

// Trạng thái tab đang mở: 'profile' (thông tin cá nhân) | 'security' (đổi mật khẩu)
const activeTab = ref('profile');

// Trạng thái tải dữ liệu ban đầu
const isLoadingInitial = ref(true);
const initialError = ref('');

// Dữ liệu tóm tắt mượn sách
const borrowingSummary = ref(null);
const isLoadingSummary = ref(false);

// Thông tin chi tiết độc giả đầy đủ từ DB
const profileData = ref(null);

// Form thông tin cá nhân
const profileForm = reactive({
  HoLot: '',
  Ten: '',
  NgaySinh: '',
  Phai: 'Nam',
  DienThoai: '',
  DiaChi: '',
});

// Bản sao gốc của form để so sánh dirty checking và hoàn tác
const originalForm = reactive({
  HoLot: '',
  Ten: '',
  NgaySinh: '',
  Phai: 'Nam',
  DienThoai: '',
  DiaChi: '',
});

// Trạng thái xử lý form hồ sơ
const isSavingProfile = ref(false);
const profileAlert = reactive({
  type: 'info',
  message: '',
});
const profileFieldErrors = ref({});

// Form đổi mật khẩu
const passwordForm = reactive({
  MatKhauCu: '',
  MatKhauMoi: '',
  ConfirmPassword: '',
});

// Ẩn/hiện mật khẩu
const showMatKhauCu = ref(false);
const showMatKhauMoi = ref(false);
const showConfirmPassword = ref(false);

// Trạng thái xử lý form đổi mật khẩu
const isChangingPassword = ref(false);
const passwordAlert = reactive({
  type: 'info',
  message: '',
});
const passwordFieldErrors = ref({});

// Giới hạn ngày sinh trên lịch (từ 5 đến 120 tuổi)
const maxBirthDate = computed(() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 5);
  return d.toISOString().split('T')[0];
});

const minBirthDate = computed(() => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 120);
  return d.toISOString().split('T')[0];
});

// Kiểm tra form hồ sơ có bị thay đổi so với dữ liệu gốc không
const isProfileDirty = computed(() => {
  return (
    profileForm.HoLot.trim() !== originalForm.HoLot.trim() ||
    profileForm.Ten.trim() !== originalForm.Ten.trim() ||
    profileForm.NgaySinh !== originalForm.NgaySinh ||
    profileForm.Phai !== originalForm.Phai ||
    profileForm.DienThoai.trim() !== originalForm.DienThoai.trim() ||
    profileForm.DiaChi.trim() !== originalForm.DiaChi.trim()
  );
});

// Đếm ký tự địa chỉ
const diaChiLength = computed(() => profileForm.DiaChi.length);

// Kiểm tra các tiêu chí mật khẩu mới phục vụ hiển thị checklist trực quan
const passwordChecks = computed(() => {
  const pwd = passwordForm.MatKhauMoi || '';
  const currentEmail = (profileData.value?.Email || authStore.user?.Email || '').toLowerCase();
  const currentMaDocGia = (profileData.value?.MaDocGia || authStore.user?.MaDocGia || '').toLowerCase();
  const emailLocal = currentEmail.split('@')[0];

  const hasMinLength = pwd.length >= 8;
  const hasUpperCase = /[A-Z]/.test(pwd);
  const hasLowerCase = /[a-z]/.test(pwd);
  const hasNumber = /[0-9]/.test(pwd);

  const notContainEmail =
    !currentEmail ||
    (pwd.toLowerCase().indexOf(currentEmail) === -1 &&
      (!emailLocal || pwd.toLowerCase().indexOf(emailLocal) === -1));

  const notContainMaDocGia =
    !currentMaDocGia || pwd.toLowerCase().indexOf(currentMaDocGia) === -1;

  const differentFromOld = !passwordForm.MatKhauCu || pwd !== passwordForm.MatKhauCu;
  const matchesConfirm = pwd.length > 0 && pwd === passwordForm.ConfirmPassword;

  const isValidStrength =
    hasMinLength &&
    hasUpperCase &&
    hasLowerCase &&
    hasNumber &&
    notContainEmail &&
    notContainMaDocGia &&
    differentFromOld;

  return {
    hasMinLength,
    hasUpperCase,
    hasLowerCase,
    hasNumber,
    notContainEmail,
    notContainMaDocGia,
    differentFromOld,
    matchesConfirm,
    isValidStrength,
  };
});

/**
 * Nạp thông tin hồ sơ và tóm tắt mượn sách
 */
const loadInitialData = async () => {
  isLoadingInitial.value = true;
  initialError.value = '';

  try {
    const [profileRes, summaryRes] = await Promise.allSettled([
      userApi.getProfile(),
      borrowingApi.getSummary(),
    ]);

    if (profileRes.status === 'fulfilled') {
      const user = profileRes.value.data?.data?.user;
      if (user) {
        profileData.value = user;
        authStore.setUser(user);

        // Đồng bộ form
        profileForm.HoLot = user.HoLot || '';
        profileForm.Ten = user.Ten || '';
        profileForm.NgaySinh = user.NgaySinh ? user.NgaySinh.split('T')[0] : '';
        profileForm.Phai = user.Phai || 'Nam';
        profileForm.DienThoai = user.DienThoai || '';
        profileForm.DiaChi = user.DiaChi || '';

        // Lưu bản sao gốc
        Object.assign(originalForm, profileForm);
      }
    } else {
      initialError.value = getErrorMessage(profileRes.reason);
    }

    if (summaryRes.status === 'fulfilled') {
      borrowingSummary.value = summaryRes.value.data?.data || null;
    }
  } catch (err) {
    initialError.value = getErrorMessage(err);
  } finally {
    isLoadingInitial.value = false;
  }
};

/**
 * Đặt lại form hồ sơ về trạng thái ban đầu
 */
const resetProfileForm = () => {
  Object.assign(profileForm, originalForm);
  profileFieldErrors.value = {};
  profileAlert.message = '';
};

/**
 * Validate form hồ sơ phía client
 */
const validateProfileClient = () => {
  const errors = {};

  if (!profileForm.HoLot.trim()) {
    errors.HoLot = 'Họ lót không được để trống';
  } else if (profileForm.HoLot.trim().length > 50) {
    errors.HoLot = 'Họ lót không được vượt quá 50 ký tự';
  }

  if (!profileForm.Ten.trim()) {
    errors.Ten = 'Tên không được để trống';
  } else if (profileForm.Ten.trim().length > 30) {
    errors.Ten = 'Tên không được vượt quá 30 ký tự';
  }

  if (!profileForm.NgaySinh) {
    errors.NgaySinh = 'Vui lòng chọn ngày sinh';
  } else {
    const birthDate = new Date(profileForm.NgaySinh);
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
        errors.NgaySinh = 'Độc giả phải có độ tuổi từ 5 tuổi trở lên';
      } else if (age > 120) {
        errors.NgaySinh = 'Ngày sinh không hợp lệ (tối đa 120 tuổi)';
      }
    }
  }

  if (!['Nam', 'Nu'].includes(profileForm.Phai)) {
    errors.Phai = 'Vui lòng chọn giới tính hợp lệ (Nam hoặc Nữ)';
  }

  const phoneRegex = /^(0|\+84)\d{9}$/;
  if (!profileForm.DienThoai.trim()) {
    errors.DienThoai = 'Số điện thoại không được để trống';
  } else if (!phoneRegex.test(profileForm.DienThoai.trim())) {
    errors.DienThoai = 'Số điện thoại không hợp lệ (ví dụ: 0912345678 hoặc +84912345678)';
  }

  if (profileForm.DiaChi.trim().length > 200) {
    errors.DiaChi = 'Địa chỉ không được vượt quá 200 ký tự';
  }

  return errors;
};

/**
 * Lưu thay đổi hồ sơ cá nhân
 */
const handleSaveProfile = async () => {
  if (isSavingProfile.value) return;

  profileAlert.message = '';
  profileFieldErrors.value = {};

  const clientErrors = validateProfileClient();
  if (Object.keys(clientErrors).length > 0) {
    profileFieldErrors.value = clientErrors;
    profileAlert.type = 'danger';
    profileAlert.message = 'Vui lòng kiểm tra lại các trường thông tin có đánh dấu màu đỏ.';
    return;
  }

  isSavingProfile.value = true;

  try {
    const payload = {
      HoLot: profileForm.HoLot.trim(),
      Ten: profileForm.Ten.trim(),
      NgaySinh: profileForm.NgaySinh,
      Phai: profileForm.Phai,
      DienThoai: profileForm.DienThoai.trim(),
      DiaChi: profileForm.DiaChi.trim(),
    };

    const response = await userApi.updateProfile(payload);
    const updatedUser = response.data?.data?.user;

    if (updatedUser) {
      profileData.value = updatedUser;
      authStore.setUser(updatedUser);

      // Cập nhật lại bản sao gốc
      profileForm.HoLot = updatedUser.HoLot || '';
      profileForm.Ten = updatedUser.Ten || '';
      profileForm.NgaySinh = updatedUser.NgaySinh ? updatedUser.NgaySinh.split('T')[0] : '';
      profileForm.Phai = updatedUser.Phai || 'Nam';
      profileForm.DienThoai = updatedUser.DienThoai || '';
      profileForm.DiaChi = updatedUser.DiaChi || '';
      Object.assign(originalForm, profileForm);

      profileAlert.type = 'success';
      profileAlert.message = response.data?.message || 'Cập nhật thông tin hồ sơ thành công.';
    }
  } catch (err) {
    profileAlert.type = 'danger';
    profileAlert.message = getErrorMessage(err);
    profileFieldErrors.value = getFieldErrors(err);
  } finally {
    isSavingProfile.value = false;
  }
};

/**
 * Đổi mật khẩu độc giả
 */
const handleChangePassword = async () => {
  if (isChangingPassword.value) return;

  passwordAlert.message = '';
  passwordFieldErrors.value = {};

  const errors = {};
  if (!passwordForm.MatKhauCu) {
    errors.MatKhauCu = 'Vui lòng nhập mật khẩu hiện tại';
  }

  if (!passwordForm.MatKhauMoi) {
    errors.MatKhauMoi = 'Vui lòng nhập mật khẩu mới';
  } else if (!passwordChecks.value.hasMinLength) {
    errors.MatKhauMoi = 'Mật khẩu mới phải có tối thiểu 8 ký tự';
  } else if (!passwordChecks.value.hasUpperCase) {
    errors.MatKhauMoi = 'Mật khẩu mới phải chứa ít nhất một chữ hoa';
  } else if (!passwordChecks.value.hasLowerCase) {
    errors.MatKhauMoi = 'Mật khẩu mới phải chứa ít nhất một chữ thường';
  } else if (!passwordChecks.value.hasNumber) {
    errors.MatKhauMoi = 'Mật khẩu mới phải chứa ít nhất một chữ số';
  } else if (!passwordChecks.value.differentFromOld) {
    errors.MatKhauMoi = 'Mật khẩu mới phải khác mật khẩu hiện tại';
  } else if (!passwordChecks.value.notContainEmail) {
    errors.MatKhauMoi = 'Mật khẩu mới không được chứa địa chỉ email';
  } else if (!passwordChecks.value.notContainMaDocGia) {
    errors.MatKhauMoi = 'Mật khẩu mới không được chứa mã độc giả';
  }

  if (!passwordForm.ConfirmPassword) {
    errors.ConfirmPassword = 'Vui lòng nhập lại mật khẩu mới';
  } else if (passwordForm.MatKhauMoi !== passwordForm.ConfirmPassword) {
    errors.ConfirmPassword = 'Xác nhận mật khẩu mới không khớp';
  }

  if (Object.keys(errors).length > 0) {
    passwordFieldErrors.value = errors;
    passwordAlert.type = 'danger';
    passwordAlert.message = 'Vui lòng hoàn tất đúng các điều kiện mật khẩu.';
    return;
  }

  isChangingPassword.value = true;

  try {
    const payload = {
      MatKhauCu: passwordForm.MatKhauCu,
      MatKhauMoi: passwordForm.MatKhauMoi,
    };

    const response = await userApi.changePassword(payload);
    const data = response.data?.data;

    // Cập nhật session mới với accessToken mới trong store
    if (data?.accessToken && data?.user) {
      authStore.setSession(data.accessToken, data.user);
    }

    // Làm sạch form
    passwordForm.MatKhauCu = '';
    passwordForm.MatKhauMoi = '';
    passwordForm.ConfirmPassword = '';

    passwordAlert.type = 'success';
    passwordAlert.message =
      response.data?.message ||
      'Đổi mật khẩu thành công. Phiên đăng nhập mới của bạn đã được cập nhật an toàn.';
  } catch (err) {
    passwordAlert.type = 'danger';
    const msg = getErrorMessage(err);
    passwordAlert.message = msg;

    // Bắt lỗi mật khẩu cũ không đúng
    if (err?.response?.status === 401) {
      passwordFieldErrors.value = {
        MatKhauCu: msg || 'Mật khẩu hiện tại không chính xác',
      };
    } else {
      passwordFieldErrors.value = getFieldErrors(err);
    }
  } finally {
    isChangingPassword.value = false;
  }
};

// Quản lý ảnh đại diện (Avatar)
const fileInputRef = ref(null);
const isUploadingAvatar = ref(false);
const isDeletingAvatar = ref(false);
const avatarAlert = reactive({
  type: 'info',
  message: '',
});

const currentAvatarUrl = computed(() => {
  const raw = profileData.value?.avatar_url || authStore.user?.avatar_url;
  return getAvatarUrl(raw);
});

const triggerFileInput = () => {
  if (isUploadingAvatar.value || isDeletingAvatar.value) return;
  fileInputRef.value?.click();
};

const handleFileChange = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  // Reset giá trị input để có thể chọn lại file cùng tên nếu cần
  event.target.value = '';

  // Kiểm tra định dạng file
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedMimes.includes(file.type)) {
    avatarAlert.type = 'danger';
    avatarAlert.message = 'Chỉ chấp nhận ảnh định dạng JPG, PNG hoặc WebP';
    return;
  }

  // Kiểm tra dung lượng (tối đa 2MB)
  if (file.size > 2 * 1024 * 1024) {
    avatarAlert.type = 'danger';
    avatarAlert.message = 'Dung lượng ảnh đại diện không được vượt quá 2MB';
    return;
  }

  avatarAlert.message = '';
  isUploadingAvatar.value = true;

  try {
    const res = await userApi.uploadAvatar(file);
    const newAvatarUrl = res.data?.data?.avatar_url || '';
    if (profileData.value) {
      profileData.value.avatar_url = newAvatarUrl;
    }
    authStore.setUser({ avatar_url: newAvatarUrl });

    avatarAlert.type = 'success';
    avatarAlert.message = 'Cập nhật ảnh đại diện thành công';
  } catch (err) {
    avatarAlert.type = 'danger';
    avatarAlert.message = getErrorMessage(err) || 'Không thể tải lên ảnh đại diện';
  } finally {
    isUploadingAvatar.value = false;
  }
};

const deleteAvatarModalRef = ref(null);

const openDeleteAvatarModal = () => {
  if (isUploadingAvatar.value || isDeletingAvatar.value) return;
  deleteAvatarModalRef.value?.show();
};

const confirmDeleteAvatar = async () => {
  if (isUploadingAvatar.value || isDeletingAvatar.value) return;

  avatarAlert.message = '';
  isDeletingAvatar.value = true;

  try {
    await userApi.deleteAvatar();
    if (profileData.value) {
      profileData.value.avatar_url = '';
    }
    authStore.setUser({ avatar_url: '' });

    deleteAvatarModalRef.value?.hide();

    avatarAlert.type = 'success';
    avatarAlert.message = 'Đã xóa ảnh đại diện thành công';
  } catch (err) {
    avatarAlert.type = 'danger';
    avatarAlert.message = getErrorMessage(err) || 'Không thể xóa ảnh đại diện';
    deleteAvatarModalRef.value?.hide();
  } finally {
    isDeletingAvatar.value = false;
  }
};

onMounted(() => {
  loadInitialData();
});
</script>

<template>
  <div class="profile-container pb-5">
    <!-- Breadcrumb điều hướng -->
    <nav aria-label="breadcrumb" class="mb-4">
      <ol class="breadcrumb">
        <li class="breadcrumb-item">
          <RouterLink to="/" class="text-decoration-none">Trang chủ</RouterLink>
        </li>
        <li class="breadcrumb-item active" aria-current="page">Hồ sơ cá nhân</li>
      </ol>
    </nav>

    <!-- Màn hình tải dữ liệu ban đầu -->
    <div v-if="isLoadingInitial" class="card shadow-sm border-0 rounded-4 p-5 text-center">
      <LoadingSpinner text="Đang tải thông tin hồ sơ độc giả..." />
    </div>

    <!-- Thông báo lỗi khi không thể nạp hồ sơ -->
    <div v-else-if="initialError" class="card shadow-sm border-0 rounded-4 p-4 text-center">
      <i class="bi bi-exclamation-triangle-fill text-danger fs-1 mb-2"></i>
      <h5 class="fw-bold text-danger">Không thể tải thông tin hồ sơ</h5>
      <p class="text-muted mb-3">{{ initialError }}</p>
      <div>
        <button class="btn btn-primary rounded-pill px-4" @click="loadInitialData">
          <i class="bi bi-arrow-clockwise me-1"></i> Thử lại
        </button>
      </div>
    </div>

    <!-- Nội dung chính khi tải thành công -->
    <div v-else class="row g-4">
      <!-- CỘT TRÁI: Thẻ tổng quan độc giả & tóm tắt mượn sách -->
      <div class="col-lg-4">
        <!-- Thẻ hồ sơ cá nhân tổng quan -->
        <div class="card shadow-sm border-0 rounded-4 mb-4 overflow-hidden">
          <div class="bg-primary bg-gradient p-4 text-white text-center position-relative">
            <!-- Input file ẩn để tải ảnh đại diện -->
            <input
              ref="fileInputRef"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              class="d-none"
              @change="handleFileChange"
            />

            <!-- Vùng ảnh đại diện kèm nút camera -->
            <div class="position-relative d-inline-block mb-2">
              <div
                class="avatar-circle d-flex align-items-center justify-content-center shadow overflow-hidden cursor-pointer position-relative"
                :title="currentAvatarUrl ? 'Nhấp để đổi ảnh đại diện' : 'Nhấp để tải lên ảnh đại diện'"
                @click="triggerFileInput"
              >
                <div
                  v-if="isUploadingAvatar || isDeletingAvatar"
                  class="spinner-border spinner-border-sm text-primary"
                  role="status"
                >
                  <span class="visually-hidden">Đang xử lý...</span>
                </div>
                <img
                  v-else-if="currentAvatarUrl"
                  :src="currentAvatarUrl"
                  alt="Avatar"
                  class="w-100 h-100 object-fit-cover"
                />
                <i v-else class="bi bi-person-fill text-primary display-5"></i>
              </div>

              <!-- Nút icon camera nhỏ góc avatar -->
              <button
                type="button"
                class="avatar-badge-btn btn btn-light shadow-sm rounded-circle p-0 position-absolute d-flex align-items-center justify-content-center"
                :title="currentAvatarUrl ? 'Đổi ảnh đại diện' : 'Tải lên ảnh đại diện'"
                :disabled="isUploadingAvatar || isDeletingAvatar"
                @click.stop="triggerFileInput"
              >
                <i class="bi bi-camera-fill text-primary small"></i>
              </button>
            </div>

            <!-- Các nút thao tác ảnh: Tải lên / Đổi ảnh & Xóa ảnh -->
            <div class="d-flex justify-content-center align-items-center gap-2 mb-3">
              <button
                type="button"
                class="btn btn-sm btn-outline-light rounded-pill px-3 py-1 shadow-sm d-flex align-items-center gap-1"
                :disabled="isUploadingAvatar || isDeletingAvatar"
                @click="triggerFileInput"
              >
                <span v-if="isUploadingAvatar" class="spinner-border spinner-border-sm me-1" role="status"></span>
                <i v-else class="bi bi-cloud-arrow-up-fill"></i>
                <span class="small">{{ currentAvatarUrl ? 'Đổi ảnh' : 'Tải ảnh lên' }}</span>
              </button>

              <button
                v-if="currentAvatarUrl"
                type="button"
                class="btn btn-sm btn-outline-light rounded-pill px-3 py-1 shadow-sm d-flex align-items-center gap-1 text-white border-white-50"
                :disabled="isUploadingAvatar || isDeletingAvatar"
                @click="openDeleteAvatarModal"
                title="Xóa ảnh đại diện"
              >
                <span v-if="isDeletingAvatar" class="spinner-border spinner-border-sm me-1" role="status"></span>
                <i v-else class="bi bi-trash3-fill"></i>
                <span class="small">Xóa ảnh</span>
              </button>
            </div>

            <!-- Thông báo trạng thái ảnh đại diện -->
            <div v-if="avatarAlert.message" class="mb-3 px-1">
              <div
                class="alert py-1 px-3 small mb-0 rounded-pill d-flex align-items-center justify-content-between shadow-sm"
                :class="avatarAlert.type === 'success' ? 'alert-success text-success-emphasis border-success-subtle' : 'alert-danger text-danger-emphasis border-danger-subtle'"
              >
                <span class="d-flex align-items-center gap-1">
                  <i :class="avatarAlert.type === 'success' ? 'bi bi-check-circle-fill' : 'bi bi-exclamation-circle-fill'"></i>
                  {{ avatarAlert.message }}
                </span>
                <button type="button" class="btn-close btn-close-sm ms-2" style="font-size: 0.65rem;" @click="avatarAlert.message = ''"></button>
              </div>
            </div>

            <h2 class="h5 fw-bold mb-1">
              {{ profileData ? `${profileData.HoLot} ${profileData.Ten}` : authStore.fullName }}
            </h2>
            <div class="small opacity-75 mb-2">
              {{ profileData?.Email || authStore.user?.Email }}
            </div>
            <div class="d-flex justify-content-center gap-2 flex-wrap">
              <span class="badge bg-light text-primary px-3 py-1 rounded-pill fw-semibold">
                Mã: {{ profileData?.MaDocGia || authStore.user?.MaDocGia }}
              </span>
              <span
                v-if="profileData?.TrangThai === 'HoatDong'"
                class="badge bg-success-subtle text-success border border-success-subtle px-3 py-1 rounded-pill fw-semibold"
              >
                <i class="bi bi-check-circle-fill me-1"></i> Đang hoạt động
              </span>
              <span
                v-else
                class="badge bg-danger-subtle text-danger border border-danger-subtle px-3 py-1 rounded-pill fw-semibold"
              >
                <i class="bi bi-lock-fill me-1"></i> Bị khóa
              </span>
            </div>
          </div>

          <div class="card-body p-3 small text-muted">
            <div class="d-flex justify-content-between py-2 border-bottom">
              <span><i class="bi bi-calendar-event me-2 text-primary"></i>Ngày tham gia</span>
              <span class="fw-semibold text-dark">{{ formatDate(profileData?.createdAt) }}</span>
            </div>
            <div class="d-flex justify-content-between py-2 border-bottom">
              <span><i class="bi bi-clock-history me-2 text-primary"></i>Lần đăng nhập cuối</span>
              <span class="fw-semibold text-dark">
                {{ profileData?.LanDangNhapCuoi ? formatDate(profileData.LanDangNhapCuoi, true) : 'Lần đầu' }}
              </span>
            </div>
            <div class="d-flex justify-content-between py-2">
              <span><i class="bi bi-gender-ambiguous me-2 text-primary"></i>Giới tính</span>
              <span class="fw-semibold text-dark">
                {{ profileData?.Phai === 'Nam' ? 'Nam' : profileData?.Phai === 'Nu' ? 'Nữ' : 'Khác' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Thẻ tóm tắt hoạt động mượn sách -->
        <div class="card shadow-sm border-0 rounded-4">
          <div class="card-header bg-white border-0 pt-3 px-3 pb-0 d-flex justify-content-between align-items-center">
            <span class="fw-bold text-dark d-flex align-items-center gap-2">
              <i class="bi bi-journal-bookmark-fill text-primary"></i>
              Hoạt động mượn sách
            </span>
            <RouterLink to="/my-borrowings" class="btn btn-sm btn-link text-decoration-none p-0">
              Chi tiết <i class="bi bi-arrow-right"></i>
            </RouterLink>
          </div>
          <div class="card-body p-3">
            <div v-if="borrowingSummary" class="row g-2">
              <!-- Sách đang mượn / giữ -->
              <div class="col-6">
                <div class="p-2 bg-light rounded-3 text-center border">
                  <div class="small text-muted mb-1">Đang giữ</div>
                  <div class="h5 fw-bold mb-0 text-primary">
                    {{ borrowingSummary.dangChiemCho }} / {{ borrowingSummary.toiDa }}
                  </div>
                  <div class="text-muted" style="font-size: 0.75rem;">cuốn sách</div>
                </div>
              </div>

              <!-- Còn được mượn -->
              <div class="col-6">
                <div class="p-2 bg-light rounded-3 text-center border">
                  <div class="small text-muted mb-1">Được mượn thêm</div>
                  <div class="h5 fw-bold mb-0 text-success">
                    {{ borrowingSummary.conDuocMuon }}
                  </div>
                  <div class="text-muted" style="font-size: 0.75rem;">cuốn sách</div>
                </div>
              </div>

              <!-- Trạng thái quá hạn -->
              <div class="col-12 mt-2">
                <div
                  class="p-2 rounded-3 d-flex align-items-center justify-content-between"
                  :class="borrowingSummary.coQuaHan ? 'bg-danger-subtle text-danger border border-danger-subtle' : 'bg-success-subtle text-success border border-success-subtle'"
                >
                  <span class="small d-flex align-items-center gap-1">
                    <i :class="borrowingSummary.coQuaHan ? 'bi bi-exclamation-triangle-fill' : 'bi bi-check-circle-fill'"></i>
                    {{ borrowingSummary.coQuaHan ? 'Có sách quá hạn' : 'Không có sách quá hạn' }}
                  </span>
                  <span class="badge" :class="borrowingSummary.coQuaHan ? 'bg-danger text-white' : 'bg-success text-white'">
                    {{ borrowingSummary.coQuaHan ? 'Cần trả' : 'Tốt' }}
                  </span>
                </div>
              </div>

              <!-- Tiền phạt nợ đọng nếu có -->
              <div v-if="borrowingSummary.tongPhatChuaTra > 0" class="col-12 mt-1">
                <div class="p-2 bg-warning-subtle text-dark border border-warning-subtle rounded-3 d-flex align-items-center justify-content-between small">
                  <span><i class="bi bi-cash-coin me-1 text-danger"></i>Tiền phạt chưa nộp:</span>
                  <span class="fw-bold text-danger">{{ formatCurrency(borrowingSummary.tongPhatChuaTra) }}</span>
                </div>
              </div>
            </div>

            <div v-else class="text-center py-3 text-muted small">
              <i class="bi bi-info-circle me-1"></i> Chưa có dữ liệu mượn sách.
            </div>
          </div>
        </div>
      </div>

      <!-- CỘT PHẢI: Khối Tabs (Thông tin cá nhân & Đổi mật khẩu) -->
      <div class="col-lg-8">
        <div class="card shadow-sm border-0 rounded-4 overflow-hidden">
          <!-- Thanh điều hướng Tabs -->
          <div class="card-header bg-white border-bottom p-0">
            <ul class="nav nav-tabs card-header-tabs m-0 border-0">
              <li class="nav-item">
                <button
                  type="button"
                  class="nav-link px-4 py-3 border-0 d-flex align-items-center gap-2 fw-semibold"
                  :class="{ active: activeTab === 'profile' }"
                  @click="activeTab = 'profile'"
                >
                  <i class="bi bi-person-gear"></i>
                  <span>Thông tin cá nhân</span>
                </button>
              </li>
              <li class="nav-item">
                <button
                  type="button"
                  class="nav-link px-4 py-3 border-0 d-flex align-items-center gap-2 fw-semibold"
                  :class="{ active: activeTab === 'security' }"
                  @click="activeTab = 'security'"
                >
                  <i class="bi bi-shield-lock"></i>
                  <span>Đổi mật khẩu</span>
                </button>
              </li>
            </ul>
          </div>

          <div class="card-body p-4">
            <!-- TAB 1: THÔNG TIN CÁ NHÂN -->
            <div v-if="activeTab === 'profile'">
              <div class="d-flex align-items-center justify-content-between mb-3">
                <div>
                  <h3 class="h5 fw-bold mb-1 text-dark">Chỉnh sửa hồ sơ độc giả</h3>
                  <p class="text-muted small mb-0">
                    Cập nhật các thông tin liên hệ và nhân khẩu học của bạn trong hệ thống.
                  </p>
                </div>
                <span v-if="isProfileDirty" class="badge bg-warning-subtle text-dark border border-warning-subtle px-2 py-1">
                  <i class="bi bi-pencil-fill me-1"></i> Chưa lưu thay đổi
                </span>
              </div>

              <!-- Thông báo kết quả thao tác -->
              <AppAlert
                :type="profileAlert.type"
                :message="profileAlert.message"
                :dismissible="true"
                @close="profileAlert.message = ''"
              />

              <form @submit.prevent="handleSaveProfile" novalidate>
                <div class="row g-3">
                  <!-- Họ lót -->
                  <div class="col-md-6">
                    <label for="hoLotInput" class="form-label fw-semibold small">
                      Họ lót <span class="text-danger">*</span>
                    </label>
                    <input
                      id="hoLotInput"
                      v-model="profileForm.HoLot"
                      type="text"
                      class="form-control rounded-3"
                      :class="{ 'is-invalid': profileFieldErrors.HoLot }"
                      placeholder="Ví dụ: Nguyễn Văn"
                      maxlength="50"
                      :disabled="isSavingProfile"
                    />
                    <div v-if="profileFieldErrors.HoLot" class="invalid-feedback">
                      {{ profileFieldErrors.HoLot }}
                    </div>
                  </div>

                  <!-- Tên -->
                  <div class="col-md-6">
                    <label for="tenInput" class="form-label fw-semibold small">
                      Tên <span class="text-danger">*</span>
                    </label>
                    <input
                      id="tenInput"
                      v-model="profileForm.Ten"
                      type="text"
                      class="form-control rounded-3"
                      :class="{ 'is-invalid': profileFieldErrors.Ten }"
                      placeholder="Ví dụ: An"
                      maxlength="30"
                      :disabled="isSavingProfile"
                    />
                    <div v-if="profileFieldErrors.Ten" class="invalid-feedback">
                      {{ profileFieldErrors.Ten }}
                    </div>
                  </div>

                  <!-- Ngày sinh -->
                  <div class="col-md-6">
                    <label for="ngaySinhInput" class="form-label fw-semibold small">
                      Ngày sinh <span class="text-danger">*</span>
                    </label>
                    <input
                      id="ngaySinhInput"
                      v-model="profileForm.NgaySinh"
                      type="date"
                      class="form-control rounded-3"
                      :class="{ 'is-invalid': profileFieldErrors.NgaySinh }"
                      :min="minBirthDate"
                      :max="maxBirthDate"
                      :disabled="isSavingProfile"
                    />
                    <div v-if="profileFieldErrors.NgaySinh" class="invalid-feedback">
                      {{ profileFieldErrors.NgaySinh }}
                    </div>
                    <div class="form-text small text-muted">
                      Độ tuổi yêu cầu: từ 5 đến 120 tuổi.
                    </div>
                  </div>

                  <!-- Giới tính (Phái) -->
                  <div class="col-md-6">
                    <label class="form-label fw-semibold small">
                      Giới tính <span class="text-danger">*</span>
                    </label>
                    <div class="d-flex gap-3 align-items-center mt-1">
                      <div class="form-check">
                        <input
                          id="phaiNam"
                          v-model="profileForm.Phai"
                          class="form-check-input"
                          type="radio"
                          value="Nam"
                          name="phaiRadio"
                          :disabled="isSavingProfile"
                        />
                        <label class="form-check-label" for="phaiNam">Nam</label>
                      </div>
                      <div class="form-check">
                        <input
                          id="phaiNu"
                          v-model="profileForm.Phai"
                          class="form-check-input"
                          type="radio"
                          value="Nu"
                          name="phaiRadio"
                          :disabled="isSavingProfile"
                        />
                        <label class="form-check-label" for="phaiNu">Nữ</label>
                      </div>
                    </div>
                    <div v-if="profileFieldErrors.Phai" class="text-danger small mt-1">
                      {{ profileFieldErrors.Phai }}
                    </div>
                  </div>

                  <!-- Số điện thoại -->
                  <div class="col-md-6">
                    <label for="dienThoaiInput" class="form-label fw-semibold small">
                      Số điện thoại <span class="text-danger">*</span>
                    </label>
                    <input
                      id="dienThoaiInput"
                      v-model="profileForm.DienThoai"
                      type="tel"
                      class="form-control rounded-3"
                      :class="{ 'is-invalid': profileFieldErrors.DienThoai }"
                      placeholder="Ví dụ: 0912345678"
                      maxlength="15"
                      :disabled="isSavingProfile"
                    />
                    <div v-if="profileFieldErrors.DienThoai" class="invalid-feedback">
                      {{ profileFieldErrors.DienThoai }}
                    </div>
                    <div class="form-text small text-muted">
                      Định dạng chuẩn 10 chữ số (03x, 05x, 07x, 08x, 09x).
                    </div>
                  </div>

                  <!-- Email (Chỉ đọc) -->
                  <div class="col-md-6">
                    <label for="emailInput" class="form-label fw-semibold small">
                      Email đăng nhập
                    </label>
                    <div class="input-group">
                      <span class="input-group-text bg-light text-muted border-end-0 rounded-start-3">
                        <i class="bi bi-envelope"></i>
                      </span>
                      <input
                        id="emailInput"
                        :value="profileData?.Email || authStore.user?.Email"
                        type="email"
                        class="form-control bg-light text-muted border-start-0 rounded-end-3"
                        readonly
                        disabled
                      />
                    </div>
                    <div class="form-text small text-muted">
                      <i class="bi bi-lock-fill me-1"></i>Email dùng làm định danh tài khoản, không thể tự thay đổi.
                    </div>
                  </div>

                  <!-- Địa chỉ -->
                  <div class="col-12">
                    <div class="d-flex justify-content-between align-items-center">
                      <label for="diaChiInput" class="form-label fw-semibold small">
                        Địa chỉ cư trú
                      </label>
                      <span class="small text-muted">{{ diaChiLength }} / 200 ký tự</span>
                    </div>
                    <textarea
                      id="diaChiInput"
                      v-model="profileForm.DiaChi"
                      rows="2"
                      class="form-control rounded-3"
                      :class="{ 'is-invalid': profileFieldErrors.DiaChi }"
                      placeholder="Nhập địa chỉ nhận sách hoặc nơi ở hiện tại..."
                      maxlength="200"
                      :disabled="isSavingProfile"
                    ></textarea>
                    <div v-if="profileFieldErrors.DiaChi" class="invalid-feedback">
                      {{ profileFieldErrors.DiaChi }}
                    </div>
                  </div>
                </div>

                <!-- Thanh nút thao tác -->
                <div class="d-flex align-items-center justify-content-end gap-2 mt-4 pt-3 border-top">
                  <button
                    type="button"
                    class="btn btn-outline-secondary rounded-pill px-4"
                    :disabled="!isProfileDirty || isSavingProfile"
                    @click="resetProfileForm"
                  >
                    <i class="bi bi-arrow-counterclockwise me-1"></i>
                    Đặt lại
                  </button>

                  <button
                    type="submit"
                    class="btn btn-primary rounded-pill px-4 fw-semibold"
                    :disabled="!isProfileDirty || isSavingProfile"
                  >
                    <span
                      v-if="isSavingProfile"
                      class="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    <i v-else class="bi bi-check-lg me-1"></i>
                    {{ isSavingProfile ? 'Đang lưu...' : 'Lưu thay đổi' }}
                  </button>
                </div>
              </form>
            </div>

            <!-- TAB 2: BẢO MẬT & ĐỔI MẬT KHẨU -->
            <div v-else-if="activeTab === 'security'">
              <div class="mb-4">
                <h3 class="h5 fw-bold mb-1 text-dark">Đổi mật khẩu tài khoản</h3>
                <p class="text-muted small mb-0">
                  Để bảo vệ tài khoản, hãy sử dụng mật khẩu mạnh kết hợp chữ hoa, chữ thường và chữ số.
                </p>
              </div>

              <!-- Thông báo kết quả thao tác -->
              <AppAlert
                :type="passwordAlert.type"
                :message="passwordAlert.message"
                :dismissible="true"
                @close="passwordAlert.message = ''"
              />

              <!-- Banner lưu ý về bảo mật -->
              <div class="alert alert-light border rounded-3 p-3 mb-4 d-flex gap-3 align-items-start">
                <i class="bi bi-shield-check text-primary fs-3 flex-shrink-0"></i>
                <div class="small text-muted">
                  <strong class="text-dark d-block mb-1">Cơ chế an toàn phiên làm việc</strong>
                  Sau khi đổi mật khẩu thành công, toàn bộ các phiên làm việc trên các thiết bị khác sẽ được tự động thu hồi. Thiết bị hiện tại của bạn sẽ được tự động làm mới phiên làm việc.
                </div>
              </div>

              <form @submit.prevent="handleChangePassword" novalidate>
                <div class="row g-3">
                  <!-- Mật khẩu hiện tại -->
                  <div class="col-12">
                    <label for="matKhauCuInput" class="form-label fw-semibold small">
                      Mật khẩu hiện tại <span class="text-danger">*</span>
                    </label>
                    <div class="input-group">
                      <input
                        id="matKhauCuInput"
                        v-model="passwordForm.MatKhauCu"
                        :type="showMatKhauCu ? 'text' : 'password'"
                        class="form-control rounded-start-3"
                        :class="{ 'is-invalid': passwordFieldErrors.MatKhauCu }"
                        placeholder="Nhập mật khẩu bạn đang dùng"
                        autocomplete="current-password"
                        :disabled="isChangingPassword"
                      />
                      <button
                        type="button"
                        class="btn btn-outline-secondary border-start-0 rounded-end-3"
                        @click="showMatKhauCu = !showMatKhauCu"
                        :title="showMatKhauCu ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'"
                        tabindex="-1"
                      >
                        <i :class="showMatKhauCu ? 'bi bi-eye-slash' : 'bi bi-eye'"></i>
                      </button>
                      <div v-if="passwordFieldErrors.MatKhauCu" class="invalid-feedback">
                        {{ passwordFieldErrors.MatKhauCu }}
                      </div>
                    </div>
                  </div>

                  <!-- Mật khẩu mới -->
                  <div class="col-md-6">
                    <label for="matKhauMoiInput" class="form-label fw-semibold small">
                      Mật khẩu mới <span class="text-danger">*</span>
                    </label>
                    <div class="input-group">
                      <input
                        id="matKhauMoiInput"
                        v-model="passwordForm.MatKhauMoi"
                        :type="showMatKhauMoi ? 'text' : 'password'"
                        class="form-control rounded-start-3"
                        :class="{ 'is-invalid': passwordFieldErrors.MatKhauMoi }"
                        placeholder="Nhập mật khẩu mới"
                        autocomplete="new-password"
                        :disabled="isChangingPassword"
                      />
                      <button
                        type="button"
                        class="btn btn-outline-secondary border-start-0 rounded-end-3"
                        @click="showMatKhauMoi = !showMatKhauMoi"
                        :title="showMatKhauMoi ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'"
                        tabindex="-1"
                      >
                        <i :class="showMatKhauMoi ? 'bi bi-eye-slash' : 'bi bi-eye'"></i>
                      </button>
                      <div v-if="passwordFieldErrors.MatKhauMoi" class="invalid-feedback">
                        {{ passwordFieldErrors.MatKhauMoi }}
                      </div>
                    </div>
                  </div>

                  <!-- Xác nhận mật khẩu mới -->
                  <div class="col-md-6">
                    <label for="confirmPasswordInput" class="form-label fw-semibold small">
                      Xác nhận mật khẩu mới <span class="text-danger">*</span>
                    </label>
                    <div class="input-group">
                      <input
                        id="confirmPasswordInput"
                        v-model="passwordForm.ConfirmPassword"
                        :type="showConfirmPassword ? 'text' : 'password'"
                        class="form-control rounded-start-3"
                        :class="{ 'is-invalid': passwordFieldErrors.ConfirmPassword }"
                        placeholder="Nhập lại mật khẩu mới"
                        autocomplete="new-password"
                        :disabled="isChangingPassword"
                      />
                      <button
                        type="button"
                        class="btn btn-outline-secondary border-start-0 rounded-end-3"
                        @click="showConfirmPassword = !showConfirmPassword"
                        :title="showConfirmPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'"
                        tabindex="-1"
                      >
                        <i :class="showConfirmPassword ? 'bi bi-eye-slash' : 'bi bi-eye'"></i>
                      </button>
                      <div v-if="passwordFieldErrors.ConfirmPassword" class="invalid-feedback">
                        {{ passwordFieldErrors.ConfirmPassword }}
                      </div>
                    </div>
                  </div>

                  <!-- Checklist yêu cầu độ mạnh mật khẩu trực quan -->
                  <div class="col-12 mt-3">
                    <div class="p-3 bg-light rounded-3 border">
                      <div class="small fw-semibold text-dark mb-2">
                        <i class="bi bi-shield-check me-1 text-primary"></i>
                        Quy tắc mật khẩu an toàn:
                      </div>
                      <div class="row g-2 small">
                        <div class="col-sm-6">
                          <div
                            class="d-flex align-items-center gap-2"
                            :class="passwordChecks.hasMinLength ? 'text-success' : 'text-muted'"
                          >
                            <i
                              class="bi"
                              :class="passwordChecks.hasMinLength ? 'bi-check-circle-fill' : 'bi-circle'"
                            ></i>
                            <span>Tối thiểu 8 ký tự</span>
                          </div>
                        </div>

                        <div class="col-sm-6">
                          <div
                            class="d-flex align-items-center gap-2"
                            :class="passwordChecks.hasUpperCase ? 'text-success' : 'text-muted'"
                          >
                            <i
                              class="bi"
                              :class="passwordChecks.hasUpperCase ? 'bi-check-circle-fill' : 'bi-circle'"
                            ></i>
                            <span>Chứa ít nhất 1 chữ hoa (A-Z)</span>
                          </div>
                        </div>

                        <div class="col-sm-6">
                          <div
                            class="d-flex align-items-center gap-2"
                            :class="passwordChecks.hasLowerCase ? 'text-success' : 'text-muted'"
                          >
                            <i
                              class="bi"
                              :class="passwordChecks.hasLowerCase ? 'bi-check-circle-fill' : 'bi-circle'"
                            ></i>
                            <span>Chứa ít nhất 1 chữ thường (a-z)</span>
                          </div>
                        </div>

                        <div class="col-sm-6">
                          <div
                            class="d-flex align-items-center gap-2"
                            :class="passwordChecks.hasNumber ? 'text-success' : 'text-muted'"
                          >
                            <i
                              class="bi"
                              :class="passwordChecks.hasNumber ? 'bi-check-circle-fill' : 'bi-circle'"
                            ></i>
                            <span>Chứa ít nhất 1 chữ số (0-9)</span>
                          </div>
                        </div>

                        <div class="col-sm-6">
                          <div
                            class="d-flex align-items-center gap-2"
                            :class="passwordChecks.notContainEmail && passwordChecks.notContainMaDocGia ? 'text-success' : 'text-muted'"
                          >
                            <i
                              class="bi"
                              :class="passwordChecks.notContainEmail && passwordChecks.notContainMaDocGia ? 'bi-check-circle-fill' : 'bi-circle'"
                            ></i>
                            <span>Không chứa email hoặc mã độc giả</span>
                          </div>
                        </div>

                        <div class="col-sm-6">
                          <div
                            class="d-flex align-items-center gap-2"
                            :class="passwordChecks.differentFromOld ? 'text-success' : 'text-muted'"
                          >
                            <i
                              class="bi"
                              :class="passwordChecks.differentFromOld ? 'bi-check-circle-fill' : 'bi-circle'"
                            ></i>
                            <span>Khác mật khẩu hiện tại</span>
                          </div>
                        </div>

                        <div class="col-12 mt-1">
                          <div
                            class="d-flex align-items-center gap-2"
                            :class="passwordChecks.matchesConfirm ? 'text-success' : 'text-muted'"
                          >
                            <i
                              class="bi"
                              :class="passwordChecks.matchesConfirm ? 'bi-check-circle-fill' : 'bi-circle'"
                            ></i>
                            <span>Mật khẩu xác nhận trùng khớp</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Nút nộp form đổi mật khẩu -->
                <div class="d-flex justify-content-end mt-4 pt-3 border-top">
                  <button
                    type="submit"
                    class="btn btn-primary rounded-pill px-4 fw-semibold"
                    :disabled="isChangingPassword || !passwordForm.MatKhauCu || !passwordChecks.isValidStrength || !passwordChecks.matchesConfirm"
                  >
                    <span
                      v-if="isChangingPassword"
                      class="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    <i v-else class="bi bi-key-fill me-1"></i>
                    {{ isChangingPassword ? 'Đang cập nhật...' : 'Cập nhật mật khẩu' }}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL XÁC NHẬN XÓA ẢNH ĐẠI DIỆN -->
    <ConfirmModal
      ref="deleteAvatarModalRef"
      title="Xác nhận xóa ảnh đại diện"
      confirm-text="Xóa ảnh"
      cancel-text="Hủy bỏ"
      confirm-btn-class="btn-danger"
      icon="bi-trash3-fill text-danger"
      :is-processing="isDeletingAvatar"
      @confirm="confirmDeleteAvatar"
    >
      <div class="text-center py-2">
        <div class="mb-3">
          <img
            v-if="currentAvatarUrl"
            :src="currentAvatarUrl"
            alt="Avatar"
            class="rounded-circle object-fit-cover shadow-sm border border-2 border-danger-subtle"
            style="width: 80px; height: 80px;"
          />
        </div>
        <p class="mb-1 text-dark fw-semibold">
          Bạn có chắc chắn muốn xóa ảnh đại diện này không?
        </p>
        <p class="small text-muted mb-0">
          Ảnh sẽ được xóa khỏi hệ thống và tài khoản của bạn sẽ chuyển về biểu tượng đại diện mặc định.
        </p>
      </div>
    </ConfirmModal>
  </div>
</template>

<style scoped>
.avatar-circle {
  width: 88px;
  height: 88px;
  background-color: #ffffff;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.6);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.avatar-circle:hover {
  transform: scale(1.03);
}

.cursor-pointer {
  cursor: pointer;
}

.avatar-badge-btn {
  bottom: 0;
  right: 0;
  width: 28px;
  height: 28px;
  border: 2px solid #ffffff;
  transition: transform 0.2s ease;
}

.avatar-badge-btn:hover {
  transform: scale(1.12);
}

.nav-tabs .nav-link {
  color: #6c757d;
  background-color: transparent;
  border-bottom: 2px solid transparent !important;
}

.nav-tabs .nav-link:hover {
  color: var(--bs-primary);
}

.nav-tabs .nav-link.active {
  color: var(--bs-primary);
  border-bottom: 2px solid var(--bs-primary) !important;
  background-color: #ffffff;
}

.form-control:focus,
.form-select:focus {
  border-color: #86b7fe;
  box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.15);
}
</style>
