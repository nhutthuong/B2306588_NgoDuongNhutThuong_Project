<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import settingsApi from '../api/settings.api.js';
import { useAuthStore } from '../stores/auth.js';
import { formatCurrency } from '../utils/format.js';
import { getErrorMessage, getFieldErrors } from '../api/http.js';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import AppAlert from '../components/AppAlert.vue';
import ConfirmModal from '../components/ConfirmModal.vue';

const authStore = useAuthStore();

const isLoading = ref(true);
const isSaving = ref(false);
const isResetting = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

// Giá trị form cấu hình
const form = reactive({
  SoSachToiDa: 5,
  SoNgayMuon: 14,
  HanNhanSach: 2,
  PhiTreMoiNgay: 2000,
  TyLePhatRach: 0.5,
  TyLePhatMat: 1.0,
  PhiXuLyMat: 20000,
});

// Lỗi validate theo trường
const errors = reactive({
  SoSachToiDa: '',
  SoNgayMuon: '',
  HanNhanSach: '',
  PhiTreMoiNgay: '',
  TyLePhatRach: '',
  TyLePhatMat: '',
  PhiXuLyMat: '',
});

// Bản sao cấu hình ban đầu để kiểm tra xem có thay đổi hay chưa
const initialSettings = ref(null);

const isFormDirty = computed(() => {
  if (!initialSettings.value) return false;
  return (
    Number(form.SoSachToiDa) !== Number(initialSettings.value.SoSachToiDa) ||
    Number(form.SoNgayMuon) !== Number(initialSettings.value.SoNgayMuon) ||
    Number(form.HanNhanSach) !== Number(initialSettings.value.HanNhanSach) ||
    Number(form.PhiTreMoiNgay) !== Number(initialSettings.value.PhiTreMoiNgay) ||
    Number(form.TyLePhatRach) !== Number(initialSettings.value.TyLePhatRach) ||
    Number(form.TyLePhatMat) !== Number(initialSettings.value.TyLePhatMat) ||
    Number(form.PhiXuLyMat) !== Number(initialSettings.value.PhiXuLyMat)
  );
});

// Bảng mô phỏng mức phạt trực quan theo cấu hình hiện tại
const simBookPrice = ref(100000);
const simOverdueDays = ref(3);

const simPhiTre = computed(() => {
  const days = Math.max(0, parseInt(simOverdueDays.value, 10) || 0);
  const dailyFee = Math.max(0, Number(form.PhiTreMoiNgay) || 0);
  const price = Math.max(0, Number(simBookPrice.value) || 0);
  return Math.min(price, days * dailyFee);
});

const simPhatRachNhe = computed(() => {
  const price = Math.max(0, Number(simBookPrice.value) || 0);
  const ratio = Math.max(0, Number(form.TyLePhatRach) || 0) * 0.5;
  return Math.round(price * ratio);
});

const simPhatRachNang = computed(() => {
  const price = Math.max(0, Number(simBookPrice.value) || 0);
  const ratio = Math.max(0, Number(form.TyLePhatRach) || 0);
  return Math.round(price * ratio);
});

const simPhatMat = computed(() => {
  const price = Math.max(0, Number(simBookPrice.value) || 0);
  const ratio = Math.max(0, Number(form.TyLePhatMat) || 0);
  const processFee = Math.max(0, Number(form.PhiXuLyMat) || 0);
  return Math.round(price * ratio + processFee);
});

const resetErrors = () => {
  Object.keys(errors).forEach((key) => {
    errors[key] = '';
  });
};

const fetchSettings = async () => {
  isLoading.value = true;
  errorMessage.value = '';
  resetErrors();

  try {
    const res = await settingsApi.get();
    const data = res.data?.data;
    if (data) {
      Object.assign(form, data);
      initialSettings.value = { ...data };
    }
  } catch (err) {
    errorMessage.value = getErrorMessage(err);
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  fetchSettings();
});

