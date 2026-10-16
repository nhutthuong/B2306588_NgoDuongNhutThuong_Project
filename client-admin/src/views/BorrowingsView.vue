<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Modal } from 'bootstrap';
import borrowingApi from '../api/borrowing.api.js';
import { getErrorMessage, getFieldErrors } from '../api/http.js';
import { formatCurrency, formatDate, getCoverUrl } from '../utils/format.js';
import StatusBadge from '../components/StatusBadge.vue';
import AppPagination from '../components/AppPagination.vue';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import EmptyState from '../components/EmptyState.vue';
import AppAlert from '../components/AppAlert.vue';

const route = useRoute();
const router = useRouter();

// Danh sách phiếu mượn & meta phân trang
const borrowings = ref([]);
const meta = ref({
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 1,
});

const isLoading = ref(true);
const alert = reactive({
  type: 'info',
  message: '',
});

// Bộ lọc phản ứng
const filters = reactive({
  trangThai: '',
  maDocGia: '',
  maSach: '',
  quaHan: false,
  trangThaiPhat: '',
  tuNgay: '',
  denNgay: '',
  limit: 10,
});

// Tab trạng thái
const statusTabs = [
  { value: '', label: 'Tất cả' },
  { value: 'ChoDuyet', label: 'Chờ duyệt', icon: 'bi-clock-history' },
  { value: 'DaDuyet', label: 'Đã duyệt', icon: 'bi-check2-circle' },
  { value: 'DangMuon', label: 'Đang mượn', icon: 'bi-book-half' },
  { value: 'DaTra', label: 'Đã trả', icon: 'bi-check-all' },
  { value: 'TuChoi', label: 'Bị từ chối', icon: 'bi-x-circle' },
  { value: 'DaHuy', label: 'Đã hủy', icon: 'bi-slash-circle' },
];

let debounceTimer = null;
let currentAbortController = null;

/**
 * Đọc query từ URL nạp vào state filters
 */
const syncFiltersFromRoute = () => {
  filters.trangThai = typeof route.query.trangThai === 'string' ? route.query.trangThai : '';
  filters.maDocGia = typeof route.query.maDocGia === 'string' ? route.query.maDocGia : '';
  filters.maSach = typeof route.query.maSach === 'string' ? route.query.maSach : '';
  filters.quaHan = route.query.quaHan === 'true';
  filters.trangThaiPhat = typeof route.query.trangThaiPhat === 'string' ? route.query.trangThaiPhat : '';
  filters.tuNgay = typeof route.query.tuNgay === 'string' ? route.query.tuNgay : '';
  filters.denNgay = typeof route.query.denNgay === 'string' ? route.query.denNgay : '';
  const parsedLimit = parseInt(route.query.limit, 10);
  filters.limit = !isNaN(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10;
};

/**
 * Đẩy state filters lên route.query
 */
const pushFiltersToRoute = (overrides = {}) => {
  const query = {
    ...route.query,
    ...overrides,
  };

  if (!query.trangThai) delete query.trangThai;
  if (!query.maDocGia) delete query.maDocGia;
  if (!query.maSach) delete query.maSach;
  if (!query.quaHan) delete query.quaHan;
  if (!query.trangThaiPhat) delete query.trangThaiPhat;
  if (!query.tuNgay) delete query.tuNgay;
  if (!query.denNgay) delete query.denNgay;
  if (query.limit === 10 || !query.limit) delete query.limit;

  router.push({ query });
};

/**
 * Gọi API tải danh sách phiếu mượn
 */
const fetchBorrowings = async () => {
  if (currentAbortController) {
    currentAbortController.abort();
  }
  currentAbortController = new AbortController();

  isLoading.value = true;
  const page = parseInt(route.query.page, 10) || 1;

  const params = {
    page,
    limit: filters.limit,
  };

  if (filters.trangThai) params.trangThai = filters.trangThai;
  if (filters.maDocGia) params.maDocGia = filters.maDocGia.trim();
  if (filters.maSach) params.maSach = filters.maSach.trim();
  if (filters.quaHan) params.quaHan = true;
  if (filters.trangThaiPhat) params.trangThaiPhat = filters.trangThaiPhat;
  if (filters.tuNgay) params.tuNgay = filters.tuNgay;
  if (filters.denNgay) params.denNgay = filters.denNgay;

  try {
    const res = await borrowingApi.list(params, currentAbortController.signal);
    borrowings.value = res.data?.data || [];
    meta.value = res.data?.meta || {
      page,
      limit: filters.limit,
      total: borrowings.value.length,
      totalPages: 1,
    };
  } catch (error) {
    if (error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
      return;
    }
    alert.type = 'danger';
    alert.message = getErrorMessage(error);
  } finally {
    isLoading.value = false;
  }
};

const handleTabChange = (val) => {
  filters.trangThai = val;
  pushFiltersToRoute({ trangThai: val || undefined, page: 1 });
};

const handleInputDebounced = () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    pushFiltersToRoute({
      maDocGia: filters.maDocGia || undefined,
      maSach: filters.maSach || undefined,
      page: 1,
    });
  }, 350);
};

const handleFilterChange = () => {
  pushFiltersToRoute({
    quaHan: filters.quaHan ? 'true' : undefined,
    trangThaiPhat: filters.trangThaiPhat || undefined,
    tuNgay: filters.tuNgay || undefined,
    denNgay: filters.denNgay || undefined,
    page: 1,
  });
};

const handleResetFilters = () => {
  filters.trangThai = '';
  filters.maDocGia = '';
  filters.maSach = '';
  filters.quaHan = false;
  filters.trangThaiPhat = '';
  filters.tuNgay = '';
  filters.denNgay = '';
  filters.limit = 10;
  router.push({ query: {} });
};

const handlePageChange = (newPage) => {
  pushFiltersToRoute({ page: newPage });
};

// ==========================================
// QUẢN LÝ CÁC MODAL THAO TÁC NGHIỆP VỤ
// ==========================================

// 1. MODAL CHI TIẾT PHIẾU
const detailModalElement = ref(null);
let detailModalInstance = null;
const selectedBorrowing = ref(null);

const openDetailModal = (item) => {
  selectedBorrowing.value = item;
  if (detailModalInstance) {
    detailModalInstance.show();
  }
};

// 2. MODAL PHÊ DUYỆT (APPROVE)
const approveModalElement = ref(null);
let approveModalInstance = null;
const borrowingToApprove = ref(null);
const isApproving = ref(false);

const openApproveModal = (item) => {
  borrowingToApprove.value = item;
  if (approveModalInstance) {
    approveModalInstance.show();
  }
};

const handleConfirmApprove = async () => {
  if (!borrowingToApprove.value?._id) return;
  isApproving.value = true;
  try {
    await borrowingApi.approve(borrowingToApprove.value._id);
    approveModalInstance?.hide();
    alert.type = 'success';
    alert.message = `Đã phê duyệt thành công yêu cầu mượn cuốn sách "${borrowingToApprove.value.Sach?.TenSach || borrowingToApprove.value.MaSach}". Sách đã được giữ và trừ 1 quyển trong kho.`;
    await fetchBorrowings();
  } catch (error) {
    alert.type = 'danger';
    alert.message = getErrorMessage(error);
  } finally {
    isApproving.value = false;
  }
};

// 3. MODAL TỪ CHỐI (REJECT)
const rejectModalElement = ref(null);
let rejectModalInstance = null;
const borrowingToReject = ref(null);
const rejectReason = ref('');
const rejectError = ref('');
const isRejecting = ref(false);

const openRejectModal = (item) => {
  borrowingToReject.value = item;
  rejectReason.value = '';
  rejectError.value = '';
  if (rejectModalInstance) {
    rejectModalInstance.show();
  }
};