const validateClient = () => {
  resetErrors();
  let isValid = true;

  const toida = Number(form.SoSachToiDa);
  if (!Number.isInteger(toida) || toida < 1 || toida > 100) {
    errors.SoSachToiDa = 'Số sách mượn tối đa phải từ 1 đến 100 quyển';
    isValid = false;
  }

  const ngaymuon = Number(form.SoNgayMuon);
  if (!Number.isInteger(ngaymuon) || ngaymuon < 1 || ngaymuon > 365) {
    errors.SoNgayMuon = 'Số ngày mượn phải từ 1 đến 365 ngày';
    isValid = false;
  }

  const hannhan = Number(form.HanNhanSach);
  if (!Number.isInteger(hannhan) || hannhan < 1 || hannhan > 30) {
    errors.HanNhanSach = 'Hạn nhận sách sau khi duyệt phải từ 1 đến 30 ngày';
    isValid = false;
  }

  const phitre = Number(form.PhiTreMoiNgay);
  if (isNaN(phitre) || phitre < 0 || phitre > 1000000) {
    errors.PhiTreMoiNgay = 'Phí trễ mỗi ngày phải từ 0 đến 1.000.000 đ';
    isValid = false;
  }

  const tylerach = Number(form.TyLePhatRach);
  if (isNaN(tylerach) || tylerach < 0 || tylerach > 1) {
    errors.TyLePhatRach = 'Tỷ lệ phạt rách phải từ 0 đến 1.0 (tương đương 0% đến 100%)';
    isValid = false;
  }

  const tylemat = Number(form.TyLePhatMat);
  if (isNaN(tylemat) || tylemat < 0 || tylemat > 10) {
    errors.TyLePhatMat = 'Tỷ lệ phạt mất sách phải từ 0 đến 10 lần đơn giá';
    isValid = false;
  }

  const phixuly = Number(form.PhiXuLyMat);
  if (isNaN(phixuly) || phixuly < 0 || phixuly > 1000000) {
    errors.PhiXuLyMat = 'Phí xử lý mất sách phải từ 0 đến 1.000.000 đ';
    isValid = false;
  }

  return isValid;
};

const handleSave = async () => {
  if (!validateClient()) return;

  isSaving.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    const payload = {
      SoSachToiDa: Number(form.SoSachToiDa),
      SoNgayMuon: Number(form.SoNgayMuon),
      HanNhanSach: Number(form.HanNhanSach),
      PhiTreMoiNgay: Number(form.PhiTreMoiNgay),
      TyLePhatRach: Number(form.TyLePhatRach),
      TyLePhatMat: Number(form.TyLePhatMat),
      PhiXuLyMat: Number(form.PhiXuLyMat),
    };

    const res = await settingsApi.update(payload);
    const data = res.data?.data;
    if (data) {
      Object.assign(form, data);
      initialSettings.value = { ...data };
    }
    successMessage.value = 'Lưu cấu hình hệ thống thành công. Quy định mới có hiệu lực ngay lập tức.';
  } catch (err) {
    const fieldErrs = getFieldErrors(err);
    if (fieldErrs && Object.keys(fieldErrs).length > 0) {
      Object.assign(errors, fieldErrs);
    } else {
      errorMessage.value = getErrorMessage(err);
    }
  } finally {
    isSaving.value = false;
  }
};

const resetModalRef = ref(null);

const openResetModal = () => {
  if (resetModalRef.value) {
    resetModalRef.value.show();
  }
};

const handleConfirmReset = async () => {
  isResetting.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    const res = await settingsApi.reset();
    const data = res.data?.data;
    if (data) {
      Object.assign(form, data);
      initialSettings.value = { ...data };
    }
    if (resetModalRef.value) {
      resetModalRef.value.hide();
    }
    successMessage.value = 'Đã khôi phục toàn bộ cấu hình hệ thống về giá trị mặc định chuẩn.';
  } catch (err) {
    errorMessage.value = getErrorMessage(err);
  } finally {
    isResetting.value = false;
  }
};
</script>

<template>
  <div class="settings-view">
    <!-- Tiêu đề trang -->
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
      <div>
        <div class="d-flex align-items-center gap-2">
          <div class="p-2 bg-primary-subtle text-primary rounded-3">
            <i class="bi bi-gear-fill fs-4"></i>
          </div>
          <div>
            <h1 class="h3 fw-bold mb-0 text-dark">Cấu hình Hệ thống</h1>
            <p class="text-muted small mb-0">
              Thiết lập quy định mượn trả, thời hạn nhận sách và biểu phí xử lý vi phạm trễ/hỏng/mất.
            </p>
          </div>
        </div>
      </div>

      <div class="d-flex align-items-center gap-2">
        <button
          type="button"
          class="btn btn-outline-secondary d-flex align-items-center gap-1 btn-sm"
          :disabled="isLoading || isSaving"
          @click="fetchSettings"
        >
          <i class="bi bi-arrow-clockwise"></i>
          <span>Tải lại</span>
        </button>

        <button
          type="button"
          class="btn btn-outline-danger d-flex align-items-center gap-1 btn-sm"
          :disabled="isLoading || isSaving || !authStore.isAdmin"
          @click="openResetModal"
        >
          <i class="bi bi-arrow-counterclockwise"></i>
          <span>Khôi phục mặc định</span>
        </button>
      </div>
    </div>

    <!-- Thông báo kết quả -->
    <AppAlert
      v-if="successMessage"
      type="success"
      :message="successMessage"
      dismissible
      class="mb-3"
      @dismiss="successMessage = ''"
    />

    <AppAlert
      v-if="errorMessage"
      type="danger"
      :message="errorMessage"
      dismissible
      class="mb-3"
      @dismiss="errorMessage = ''"
    />

    <!-- Trạng thái tải dữ liệu -->
    <div v-if="isLoading" class="card border-0 shadow-sm p-5 text-center">
      <LoadingSpinner text="Đang tải cấu hình hệ thống..." />
    </div>

    <!-- Khối Form Cấu hình -->
    <form v-else @submit.prevent="handleSave">
      <div class="row g-4">
        <!-- Khối 1: Quy tắc mượn sách -->
        <div class="col-lg-6">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-header bg-white border-bottom py-3">
              <h5 class="card-title fw-bold mb-0 d-flex align-items-center gap-2 text-dark">
                <i class="bi bi-journal-bookmark-fill text-primary"></i>
                <span>Quy tắc mượn sách</span>
              </h5>
            </div>
            <div class="card-body p-4">
              <!-- Số sách tối đa -->
              <div class="mb-4">
                <label for="inputSoSachToiDa" class="form-label fw-semibold text-dark">
                  Số sách mượn tối đa cùng lúc <span class="text-danger">*</span>
                </label>
                <div class="input-group">
                  <span class="input-group-text bg-light text-muted">
                    <i class="bi bi-collection"></i>
                  </span>
                  <input
                    id="inputSoSachToiDa"
                    v-model.number="form.SoSachToiDa"
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    class="form-control"
                    :class="{ 'is-invalid': errors.SoSachToiDa }"
                    required
                    :disabled="isSaving || !authStore.isAdmin"
                  />
                  <span class="input-group-text bg-light">quyển</span>
                  <div v-if="errors.SoSachToiDa" class="invalid-feedback">
                    {{ errors.SoSachToiDa }}
                  </div>
                </div>
                <div class="form-text small text-muted">
                  Tổng số phiếu mượn đang chiếm chỗ (Chờ duyệt, Đã duyệt, Đang mượn) tối đa của 1 độc giả. Mặc định: 5.
                </div>
              </div>

              <!-- Số ngày mượn -->
              <div class="mb-4">
                <label for="inputSoNgayMuon" class="form-label fw-semibold text-dark">
                  Thời hạn mượn sách <span class="text-danger">*</span>
                </label>
                <div class="input-group">
                  <span class="input-group-text bg-light text-muted">
                    <i class="bi bi-calendar-event"></i>
                  </span>
                  <input
                    id="inputSoNgayMuon"
                    v-model.number="form.SoNgayMuon"
                    type="number"
                    min="1"
                    max="365"
                    step="1"
                    class="form-control"
                    :class="{ 'is-invalid': errors.SoNgayMuon }"
                    required
                    :disabled="isSaving || !authStore.isAdmin"
                  />
                  <span class="input-group-text bg-light">ngày</span>
                  <div v-if="errors.SoNgayMuon" class="invalid-feedback">
                    {{ errors.SoNgayMuon }}
                  </div>
                </div>
                <div class="form-text small text-muted">
                  Hạn trả sách được tính tự động khi thủ thư giao sách: <code>Hạn trả = Ngày giao + Số ngày mượn</code>. Mặc định: 14 ngày.
                </div>
              </div>

              <!-- Hạn nhận sách sau khi duyệt -->
              <div class="mb-2">
                <label for="inputHanNhanSach" class="form-label fw-semibold text-dark">
                  Hạn nhận sách sau khi duyệt <span class="text-danger">*</span>
                </label>
                <div class="input-group">
                  <span class="input-group-text bg-light text-muted">
                    <i class="bi bi-clock-history"></i>
                  </span>
                  <input
                    id="inputHanNhanSach"
                    v-model.number="form.HanNhanSach"
                    type="number"
                    min="1"
                    max="30"
                    step="1"
                    class="form-control"
                    :class="{ 'is-invalid': errors.HanNhanSach }"
                    required
                    :disabled="isSaving || !authStore.isAdmin"
                  />
                  <span class="input-group-text bg-light">ngày</span>
                  <div v-if="errors.HanNhanSach" class="invalid-feedback">
                    {{ errors.HanNhanSach }}
                  </div>
                </div>
                <div class="form-text small text-muted">
                  Thời gian giữ sách cho độc giả đến quầy nhận. Quá thời hạn này, hệ thống sẽ tự động hủy phiếu và hoàn sách về kho. Mặc định: 2 ngày.
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Khối 2: Biểu phí phạt vi phạm -->
        <div class="col-lg-6">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-header bg-white border-bottom py-3">
              <h5 class="card-title fw-bold mb-0 d-flex align-items-center gap-2 text-dark">
                <i class="bi bi-cash-stack text-warning"></i>
                <span>Biểu phí và phạt vi phạm</span>
              </h5>
            </div>
            <div class="card-body p-4">
              <!-- Phí trễ hạn mỗi ngày -->
              <div class="mb-4">
                <label for="inputPhiTreMoiNgay" class="form-label fw-semibold text-dark">
                  Phí trễ hạn mỗi ngày <span class="text-danger">*</span>
                </label>
                <div class="input-group">
                  <span class="input-group-text bg-light text-muted">
                    <i class="bi bi-stopwatch"></i>
                  </span>
                  <input
                    id="inputPhiTreMoiNgay"
                    v-model.number="form.PhiTreMoiNgay"
                    type="number"
                    min="0"
                    max="1000000"
                    step="500"
                    class="form-control"
                    :class="{ 'is-invalid': errors.PhiTreMoiNgay }"
                    required
                    :disabled="isSaving || !authStore.isAdmin"
                  />
                  <span class="input-group-text bg-light">VNĐ / ngày</span>
                  <div v-if="errors.PhiTreMoiNgay" class="invalid-feedback">
                    {{ errors.PhiTreMoiNgay }}
                  </div>
                </div>
                <div class="form-text small text-muted">
                  Phí phạt tính trên mỗi ngày độc giả trả sách quá hạn (tối đa bằng 100% đơn giá sách). Mặc định: 2.000 đ.
                </div>
              </div>

              <!-- Tỷ lệ phạt rách -->
              <div class="mb-4">
                <label for="inputTyLePhatRach" class="form-label fw-semibold text-dark">
                  Tỷ lệ phạt rách sách (mức nặng) <span class="text-danger">*</span>
                </label>
                <div class="input-group">
                  <span class="input-group-text bg-light text-muted">
                    <i class="bi bi-percent"></i>
                  </span>
                  <input
                    id="inputTyLePhatRach"
                    v-model.number="form.TyLePhatRach"
                    type="number"
                    min="0"
                    max="1"
                    step="0.05"
                    class="form-control"
                    :class="{ 'is-invalid': errors.TyLePhatRach }"
                    required
                    :disabled="isSaving || !authStore.isAdmin"
                  />
                  <span class="input-group-text bg-light">
                    {{ (Number(form.TyLePhatRach) * 100).toFixed(0) }}% đơn giá
                  </span>
                  <div v-if="errors.TyLePhatRach" class="invalid-feedback">
                    {{ errors.TyLePhatRach }}
                  </div>
                </div>
                <div class="form-text small text-muted">
                  Mức rách nhẹ tính bằng 50% tỷ lệ này. Mặc định: 0.5 (tương đương 50% đơn giá sách).
                </div>
              </div>

              <!-- Tỷ lệ phạt mất sách -->
              <div class="mb-4">
                <label for="inputTyLePhatMat" class="form-label fw-semibold text-dark">
                  Tỷ lệ đền mất sách <span class="text-danger">*</span>
                </label>
                <div class="input-group">
                  <span class="input-group-text bg-light text-muted">
                    <i class="bi bi-x-circle"></i>
                  </span>
                  <input
                    id="inputTyLePhatMat"
                    v-model.number="form.TyLePhatMat"
                    type="number"
                    min="0"
                    max="10"
                    step="0.1"
                    class="form-control"
                    :class="{ 'is-invalid': errors.TyLePhatMat }"
                    required
                    :disabled="isSaving || !authStore.isAdmin"
                  />
                  <span class="input-group-text bg-light">
                    {{ (Number(form.TyLePhatMat) * 100).toFixed(0) }}% đơn giá
                  </span>
                  <div v-if="errors.TyLePhatMat" class="invalid-feedback">
                    {{ errors.TyLePhatMat }}
                  </div>
                </div>
                <div class="form-text small text-muted">
                  Mức đền bù giá trị sách khi độc giả làm mất. Mặc định: 1.0 (tương đương 100% đơn giá sách).
                </div>
              </div>

              <!-- Phí xử lý mất sách -->
              <div class="mb-2">
                <label for="inputPhiXuLyMat" class="form-label fw-semibold text-dark">
                  Phí xử lý nghiệp vụ khi mất sách <span class="text-danger">*</span>
                </label>
                <div class="input-group">
                  <span class="input-group-text bg-light text-muted">
                    <i class="bi bi-tools"></i>
                  </span>
                  <input
                    id="inputPhiXuLyMat"
                    v-model.number="form.PhiXuLyMat"
                    type="number"
                    min="0"
                    max="1000000"
                    step="5000"
                    class="form-control"
                    :class="{ 'is-invalid': errors.PhiXuLyMat }"
                    required
                    :disabled="isSaving || !authStore.isAdmin"
                  />
                  <span class="input-group-text bg-light">VNĐ</span>
                  <div v-if="errors.PhiXuLyMat" class="invalid-feedback">
                    {{ errors.PhiXuLyMat }}
                  </div>
                </div>
                <div class="form-text small text-muted">
                  Khoản phí cố định bổ sung để bù đắp chi phí đặt hàng, gắn mã vạch và phân loại lại. Mặc định: 20.000 đ.
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Khối 3: Bảng mô phỏng trực quan kết quả tính toán -->
        <div class="col-12">
          <div class="card border-0 shadow-sm bg-light-subtle">
            <div class="card-header bg-white border-bottom py-3">
              <div class="d-flex flex-wrap align-items-center justify-content-between gap-3">
                <h5 class="card-title fw-bold mb-0 d-flex align-items-center gap-2 text-dark">
                  <i class="bi bi-calculator-fill text-info"></i>
                  <span>Mô phỏng mức phạt thực tế theo cấu hình trên</span>
                </h5>
                <span class="badge bg-info-subtle text-info border border-info-subtle">
                  Thời gian thực
                </span>
              </div>
            </div>
            <div class="card-body p-4">
              <!-- Bộ nhập giá sách và số ngày trễ mô phỏng -->
              <div class="row g-3 mb-4">
                <div class="col-md-6">
                  <label for="simPriceInput" class="form-label small fw-semibold text-muted">
                    Đơn giá sách giả định:
                  </label>
                  <div class="input-group input-group-sm">
                    <input
                      id="simPriceInput"
                      v-model.number="simBookPrice"
                      type="number"
                      min="1000"
                      step="5000"
                      class="form-control"
                    />
                    <span class="input-group-text">VNĐ</span>
                  </div>
                </div>
                <div class="col-md-6">
                  <label for="simDaysInput" class="form-label small fw-semibold text-muted">
                    Số ngày trễ hạn giả định:
                  </label>
                  <div class="input-group input-group-sm">
                    <input
                      id="simDaysInput"
                      v-model.number="simOverdueDays"
                      type="number"
                      min="0"
                      step="1"
                      class="form-control"
                    />
                    <span class="input-group-text">ngày</span>
                  </div>
                </div>
              </div>

              <!-- Thẻ kết quả 4 trường hợp -->
              <div class="row g-3 text-center">
                <div class="col-lg-3 col-sm-6">
                  <div class="p-3 bg-white rounded border h-100">
                    <div class="text-muted small mb-1">Chỉ trễ hạn</div>
                    <div class="fs-5 fw-bold text-dark">{{ formatCurrency(simPhiTre) }}</div>
                    <div class="small text-muted mt-1">{{ simOverdueDays }} ngày × {{ formatCurrency(form.PhiTreMoiNgay) }}</div>
                  </div>
                </div>
                <div class="col-lg-3 col-sm-6">
                  <div class="p-3 bg-white rounded border h-100">
                    <div class="text-muted small mb-1">Trễ + Rách nhẹ</div>
                    <div class="fs-5 fw-bold text-warning">{{ formatCurrency(simPhiTre + simPhatRachNhe) }}</div>
                    <div class="small text-muted mt-1">Phí trễ + {{ formatCurrency(simPhatRachNhe) }} (rách nhẹ)</div>
                  </div>
                </div>
                <div class="col-lg-3 col-sm-6">
                  <div class="p-3 bg-white rounded border h-100">
                    <div class="text-muted small mb-1">Trễ + Rách nặng</div>
                    <div class="fs-5 fw-bold text-danger">{{ formatCurrency(simPhiTre + simPhatRachNang) }}</div>
                    <div class="small text-muted mt-1">Phí trễ + {{ formatCurrency(simPhatRachNang) }} (rách nặng)</div>
                  </div>
                </div>
                <div class="col-lg-3 col-sm-6">
                  <div class="p-3 bg-white rounded border h-100">
                    <div class="text-muted small mb-1">Trễ + Làm mất sách</div>
                    <div class="fs-5 fw-bold text-danger">{{ formatCurrency(simPhiTre + simPhatMat) }}</div>
                    <div class="small text-muted mt-1">Đền {{ formatCurrency(simPhatMat) }} + phí trễ</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Nút lưu cấu hình -->
        <div class="col-12 text-end">
          <button
            type="submit"
            class="btn btn-primary px-4 py-2 shadow-sm d-inline-flex align-items-center gap-2"
            :disabled="isSaving || !authStore.isAdmin"
          >
            <span
              v-if="isSaving"
              class="spinner-border spinner-border-sm"
              role="status"
              aria-hidden="true"
            ></span>
            <i v-else class="bi bi-save-fill"></i>
            <span>{{ isSaving ? 'Đang lưu...' : 'Lưu thay đổi cấu hình' }}</span>
          </button>
        </div>
      </div>
    </form>

    <!-- Modal xác nhận khôi phục mặc định -->
    <ConfirmModal
      ref="resetModalRef"
      title="Khôi phục cấu hình mặc định"
      message="Bạn có chắc chắn muốn khôi phục toàn bộ tham số cấu hình hệ thống về giá trị tiêu chuẩn ban đầu không? Mọi thay đổi hiện tại sẽ được thay thế."
      confirm-text="Khôi phục mặc định"
      confirm-btn-class="btn-danger"
      :is-processing="isResetting"
      icon="bi-arrow-counterclockwise text-danger"
      @confirm="handleConfirmReset"
    />
  </div>
</template>

<style scoped>
.settings-view {
  min-height: 100%;
}
</style>