const handleConfirmReject = async () => {
  if (!borrowingToReject.value?._id) return;
  const reason = rejectReason.value.trim();
  if (!reason) {
    rejectError.value = 'Vui lòng nhập lý do từ chối yêu cầu mượn sách';
    return;
  }
  if (reason.length > 500) {
    rejectError.value = 'Lý do từ chối không được vượt quá 500 ký tự';
    return;
  }

  isRejecting.value = true;
  rejectError.value = '';
  try {
    await borrowingApi.reject(borrowingToReject.value._id, reason);
    rejectModalInstance?.hide();
    alert.type = 'success';
    alert.message = `Đã từ chối yêu cầu mượn cuốn sách "${borrowingToReject.value.Sach?.TenSach || borrowingToReject.value.MaSach}". Lý do đã được ghi nhận.`;
    await fetchBorrowings();
  } catch (error) {
    rejectError.value = getErrorMessage(error);
  } finally {
    isRejecting.value = false;
  }
};

// 4. MODAL GIAO SÁCH (HANDOVER)
const handoverModalElement = ref(null);
let handoverModalInstance = null;
const borrowingToHandover = ref(null);
const isHandovering = ref(false);

const openHandoverModal = (item) => {
  borrowingToHandover.value = item;
  if (handoverModalInstance) {
    handoverModalInstance.show();
  }
};

const handleConfirmHandover = async () => {
  if (!borrowingToHandover.value?._id) return;
  isHandovering.value = true;
  try {
    await borrowingApi.handover(borrowingToHandover.value._id);
    handoverModalInstance?.hide();
    alert.type = 'success';
    alert.message = `Đã giao sách "${borrowingToHandover.value.Sach?.TenSach || borrowingToHandover.value.MaSach}" cho độc giả thành công. Bắt đầu tính thời hạn mượn.`;
    await fetchBorrowings();
  } catch (error) {
    alert.type = 'danger';
    alert.message = getErrorMessage(error);
  } finally {
    isHandovering.value = false;
  }
};

// 5. MODAL NHẬN TRẢ SÁCH (RETURN)
const returnModalElement = ref(null);
let returnModalInstance = null;
const borrowingToReturn = ref(null);
const returnForm = reactive({
  tinhTrangTra: 'BinhThuong',
  mucRach: 'Nhe',
  loaiBoKhoiKho: false,
  ghiChuPhat: '',
});
const returnErrors = reactive({});
const isReturning = ref(false);

const openReturnModal = (item) => {
  borrowingToReturn.value = item;
  returnForm.tinhTrangTra = 'BinhThuong';
  returnForm.mucRach = 'Nhe';
  returnForm.loaiBoKhoiKho = false;
  returnForm.ghiChuPhat = '';
  Object.keys(returnErrors).forEach((k) => delete returnErrors[k]);

  if (returnModalInstance) {
    returnModalInstance.show();
  }
};

/**
 * Tính ước lượng trước số tiền phạt hiển thị trực quan cho thủ thư kiểm tra
 */
const estimatedFine = computed(() => {
  if (!borrowingToReturn.value) return { phiTre: 0, phatTinhTrang: 0, tongPhat: 0 };

  const donGia = borrowingToReturn.value.Sach?.DonGia || 0;
  const now = new Date();
  const hanTra = borrowingToReturn.value.HanTra ? new Date(borrowingToReturn.value.HanTra) : null;

  // 1. Phí trễ
  let phiTre = 0;
  if (hanTra && now > hanTra) {
    const diffMs = now.getTime() - hanTra.getTime();
    const soNgayTre = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    phiTre = Math.min(soNgayTre * 2000, donGia);
  }

  // 2. Phạt tình trạng
  let phatTinhTrang = 0;
  if (returnForm.tinhTrangTra === 'Rach') {
    const tyLe = 0.5; // TyLePhatRach mặc định
    const heSo = returnForm.mucRach === 'Nhe' ? 0.5 : 1.0;
    phatTinhTrang = Math.round(tyLe * donGia * heSo);
  } else if (returnForm.tinhTrangTra === 'Mat') {
    const tyLeMat = 1.0;
    const phiXuLy = 20000;
    phatTinhTrang = Math.round(tyLeMat * donGia) + phiXuLy;
  }

  return {
    phiTre,
    phatTinhTrang,
    tongPhat: phiTre + phatTinhTrang,
  };
});

const handleConfirmReturn = async () => {
  if (!borrowingToReturn.value?._id) return;
  Object.keys(returnErrors).forEach((k) => delete returnErrors[k]);

  // Client validation
  if (returnForm.tinhTrangTra === 'Rach' || returnForm.tinhTrangTra === 'Mat') {
    if (!returnForm.ghiChuPhat.trim()) {
      returnErrors.GhiChuPhat = 'Ghi chú phạt là bắt buộc khi sách bị rách hoặc mất';
      return;
    }
  }

  isReturning.value = true;
  try {
    const payload = {
      TinhTrangTra: returnForm.tinhTrangTra,
      GhiChuPhat: returnForm.ghiChuPhat.trim() || undefined,
    };

    if (returnForm.tinhTrangTra === 'Rach') {
      payload.MucRach = returnForm.mucRach;
      payload.LoaiBoKhoiKho = Boolean(returnForm.loaiBoKhoiKho);
    }

    const res = await borrowingApi.returnBook(borrowingToReturn.value._id, payload);
    returnModalInstance?.hide();

    const data = res.data?.data;
    const tienPhat = data?.chiTietPhat?.tienPhat || 0;
    if (tienPhat > 0) {
      alert.type = 'warning';
      alert.message = `Đã nhận trả sách thành công! Độc giả có khoản phạt ${formatCurrency(tienPhat)}. Trạng thái phạt là "Chưa thanh toán", vui lòng thu tiền tại quầy.`;
    } else {
      alert.type = 'success';
      alert.message = `Đã nhận trả sách "${borrowingToReturn.value.Sach?.TenSach || borrowingToReturn.value.MaSach}" thành công. Sách đã hoàn kho bình thường không bị phạt.`;
    }
    await fetchBorrowings();
  } catch (error) {
    const fieldErrs = getFieldErrors(error);
    if (Object.keys(fieldErrs).length > 0) {
      Object.assign(returnErrors, fieldErrs);
    } else {
      returnErrors.general = getErrorMessage(error);
    }
  } finally {
    isReturning.value = false;
  }
};

// 6. MODAL THU TIỀN PHẠT (PAY FINE)
const payFineModalElement = ref(null);
let payFineModalInstance = null;
const borrowingToPayFine = ref(null);
const isPayingFine = ref(false);

const openPayFineModal = (item) => {
  borrowingToPayFine.value = item;
  if (payFineModalInstance) {
    payFineModalInstance.show();
  }
};

const handleConfirmPayFine = async () => {
  if (!borrowingToPayFine.value?._id) return;
  isPayingFine.value = true;
  try {
    await borrowingApi.payFine(borrowingToPayFine.value._id);
    payFineModalInstance?.hide();
    alert.type = 'success';
    alert.message = `Đã xác nhận thu thành công khoản tiền phạt ${formatCurrency(borrowingToPayFine.value.TienPhat)} từ độc giả.`;
    await fetchBorrowings();
  } catch (error) {
    alert.type = 'danger';
    alert.message = getErrorMessage(error);
  } finally {
    isPayingFine.value = false;
  }
};

// 7. MODAL HỦY PHIẾU BỞI NHÂN VIÊN (CANCEL)
const cancelModalElement = ref(null);
let cancelModalInstance = null;
const borrowingToCancel = ref(null);
const cancelReason = ref('');
const isCancelling = ref(false);

const openCancelModal = (item) => {
  borrowingToCancel.value = item;
  cancelReason.value = '';
  if (cancelModalInstance) {
    cancelModalInstance.show();
  }
};

const handleConfirmCancel = async () => {
  if (!borrowingToCancel.value?._id) return;
  isCancelling.value = true;
  try {
    await borrowingApi.cancel(borrowingToCancel.value._id, cancelReason.value.trim());
    cancelModalInstance?.hide();
    alert.type = 'success';
    alert.message = `Đã hủy thành công phiếu mượn cuốn sách "${borrowingToCancel.value.Sach?.TenSach || borrowingToCancel.value.MaSach}". Sách đã được hoàn trả lại kho (nếu trước đó ở trạng thái Đã duyệt).`;
    await fetchBorrowings();
  } catch (error) {
    alert.type = 'danger';
    alert.message = getErrorMessage(error);
  } finally {
    isCancelling.value = false;
  }
};

// Theo dõi thay đổi URL query để nạp lại dữ liệu
watch(
  () => route.query,
  () => {
    syncFiltersFromRoute();
    fetchBorrowings();
  }
);

onMounted(() => {
  syncFiltersFromRoute();
  fetchBorrowings();

  if (detailModalElement.value) detailModalInstance = new Modal(detailModalElement.value);
  if (approveModalElement.value) approveModalInstance = new Modal(approveModalElement.value);
  if (rejectModalElement.value) rejectModalInstance = new Modal(rejectModalElement.value);
  if (handoverModalElement.value) handoverModalInstance = new Modal(handoverModalElement.value);
  if (returnModalElement.value) returnModalInstance = new Modal(returnModalElement.value);
  if (payFineModalElement.value) payFineModalInstance = new Modal(payFineModalElement.value);
  if (cancelModalElement.value) cancelModalInstance = new Modal(cancelModalElement.value);
});

onUnmounted(() => {
  if (currentAbortController) currentAbortController.abort();
  detailModalInstance?.dispose();
  approveModalInstance?.dispose();
  rejectModalInstance?.dispose();
  handoverModalInstance?.dispose();
  returnModalInstance?.dispose();
  payFineModalInstance?.dispose();
  cancelModalInstance?.dispose();
});
</script>

<template>
  <div class="borrowings-management-view">
    <!-- TIÊU ĐỀ TRANG -->
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
      <div>
        <h1 class="h3 fw-bold text-dark mb-1 d-flex align-items-center gap-2">
          <i class="bi bi-journal-bookmark text-primary"></i>
          <span>Quản lý Mượn Sách</span>
        </h1>
        <p class="text-secondary small mb-0">
          Theo dõi và xử lý quy trình mượn trả: Duyệt yêu cầu, giao sách, nhận trả sách, kiểm tra rách/mất và thu phạt.
        </p>
      </div>

      <div class="d-flex align-items-center gap-2">
        <button
          type="button"
          class="btn btn-outline-secondary btn-sm rounded-pill px-3 shadow-sm d-flex align-items-center gap-1"
          :disabled="isLoading"
          @click="fetchBorrowings"
        >
          <i class="bi bi-arrow-clockwise" :class="{ 'spin-icon': isLoading }"></i>
          <span>Làm mới</span>
        </button>
      </div>
    </div>

    <!-- THÔNG BÁO ALERT HỆ THỐNG -->
    <AppAlert
      v-if="alert.message"
      :type="alert.type"
      :message="alert.message"
      @close="alert.message = ''"
    />

    <!-- THANH TABS LỌC THEO TRẠNG THÁI -->
    <div class="card border-0 shadow-sm rounded-4 mb-3">
      <div class="card-body p-2 p-md-3">
        <div class="d-flex flex-wrap align-items-center gap-2">
          <button
            v-for="tab in statusTabs"
            :key="tab.value"
            type="button"
            class="btn btn-sm rounded-pill px-3 transition-all d-flex align-items-center gap-1"
            :class="filters.trangThai === tab.value ? 'btn-primary shadow-sm' : 'btn-light text-secondary'"
            @click="handleTabChange(tab.value)"
          >
            <i v-if="tab.icon" class="bi" :class="tab.icon"></i>
            <span>{{ tab.label }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- KHỐI BỘ LỌC NÂNG CAO -->
    <div class="card border-0 shadow-sm rounded-4 mb-4">
      <div class="card-body p-3">
        <div class="row g-3 align-items-end">
          <!-- Lọc theo Mã Độc Giả -->
          <div class="col-12 col-sm-6 col-md-3 col-lg-2">
            <label class="form-label small fw-medium text-secondary mb-1">Mã độc giả</label>
            <div class="input-group input-group-sm">
              <span class="input-group-text bg-light border-end-0 text-muted"><i class="bi bi-person"></i></span>
              <input
                type="text"
                class="form-control border-start-0"
                placeholder="VD: DG0001"
                v-model="filters.maDocGia"
                @input="handleInputDebounced"
              />
            </div>
          </div>

          <!-- Lọc theo Mã Sách -->
          <div class="col-12 col-sm-6 col-md-3 col-lg-2">
            <label class="form-label small fw-medium text-secondary mb-1">Mã sách</label>
            <div class="input-group input-group-sm">
              <span class="input-group-text bg-light border-end-0 text-muted"><i class="bi bi-book"></i></span>
              <input
                type="text"
                class="form-control border-start-0"
                placeholder="VD: S0001"
                v-model="filters.maSach"
                @input="handleInputDebounced"
              />
            </div>
          </div>

          <!-- Lọc theo Trạng Thái Phạt -->
          <div class="col-12 col-sm-6 col-md-3 col-lg-2">
            <label class="form-label small fw-medium text-secondary mb-1">Tình trạng phạt</label>
            <select
              class="form-select form-select-sm"
              v-model="filters.trangThaiPhat"
              @change="handleFilterChange"
            >
              <option value="">Tất cả</option>
              <option value="KhongPhat">Không phạt</option>
              <option value="ChuaThanhToan">Chưa nộp phạt</option>
              <option value="DaThanhToan">Đã nộp phạt</option>
            </select>
          </div>

          <!-- Lọc Từ ngày -->
          <div class="col-12 col-sm-6 col-md-3 col-lg-2">
            <label class="form-label small fw-medium text-secondary mb-1">Từ ngày</label>
            <input
              type="date"
              class="form-control form-control-sm"
              v-model="filters.tuNgay"
              @change="handleFilterChange"
            />
          </div>

          <!-- Lọc Đến ngày -->
          <div class="col-12 col-sm-6 col-md-3 col-lg-2">
            <label class="form-label small fw-medium text-secondary mb-1">Đến ngày</label>
            <input
              type="date"
              class="form-control form-control-sm"
              v-model="filters.denNgay"
              @change="handleFilterChange"
            />
          </div>

          <!-- Switch Quá Hạn & Đặt lại -->
          <div class="col-12 col-lg-2 d-flex align-items-center justify-content-between gap-2">
            <div class="form-check form-switch mb-0">
              <input
                class="form-check-input"
                type="checkbox"
                role="switch"
                id="overdueFilterSwitch"
                v-model="filters.quaHan"
                @change="handleFilterChange"
              />
              <label class="form-check-label small fw-medium text-danger" for="overdueFilterSwitch">
                Chỉ quá hạn
              </label>
            </div>

            <button
              type="button"
              class="btn btn-light btn-sm text-secondary rounded-pill px-3 shadow-none border"
              title="Đặt lại tất cả bộ lọc"
              @click="handleResetFilters"
            >
              <i class="bi bi-x-circle me-1"></i>Xóa lọc
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- TRẠNG THÁI ĐANG TẢI -->
    <LoadingSpinner v-if="isLoading" text="Đang tải danh sách phiếu mượn..." />

    <!-- DANH SÁCH TRỐNG -->
    <div v-else-if="borrowings.length === 0" class="card border-0 shadow-sm rounded-4 py-5 text-center">
      <EmptyState
        title="Không tìm thấy phiếu mượn nào"
        message="Không có bản ghi phiếu mượn nào phù hợp với điều kiện tìm kiếm hoặc bộ lọc hiện tại."
      >
        <template #action>
          <button
            type="button"
            class="btn btn-outline-primary btn-sm rounded-pill px-4 mt-2"
            @click="handleResetFilters"
          >
            <i class="bi bi-arrow-counterclockwise me-1"></i> Đặt lại bộ lọc
          </button>
        </template>
      </EmptyState>
    </div>

    <!-- BẢNG DỮ LIỆU CHÍNH -->
    <div v-else class="card border-0 shadow-sm rounded-4 overflow-hidden mb-4">
      <div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light text-secondary small text-uppercase">
            <tr>
              <th scope="col" style="width: 140px;" class="ps-3">Mã phiếu</th>
              <th scope="col" style="width: 220px;">Độc giả</th>
              <th scope="col" style="min-width: 250px;">Sách mượn</th>
              <th scope="col" style="width: 200px;">Các mốc thời gian</th>
              <th scope="col" style="width: 170px;">Trạng thái</th>
              <th scope="col" style="width: 160px;">Phạt / Tình trạng</th>
              <th scope="col" style="width: 160px;" class="text-end pe-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in borrowings" :key="item._id" class="transition-hover">
              <!-- Cột Mã phiếu & Ngày tạo -->
              <td class="ps-3 py-3">
                <div class="font-monospace fw-semibold text-dark small" :title="item._id">
                  #{{ item._id.slice(-6).toUpperCase() }}
                </div>
                <div class="text-muted small" style="font-size: 0.75rem;">
                  {{ formatDate(item.NgayDangKy || item.createdAt) }}
                </div>
              </td>

              <!-- Cột Độc giả -->
              <td class="py-3">
                <div class="fw-bold text-dark text-truncate" style="max-width: 200px;">
                  {{ item.DocGia?.HoLot ? `${item.DocGia.HoLot} ${item.DocGia.Ten}` : (item.DocGia?.Ten || '—') }}
                </div>
                <div class="small text-secondary font-monospace">
                  Mã: {{ item.MaDocGia }}
                </div>
                <div v-if="item.DocGia?.DienThoai" class="small text-muted" style="font-size: 0.75rem;">
                  <i class="bi bi-telephone me-1"></i>{{ item.DocGia.DienThoai }}
                </div>
              </td>

              <!-- Cột Sách -->
              <td class="py-3">
                <div class="d-flex align-items-center gap-2">
                  <img
                    v-if="getCoverUrl(item.Sach?.AnhBia)"
                    :src="getCoverUrl(item.Sach?.AnhBia)"
                    :alt="item.Sach?.TenSach || item.MaSach"
                    class="rounded-2 shadow-sm object-fit-cover flex-shrink-0"
                    style="width: 36px; height: 50px;"
                  />
                  <div
                    v-else
                    class="rounded-2 bg-light d-flex align-items-center justify-content-center text-muted flex-shrink-0"
                    style="width: 36px; height: 50px;"
                  >
                    <i class="bi bi-book opacity-50"></i>
                  </div>

                  <div class="text-truncate" style="max-width: 220px;">
                    <div class="fw-bold text-dark text-truncate" :title="item.Sach?.TenSach || item.MaSach">
                      {{ item.Sach?.TenSach || item.MaSach }}
                    </div>
                    <div class="small text-muted font-monospace" style="font-size: 0.75rem;">
                      Mã: {{ item.MaSach }}
                    </div>
                    <div class="small text-primary fw-medium" style="font-size: 0.75rem;">
                      {{ formatCurrency(item.Sach?.DonGia || 0) }}
                    </div>
                  </div>
                </div>
              </td>

              <!-- Cột Các mốc thời gian -->
              <td class="py-3">
                <div class="small">
                  <div>
                    <span class="text-muted">Đăng ký:</span>
                    <span class="fw-medium ms-1">{{ formatDate(item.NgayDangKy) }}</span>
                  </div>

                  <!-- Hạn nhận sách khi Đã duyệt -->
                  <div v-if="item.TrangThai === 'DaDuyet' && item.HanNhanSach" class="text-info-emphasis mt-1">
                    <i class="bi bi-calendar-event me-1"></i>
                    <span>Hạn nhận: <strong>{{ formatDate(item.HanNhanSach, true) }}</strong></span>
                  </div>

                  <!-- Ngày mượn & Hạn trả khi Đang mượn -->
                  <div v-if="item.TrangThai === 'DangMuon' && item.HanTra" class="mt-1" :class="item.isOverdue ? 'text-danger fw-bold' : 'text-primary'">
                    <i class="bi" :class="item.isOverdue ? 'bi-alarm-fill' : 'bi-calendar-check'"></i>
                    <span class="ms-1">Hạn trả: {{ formatDate(item.HanTra) }}</span>
                  </div>

                  <!-- Ngày trả thực tế khi Đã trả -->
                  <div v-if="item.TrangThai === 'DaTra' && item.NgayTra" class="text-success mt-1">
                    <i class="bi bi-check2-circle me-1"></i>
                    <span>Đã trả: {{ formatDate(item.NgayTra) }}</span>
                  </div>
                </div>
              </td>

              <!-- Cột Trạng thái & Quá hạn -->
              <td class="py-3">
                <StatusBadge
                  :status="item.TrangThai"
                  :is-overdue="item.isOverdue"
                  :so-ngay-tre="item.soNgayTre"
                  :fine-status="item.TrangThaiPhat"
                  :fine-amount="item.TienPhat"
                />
                <div v-if="item.TrangThai === 'TuChoi' && item.LyDoTuChoi" class="small text-danger mt-1 text-truncate" style="max-width: 160px;" :title="item.LyDoTuChoi">
                  <em>"{{ item.LyDoTuChoi }}"</em>
                </div>
              </td>

              <!-- Cột Phạt & Tình trạng trả -->
              <td class="py-3">
                <div v-if="item.TienPhat > 0" class="small">
                  <div class="fw-bold text-danger">
                    {{ formatCurrency(item.TienPhat) }}
                  </div>
                  <div class="small" :class="item.TrangThaiPhat === 'DaThanhToan' ? 'text-success' : 'text-danger fw-medium'">
                    {{ item.TrangThaiPhat === 'DaThanhToan' ? 'Đã thu phạt' : 'Chưa thu tiền' }}
                  </div>
                  <div v-if="item.TinhTrangTra && item.TinhTrangTra !== 'BinhThuong'" class="badge bg-light text-danger border mt-1">
                    {{ item.TinhTrangTra === 'Rach' ? 'Rách' : 'Mất sách' }}
                  </div>
                </div>
                <div v-else-if="item.TrangThai === 'DaTra'" class="small text-success">
                  <i class="bi bi-check me-1"></i>Bình thường
                </div>
                <div v-else class="text-muted small">
                  —
                </div>
              </td>

              <!-- Cột Thao tác nghiệp vụ -->
              <td class="py-3 pe-3 text-end">
                <div class="d-inline-flex align-items-center gap-1">
                  <!-- Xem chi tiết -->
                  <button
                    type="button"
                    class="btn btn-outline-secondary btn-sm p-1 rounded-circle"
                    style="width: 30px; height: 30px;"
                    title="Xem chi tiết phiếu mượn"
                    @click="openDetailModal(item)"
                  >
                    <i class="bi bi-eye"></i>
                  </button>

                  <!-- 1. Trạng thái ChoDuyet: Duyệt & Từ chối -->
                  <template v-if="item.TrangThai === 'ChoDuyet'">
                    <button
                      type="button"
                      class="btn btn-success btn-sm rounded-pill px-2 py-0 small"
                      title="Phê duyệt yêu cầu mượn"
                      @click="openApproveModal(item)"
                    >
                      <i class="bi bi-check-lg me-1"></i>Duyệt
                    </button>
                    <button
                      type="button"
                      class="btn btn-outline-danger btn-sm rounded-pill px-2 py-0 small"
                      title="Từ chối yêu cầu mượn"
                      @click="openRejectModal(item)"
                    >
                      <i class="bi bi-x-lg me-1"></i>Từ chối
                    </button>
                  </template>

                  <!-- 2. Trạng thái DaDuyet: Giao sách & Hủy -->
                  <template v-else-if="item.TrangThai === 'DaDuyet'">
                    <button
                      type="button"
                      class="btn btn-primary btn-sm rounded-pill px-2 py-0 small"
                      title="Giao sách cho độc giả"
                      @click="openHandoverModal(item)"
                    >
                      <i class="bi bi-box-arrow-up-right me-1"></i>Giao sách
                    </button>
                    <button
                      type="button"
                      class="btn btn-outline-secondary btn-sm rounded-pill px-2 py-0 small"
                      title="Hủy phiếu và hoàn kho"
                      @click="openCancelModal(item)"
                    >
                      <i class="bi bi-slash-circle me-1"></i>Hủy
                    </button>
                  </template>

                  <!-- 3. Trạng thái DangMuon: Nhận trả sách -->
                  <template v-else-if="item.TrangThai === 'DangMuon'">
                    <button
                      type="button"
                      class="btn btn-warning text-dark btn-sm rounded-pill px-2 py-0 small fw-medium"
                      title="Nhận trả sách và kiểm tra tình trạng"
                      @click="openReturnModal(item)"
                    >
                      <i class="bi bi-box-arrow-in-left me-1"></i>Nhận trả
                    </button>
                  </template>

                  <!-- 4. Trạng thái DaTra và còn nợ phạt: Nút Thu tiền phạt -->
                  <template v-else-if="item.TrangThai === 'DaTra' && item.TrangThaiPhat === 'ChuaThanhToan'">
                    <button
                      type="button"
                      class="btn btn-danger btn-sm rounded-pill px-2 py-0 small"
                      title="Xác nhận thu tiền phạt tại quầy"
                      @click="openPayFineModal(item)"
                    >
                      <i class="bi bi-cash-coin me-1"></i>Thu phạt
                    </button>
                  </template>

                  <!-- Cho phép Hủy khi ChoDuyet -->
                  <template v-else-if="item.TrangThai === 'ChoDuyet'">
                    <button
                      type="button"
                      class="btn btn-outline-secondary btn-sm rounded-pill px-2 py-0 small"
                      title="Hủy phiếu"
                      @click="openCancelModal(item)"
                    >
                      <i class="bi bi-slash-circle me-1"></i>Hủy
                    </button>
                  </template>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Phân trang -->
      <div v-if="meta.totalPages > 1" class="card-footer bg-white border-top p-3 d-flex justify-content-center">
        <AppPagination
          :current-page="meta.page"
          :total-pages="meta.totalPages"
          @change-page="handlePageChange"
        />
      </div>
    </div>

    <!-- ============================================================== -->
    <!-- MODAL 1: CHI TIẾT PHIẾU MƯỢN (DETAIL MODAL)                    -->
    <!-- ============================================================== -->
    <div ref="detailModalElement" class="modal fade" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content border-0 shadow-lg rounded-4">
          <div class="modal-header border-0 pb-0">
            <h5 class="modal-title fw-bold d-flex align-items-center gap-2">
              <i class="bi bi-file-earmark-text text-primary"></i>
              <span>Chi tiết phiếu mượn #{{ selectedBorrowing?._id?.slice(-6).toUpperCase() }}</span>
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button>
          </div>

          <div v-if="selectedBorrowing" class="modal-body py-3">
            <!-- Thẻ Độc Giả & Sách -->
            <div class="row g-3 mb-3">
              <!-- Cột Độc giả -->
              <div class="col-12 col-md-6">
                <div class="card bg-light border-0 rounded-4 p-3 h-100">
                  <div class="fw-bold text-dark mb-2 d-flex align-items-center gap-2">
                    <i class="bi bi-person-circle text-primary"></i>
                    <span>Thông tin độc giả</span>
                  </div>
                  <div class="small text-secondary">
                    <div><strong>Họ tên:</strong> {{ selectedBorrowing.DocGia?.HoLot }} {{ selectedBorrowing.DocGia?.Ten }}</div>
                    <div><strong>Mã độc giả:</strong> <span class="font-monospace text-dark">{{ selectedBorrowing.MaDocGia }}</span></div>
                    <div><strong>Email:</strong> {{ selectedBorrowing.DocGia?.Email || '—' }}</div>
                    <div><strong>Điện thoại:</strong> {{ selectedBorrowing.DocGia?.DienThoai || '—' }}</div>
                    <div v-if="selectedBorrowing.DocGia?.DiaChi"><strong>Địa chỉ:</strong> {{ selectedBorrowing.DocGia.DiaChi }}</div>
                  </div>
                </div>
              </div>

              <!-- Cột Sách -->
              <div class="col-12 col-md-6">
                <div class="card bg-light border-0 rounded-4 p-3 h-100">
                  <div class="fw-bold text-dark mb-2 d-flex align-items-center gap-2">
                    <i class="bi bi-book text-primary"></i>
                    <span>Thông tin sách mượn</span>
                  </div>
                  <div class="small text-secondary">
                    <div class="fw-bold text-dark">{{ selectedBorrowing.Sach?.TenSach || selectedBorrowing.MaSach }}</div>
                    <div><strong>Mã sách:</strong> <span class="font-monospace text-dark">{{ selectedBorrowing.MaSach }}</span></div>
                    <div><strong>Tác giả:</strong> {{ selectedBorrowing.Sach?.NguonGocTacGia || '—' }}</div>
                    <div><strong>Đơn giá sách:</strong> <span class="text-primary fw-semibold">{{ formatCurrency(selectedBorrowing.Sach?.DonGia) }}</span></div>
                    <div><strong>Tồn kho hiện tại:</strong> Còn {{ selectedBorrowing.Sach?.SoQuyenConLai }} / {{ selectedBorrowing.Sach?.SoQuyen }} cuốn</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Tiến trình xử lý & Nhân viên phụ trách -->
            <h6 class="fw-bold text-dark fs-6 mb-2 border-bottom pb-2">Tiến trình xử lý & Nhân viên</h6>
            <div class="row g-2 small mb-3">
              <div class="col-6 col-sm-4 text-muted">Trạng thái hiện tại:</div>
              <div class="col-6 col-sm-8">
                <StatusBadge
                  :status="selectedBorrowing.TrangThai"
                  :is-overdue="selectedBorrowing.isOverdue"
                  :so-ngay-tre="selectedBorrowing.soNgayTre"
                  :fine-status="selectedBorrowing.TrangThaiPhat"
                  :fine-amount="selectedBorrowing.TienPhat"
                />
              </div>

              <div class="col-6 col-sm-4 text-muted">Ngày đăng ký:</div>
              <div class="col-6 col-sm-8 fw-medium">{{ formatDate(selectedBorrowing.NgayDangKy, true) }}</div>

              <template v-if="selectedBorrowing.NgayDuyet">
                <div class="col-6 col-sm-4 text-muted">Xét duyệt:</div>
                <div class="col-6 col-sm-8">
                  <span class="fw-medium">{{ formatDate(selectedBorrowing.NgayDuyet, true) }}</span>
                  <span class="text-muted ms-2">(Bởi: <span class="font-monospace">{{ selectedBorrowing.MSNVDuyet || '—' }}</span>)</span>
                </div>
              </template>

              <template v-if="selectedBorrowing.HanNhanSach">
                <div class="col-6 col-sm-4 text-muted">Hạn đến nhận sách:</div>
                <div class="col-6 col-sm-8 fw-semibold text-info-emphasis">{{ formatDate(selectedBorrowing.HanNhanSach, true) }}</div>
              </template>

              <template v-if="selectedBorrowing.NgayMuon">
                <div class="col-6 col-sm-4 text-muted">Giao sách thực tế:</div>
                <div class="col-6 col-sm-8">
                  <span class="fw-medium">{{ formatDate(selectedBorrowing.NgayMuon, true) }}</span>
                  <span class="text-muted ms-2">(Bởi: <span class="font-monospace">{{ selectedBorrowing.MSNVGiao || '—' }}</span>)</span>
                </div>
              </template>

              <template v-if="selectedBorrowing.HanTra">
                <div class="col-6 col-sm-4 text-muted">Hạn trả sách:</div>
                <div class="col-6 col-sm-8 fw-bold" :class="selectedBorrowing.isOverdue ? 'text-danger' : 'text-primary'">
                  {{ formatDate(selectedBorrowing.HanTra, true) }}
                  <span v-if="selectedBorrowing.isOverdue" class="badge bg-danger ms-1">Trễ {{ selectedBorrowing.soNgayTre }} ngày</span>
                </div>
              </template>

              <template v-if="selectedBorrowing.NgayTra">
                <div class="col-6 col-sm-4 text-muted">Nhận trả sách:</div>
                <div class="col-6 col-sm-8">
                  <span class="fw-medium text-success">{{ formatDate(selectedBorrowing.NgayTra, true) }}</span>
                  <span class="text-muted ms-2">(Bởi: <span class="font-monospace">{{ selectedBorrowing.MSNVTra || '—' }}</span>)</span>
                </div>
              </template>

              <template v-if="selectedBorrowing.LyDoTuChoi">
                <div class="col-6 col-sm-4 text-muted">Lý do từ chối:</div>
                <div class="col-6 col-sm-8 text-danger fw-semibold">{{ selectedBorrowing.LyDoTuChoi }}</div>
              </template>
            </div>

            <!-- Biên bản trả sách & Xử lý phạt -->
            <template v-if="selectedBorrowing.TrangThai === 'DaTra' || selectedBorrowing.TienPhat > 0">
              <h6 class="fw-bold text-dark fs-6 mb-2 border-bottom pb-2">Biên bản nhận trả & Tiền phạt</h6>
              <div class="row g-2 small">
                <div class="col-6 col-sm-4 text-muted">Tình trạng sách khi trả:</div>
                <div class="col-6 col-sm-8 fw-medium">
                  {{ selectedBorrowing.TinhTrangTra === 'BinhThuong' ? 'Bình thường' : selectedBorrowing.TinhTrangTra === 'Rach' ? `Bị rách (${selectedBorrowing.MucRach === 'Nang' ? 'Nặng' : 'Nhẹ'})` : 'Báo mất sách' }}
                </div>

                <div v-if="selectedBorrowing.PhiTre > 0" class="col-6 col-sm-4 text-muted">Phí trễ hạn:</div>
                <div v-if="selectedBorrowing.PhiTre > 0" class="col-6 col-sm-8 fw-medium text-danger">{{ formatCurrency(selectedBorrowing.PhiTre) }}</div>

                <div class="col-6 col-sm-4 text-muted">Tổng tiền phạt:</div>
                <div class="col-6 col-sm-8 fw-bold fs-6" :class="selectedBorrowing.TienPhat > 0 ? 'text-danger' : 'text-success'">
                  {{ formatCurrency(selectedBorrowing.TienPhat) }}
                </div>

                <div v-if="selectedBorrowing.TienPhat > 0" class="col-6 col-sm-4 text-muted">Trạng thái thanh toán:</div>
                <div v-if="selectedBorrowing.TienPhat > 0" class="col-6 col-sm-8">
                  <span
                    class="badge rounded-pill px-2 py-1"
                    :class="selectedBorrowing.TrangThaiPhat === 'DaThanhToan' ? 'bg-success text-white' : 'bg-danger text-white'"
                  >
                    {{ selectedBorrowing.TrangThaiPhat === 'DaThanhToan' ? 'Đã thu tiền' : 'Chưa nộp tiền' }}
                  </span>
                  <span v-if="selectedBorrowing.MSNVThuPhat" class="text-muted ms-2">(Thu bởi: <span class="font-monospace">{{ selectedBorrowing.MSNVThuPhat }}</span>)</span>
                </div>

                <div v-if="selectedBorrowing.GhiChuPhat" class="col-6 col-sm-4 text-muted">Ghi chú phạt:</div>
                <div v-if="selectedBorrowing.GhiChuPhat" class="col-6 col-sm-8 text-secondary fst-italic">"{{ selectedBorrowing.GhiChuPhat }}"</div>
              </div>
            </template>
          </div>

          <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-secondary btn-sm rounded-pill px-4" data-bs-dismiss="modal">
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================================== -->
    <!-- MODAL 2: DUYỆT PHIẾU (APPROVE MODAL)                          -->
    <!-- ============================================================== -->
    <div ref="approveModalElement" class="modal fade" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow-lg rounded-4">
          <div class="modal-header border-0 pb-0">
            <h5 class="modal-title fw-bold text-success d-flex align-items-center gap-2">
              <i class="bi bi-check-circle-fill"></i>
              <span>Phê duyệt yêu cầu mượn</span>
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng" :disabled="isApproving"></button>
          </div>

          <div v-if="borrowingToApprove" class="modal-body py-3">
            <p class="mb-3">
              Bạn có chắc chắn muốn duyệt yêu cầu mượn sách này của độc giả <strong>{{ borrowingToApprove.DocGia?.Ten || borrowingToApprove.MaDocGia }}</strong>?
            </p>

            <div class="card bg-light border-0 rounded-3 p-3 mb-3">
              <div class="fw-bold text-dark">{{ borrowingToApprove.Sach?.TenSach || borrowingToApprove.MaSach }}</div>
              <div class="small text-secondary">Mã sách: <span class="font-monospace text-dark">{{ borrowingToApprove.MaSach }}</span></div>
              <div class="small text-secondary">Tồn kho hiện tại: <strong class="text-primary">{{ borrowingToApprove.Sach?.SoQuyenConLai }} cuốn</strong></div>
            </div>

            <div class="alert alert-info py-2 px-3 small mb-0 rounded-3">
              <i class="bi bi-info-circle me-1"></i>
              Khi duyệt, hệ thống sẽ trừ 1 cuốn trong kho (giữ sách). Độc giả sẽ có <strong>2 ngày</strong> để đến thư viện nhận sách.
            </div>
          </div>

          <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-light rounded-pill px-3" data-bs-dismiss="modal" :disabled="isApproving">
              Hủy bỏ
            </button>
            <button
              type="button"
              class="btn btn-success rounded-pill px-4 shadow-sm d-flex align-items-center gap-2"
              :disabled="isApproving"
              @click="handleConfirmApprove"
            >
              <span v-if="isApproving" class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
              <span>Xác nhận duyệt</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================================== -->
    <!-- MODAL 3: TỪ CHỐI PHIẾU (REJECT MODAL)                         -->
    <!-- ============================================================== -->
    <div ref="rejectModalElement" class="modal fade" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow-lg rounded-4">
          <div class="modal-header border-0 pb-0">
            <h5 class="modal-title fw-bold text-danger d-flex align-items-center gap-2">
              <i class="bi bi-x-circle-fill"></i>
              <span>Từ chối yêu cầu mượn</span>
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng" :disabled="isRejecting"></button>
          </div>

          <div v-if="borrowingToReject" class="modal-body py-3">
            <p class="mb-2">
              Từ chối yêu cầu mượn cuốn <strong>{{ borrowingToReject.Sach?.TenSach || borrowingToReject.MaSach }}</strong> của độc giả <strong>{{ borrowingToReject.DocGia?.Ten || borrowingToReject.MaDocGia }}</strong>.
            </p>

            <div class="mb-3">
              <label class="form-label small fw-bold text-dark">
                Lý do từ chối <span class="text-danger">*</span>
              </label>
              <textarea
                class="form-control"
                :class="{ 'is-invalid': rejectError }"
                rows="3"
                placeholder="Nhập lý do từ chối để thông báo cho độc giả (ví dụ: Sách đang bảo trì, thông tin độc giả cần xác minh lại...)"
                v-model="rejectReason"
                maxlength="500"
              ></textarea>
              <div v-if="rejectError" class="invalid-feedback">
                {{ rejectError }}
              </div>
              <div class="form-text text-end small">{{ rejectReason.length }} / 500 ký tự</div>
            </div>
          </div>

          <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-light rounded-pill px-3" data-bs-dismiss="modal" :disabled="isRejecting">
              Đóng
            </button>
            <button
              type="button"
              class="btn btn-danger rounded-pill px-4 shadow-sm d-flex align-items-center gap-2"
              :disabled="isRejecting"
              @click="handleConfirmReject"
            >
              <span v-if="isRejecting" class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
              <span>Xác nhận từ chối</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================================== -->
    <!-- MODAL 4: GIAO SÁCH CHO ĐỘC GIẢ (HANDOVER MODAL)               -->
    <!-- ============================================================== -->
    <div ref="handoverModalElement" class="modal fade" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow-lg rounded-4">
          <div class="modal-header border-0 pb-0">
            <h5 class="modal-title fw-bold text-primary d-flex align-items-center gap-2">
              <i class="bi bi-box-arrow-up-right"></i>
              <span>Xác nhận giao sách cho độc giả</span>
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng" :disabled="isHandovering"></button>
          </div>

          <div v-if="borrowingToHandover" class="modal-body py-3">
            <p class="mb-3">
              Xác nhận bàn giao cuốn sách <strong>{{ borrowingToHandover.Sach?.TenSach || borrowingToHandover.MaSach }}</strong> cho độc giả <strong>{{ borrowingToHandover.DocGia?.Ten || borrowingToHandover.MaDocGia }}</strong>.
            </p>

            <div class="alert alert-info py-2 px-3 small mb-0 rounded-3">
              <i class="bi bi-info-circle me-1"></i>
              Thời hạn mượn sẽ được tính bắt đầu từ hôm nay (14 ngày). Vui lòng kiểm tra thẻ độc giả và tình trạng sách vật lý trước khi giao.
            </div>
          </div>

          <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-light rounded-pill px-3" data-bs-dismiss="modal" :disabled="isHandovering">
              Hủy bỏ
            </button>
            <button
              type="button"
              class="btn btn-primary rounded-pill px-4 shadow-sm d-flex align-items-center gap-2"
              :disabled="isHandovering"
              @click="handleConfirmHandover"
            >
              <span v-if="isHandovering" class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
              <span>Xác nhận giao sách</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================================== -->
    <!-- MODAL 5: NHẬN TRẢ SÁCH & PHẠT (RETURN MODAL)                   -->
    <!-- ============================================================== -->
    <div ref="returnModalElement" class="modal fade" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content border-0 shadow-lg rounded-4">
          <div class="modal-header border-0 pb-0">
            <h5 class="modal-title fw-bold text-dark d-flex align-items-center gap-2">
              <i class="bi bi-box-arrow-in-left text-primary"></i>
              <span>Nhận trả sách & Kiểm tra tình trạng</span>
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng" :disabled="isReturning"></button>
          </div>

          <div v-if="borrowingToReturn" class="modal-body py-3">
            <!-- Thông tin tóm tắt phiếu -->
            <div class="card bg-light border-0 rounded-3 p-3 mb-3">
              <div class="row g-2 small">
                <div class="col-12 col-md-6">
                  <div><strong>Độc giả:</strong> {{ borrowingToReturn.DocGia?.HoLot }} {{ borrowingToReturn.DocGia?.Ten }} ({{ borrowingToReturn.MaDocGia }})</div>
                  <div><strong>Cuốn sách:</strong> {{ borrowingToReturn.Sach?.TenSach || borrowingToReturn.MaSach }}</div>
                </div>
                <div class="col-12 col-md-6">
                  <div><strong>Đơn giá sách:</strong> <span class="text-primary fw-bold">{{ formatCurrency(borrowingToReturn.Sach?.DonGia) }}</span></div>
                  <div>
                    <strong>Hạn trả:</strong> {{ formatDate(borrowingToReturn.HanTra) }}
                    <span v-if="borrowingToReturn.isOverdue" class="badge bg-danger ms-1">Quá hạn {{ borrowingToReturn.soNgayTre }} ngày</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Lỗi chung nếu có -->
            <div v-if="returnErrors.general" class="alert alert-danger py-2 px-3 small rounded-3 mb-3">
              <i class="bi bi-exclamation-triangle-fill me-1"></i>{{ returnErrors.general }}
            </div>

            <!-- Chọn Tình trạng sách khi trả -->
            <div class="mb-3">
              <label class="form-label small fw-bold text-dark mb-2">
                Tình trạng sách khi nhận lại <span class="text-danger">*</span>
              </label>

              <div class="d-flex flex-wrap gap-3">
                <div class="form-check">
                  <input
                    class="form-check-input"
                    type="radio"
                    name="returnCondition"
                    id="condNormal"
                    value="BinhThuong"
                    v-model="returnForm.tinhTrangTra"
                  />
                  <label class="form-check-label fw-medium text-dark" for="condNormal">
                    Bình thường (Nguyên vẹn)
                  </label>
                </div>

                <div class="form-check">
                  <input
                    class="form-check-input"
                    type="radio"
                    name="returnCondition"
                    id="condTorn"
                    value="Rach"
                    v-model="returnForm.tinhTrangTra"
                  />
                  <label class="form-check-label fw-medium text-warning-emphasis" for="condTorn">
                    Sách bị rách / hư hỏng
                  </label>
                </div>

                <div class="form-check">
                  <input
                    class="form-check-input"
                    type="radio"
                    name="returnCondition"
                    id="condLost"
                    value="Mat"
                    v-model="returnForm.tinhTrangTra"
                  />
                  <label class="form-check-label fw-medium text-danger" for="condLost">
                    Báo mất sách
                  </label>
                </div>
              </div>
            </div>

            <!-- Tùy chọn khi Sách bị rách -->
            <div v-if="returnForm.tinhTrangTra === 'Rach'" class="card border border-warning-subtle bg-warning-subtle rounded-3 p-3 mb-3">
              <div class="mb-2">
                <label class="form-label small fw-bold text-dark">Mức độ rách hư hỏng <span class="text-danger">*</span></label>
                <div class="d-flex gap-4">
                  <div class="form-check">
                    <input
                      class="form-check-input"
                      type="radio"
                      name="tearLevel"
                      id="tearMild"
                      value="Nhe"
                      v-model="returnForm.mucRach"
                    />
                    <label class="form-check-label small" for="tearMild">
                      Nhẹ (Phạt 25% đơn giá)
                    </label>
                  </div>
                  <div class="form-check">
                    <input
                      class="form-check-input"
                      type="radio"
                      name="tearLevel"
                      id="tearSevere"
                      value="Nang"
                      v-model="returnForm.mucRach"
                    />
                    <label class="form-check-label small" for="tearSevere">
                      Nặng (Phạt 50% đơn giá)
                    </label>
                  </div>
                </div>
              </div>

              <div class="form-check mt-2">
                <input
                  class="form-check-input"
                  type="checkbox"
                  id="discardBookCheck"
                  v-model="returnForm.loaiBoKhoiKho"
                />
                <label class="form-check-label small text-danger fw-semibold" for="discardBookCheck">
                  Sách hỏng hoàn toàn, không thể tái sử dụng (Loại bỏ khỏi kho, giảm 1 tổng số quyển)
                </label>
              </div>
            </div>

            <!-- Cảnh báo khi Báo mất sách -->
            <div v-if="returnForm.tinhTrangTra === 'Mat'" class="alert alert-danger py-2 px-3 small rounded-3 mb-3">
              <i class="bi bi-exclamation-octagon-fill me-1"></i>
              <strong>Quy định đền mất:</strong> Độc giả bồi thường 100% đơn giá sách + phí xử lý mất sách 20.000 ₫ + phí trễ hạn (nếu có). Cuốn sách này sẽ bị giảm vĩnh viễn khỏi kho thư viện.
            </div>

            <!-- Ô nhập Ghi chú phạt -->
            <div class="mb-3">
              <label class="form-label small fw-bold text-dark">
                Ghi chú phạt
                <span v-if="returnForm.tinhTrangTra !== 'BinhThuong'" class="text-danger">*</span>
              </label>
              <textarea
                class="form-control"
                :class="{ 'is-invalid': returnErrors.GhiChuPhat }"
                rows="2"
                :placeholder="returnForm.tinhTrangTra === 'BinhThuong' ? 'Ghi chú thêm nếu cần (tùy chọn)' : 'Mô tả chi tiết vị trí rách/hư hỏng hoặc biên bản mất sách...'"
                v-model="returnForm.ghiChuPhat"
                maxlength="500"
              ></textarea>
              <div v-if="returnErrors.GhiChuPhat" class="invalid-feedback">
                {{ returnErrors.GhiChuPhat }}
              </div>
            </div>

            <!-- BẢNG ƯỚC LƯỢNG TIỀN PHẠT THỜI GIAN THỰC -->
            <div class="card bg-light border-0 rounded-3 p-3">
              <div class="fw-bold text-dark small mb-2 d-flex align-items-center gap-1">
                <i class="bi bi-calculator text-primary"></i>
                <span>Chi tiết tiền phạt dự kiến tính tự động:</span>
              </div>
              <div class="d-flex justify-content-between small text-secondary mb-1">
                <span>Phí phạt trễ hạn (nếu có):</span>
                <span class="fw-semibold text-danger">{{ formatCurrency(estimatedFine.phiTre) }}</span>
              </div>
              <div class="d-flex justify-content-between small text-secondary mb-1">
                <span>Phạt tình trạng sách (rách/mất):</span>
                <span class="fw-semibold text-danger">{{ formatCurrency(estimatedFine.phatTinhTrang) }}</span>
              </div>
              <hr class="my-2" />
              <div class="d-flex justify-content-between align-items-baseline">
                <span class="fw-bold text-dark">TỔNG TIỀN PHẠT DỰ KIẾN:</span>
                <span class="fs-5 fw-bold" :class="estimatedFine.tongPhat > 0 ? 'text-danger' : 'text-success'">
                  {{ formatCurrency(estimatedFine.tongPhat) }}
                </span>
              </div>
            </div>
          </div>

          <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-light rounded-pill px-3" data-bs-dismiss="modal" :disabled="isReturning">
              Đóng
            </button>
            <button
              type="button"
              class="btn btn-warning rounded-pill px-4 shadow-sm fw-medium d-flex align-items-center gap-2"
              :disabled="isReturning"
              @click="handleConfirmReturn"
            >
              <span v-if="isReturning" class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
              <span>Xác nhận nhận trả sách</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================================== -->
    <!-- MODAL 6: THU TIỀN PHẠT TẠI QUẦY (PAY FINE MODAL)               -->
    <!-- ============================================================== -->
    <div ref="payFineModalElement" class="modal fade" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow-lg rounded-4">
          <div class="modal-header border-0 pb-0">
            <h5 class="modal-title fw-bold text-success d-flex align-items-center gap-2">
              <i class="bi bi-cash-coin"></i>
              <span>Xác nhận thu tiền phạt</span>
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng" :disabled="isPayingFine"></button>
          </div>

          <div v-if="borrowingToPayFine" class="modal-body py-3">
            <p class="mb-3">
              Xác nhận bạn đã thu đủ tiền mặt từ độc giả <strong>{{ borrowingToPayFine.DocGia?.Ten || borrowingToPayFine.MaDocGia }}</strong> cho phiếu mượn này:
            </p>

            <div class="card bg-danger-subtle border-danger-subtle rounded-3 p-3 text-center mb-3">
              <div class="small text-danger fw-medium">SỐ TIỀN CẦN THU</div>
              <div class="display-6 fw-bold text-danger my-1">
                {{ formatCurrency(borrowingToPayFine.TienPhat) }}
              </div>
              <div class="small text-secondary">
                Cuốn: {{ borrowingToPayFine.Sach?.TenSach || borrowingToPayFine.MaSach }}
              </div>
            </div>

            <div class="alert alert-info py-2 px-3 small mb-0 rounded-3">
              <i class="bi bi-info-circle me-1"></i>
              Sau khi xác nhận, trạng thái phạt sẽ chuyển thành <strong>Đã thanh toán</strong> và độc giả sẽ được xóa hạn chế mượn sách.
            </div>
          </div>

          <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-light rounded-pill px-3" data-bs-dismiss="modal" :disabled="isPayingFine">
              Hủy bỏ
            </button>
            <button
              type="button"
              class="btn btn-success rounded-pill px-4 shadow-sm d-flex align-items-center gap-2"
              :disabled="isPayingFine"
              @click="handleConfirmPayFine"
            >
              <span v-if="isPayingFine" class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
              <span>Xác nhận đã thu tiền</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================================== -->
    <!-- MODAL 7: HỦY PHIẾU BỞI NHÂN VIÊN (CANCEL MODAL)               -->
    <!-- ============================================================== -->
    <div ref="cancelModalElement" class="modal fade" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow-lg rounded-4">
          <div class="modal-header border-0 pb-0">
            <h5 class="modal-title fw-bold text-danger d-flex align-items-center gap-2">
              <i class="bi bi-slash-circle-fill"></i>
              <span>Hủy phiếu mượn</span>
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng" :disabled="isCancelling"></button>
          </div>

          <div v-if="borrowingToCancel" class="modal-body py-3">
            <p class="mb-2">
              Bạn có chắc chắn muốn hủy phiếu mượn cuốn <strong>{{ borrowingToCancel.Sach?.TenSach || borrowingToCancel.MaSach }}</strong> của độc giả <strong>{{ borrowingToCancel.DocGia?.Ten || borrowingToCancel.MaDocGia }}</strong>?
            </p>

            <div v-if="borrowingToCancel.TrangThai === 'DaDuyet'" class="alert alert-warning py-2 px-3 small rounded-3 mb-3">
              <i class="bi bi-exclamation-triangle-fill me-1"></i>
              Phiếu này đang ở trạng thái <strong>Đã duyệt</strong> (đã trừ kho). Khi hủy, hệ thống sẽ <strong>tự động hoàn trả 1 cuốn sách về kho</strong>.
            </div>

            <div class="mb-2">
              <label class="form-label small fw-medium text-secondary">Lý do hủy (tùy chọn, tối đa 300 ký tự)</label>
              <textarea
                class="form-control"
                rows="2"
                placeholder="Nhập lý do hủy phiếu..."
                v-model="cancelReason"
                maxlength="300"
              ></textarea>
            </div>
          </div>

          <div class="modal-footer border-0 pt-0">
            <button type="button" class="btn btn-light rounded-pill px-3" data-bs-dismiss="modal" :disabled="isCancelling">
              Giữ lại phiếu
            </button>
            <button
              type="button"
              class="btn btn-danger rounded-pill px-4 shadow-sm d-flex align-items-center gap-2"
              :disabled="isCancelling"
              @click="handleConfirmCancel"
            >
              <span v-if="isCancelling" class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
              <span>Xác nhận hủy phiếu</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  100% {
    transform: rotate(360deg);
  }
}

.transition-all {
  transition: all 0.2s ease;
}

.transition-hover:hover {
  background-color: rgba(var(--bs-primary-rgb), 0.03);
}
</style>
