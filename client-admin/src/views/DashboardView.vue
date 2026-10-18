<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import statsApi from '../api/stats.api.js';
import { getErrorMessage } from '../api/http.js';
import { formatCurrency } from '../utils/format.js';
import ServerHealthCheck from '../components/ServerHealthCheck.vue';
import BorrowChart from '../components/dashboard/BorrowChart.vue';
import FinesChart from '../components/dashboard/FinesChart.vue';
import OverdueTable from '../components/dashboard/OverdueTable.vue';
import TopRankings from '../components/dashboard/TopRankings.vue';

const router = useRouter();
const authStore = useAuthStore();

// Thông tin nhân viên & vai trò
const greetingName = computed(() => authStore.currentUser?.HoTenNV || 'Nhân viên');
const roleLabel = computed(() =>
  authStore.isAdmin ? 'Quản trị viên (Admin)' : 'Thủ thư (Staff)'
);

// Trạng thái tổng quan
const isLoadingOverview = ref(true);
const overviewError = ref('');
const overview = reactive({
  sach: {
    tongDauSach: 0,
    tongSoQuyen: 0,
    tongConLai: 0,
    soSachHetHang: 0,
  },
  docGia: {
    tong: 0,
    hoatDong: 0,
    biKhoa: 0,
  },
  phieuTheoTrangThai: {
    ChoDuyet: 0,
    DaDuyet: 0,
    DangMuon: 0,
    DaTra: 0,
    TuChoi: 0,
    DaHuy: 0,
  },
  soQuaHan: 0,
  tongPhatChuaThu: 0,
  soPhieuChuaThuPhat: 0,
});

// Template refs cho các component con để làm mới dữ liệu đồng bộ
const borrowChartRef = ref(null);
const finesChartRef = ref(null);
const overdueTableRef = ref(null);
const topRankingsRef = ref(null);
const isRefreshingAll = ref(false);

/**
 * Tải số liệu thống kê tổng quan từ GET /api/admin/stats/overview
 */
const fetchOverview = async () => {
  isLoadingOverview.value = true;
  overviewError.value = '';

  try {
    const res = await statsApi.getOverview();
    const data = res.data?.data;

    if (data) {
      if (data.sach) Object.assign(overview.sach, data.sach);
      if (data.docGia) Object.assign(overview.docGia, data.docGia);
      if (data.phieuTheoTrangThai) Object.assign(overview.phieuTheoTrangThai, data.phieuTheoTrangThai);
      overview.soQuaHan = data.soQuaHan ?? 0;
      overview.tongPhatChuaThu = data.tongPhatChuaThu ?? 0;
      overview.soPhieuChuaThuPhat = data.soPhieuChuaThuPhat ?? 0;
    }
  } catch (err) {
    overviewError.value = getErrorMessage(err);
  } finally {
    isLoadingOverview.value = false;
  }
};

/**
 * Nút "Làm mới tất cả": cập nhật đồng thời overview, 2 biểu đồ, bảng quá hạn và bảng xếp hạng
 */
const refreshAll = async () => {
  isRefreshingAll.value = true;
  try {
    await Promise.allSettled([
      fetchOverview(),
      borrowChartRef.value?.refresh?.(),
      finesChartRef.value?.refresh?.(),
      overdueTableRef.value?.refresh?.(),
      topRankingsRef.value?.refresh?.(),
    ]);
  } finally {
    isRefreshingAll.value = false;
  }
};

/**
 * Điều hướng nhanh đến trang Mượn sách với bộ lọc trạng thái
 * @param {string} trangThai
 */
const navigateToBorrowingsStatus = (trangThai) => {
  router.push({
    path: '/borrowings',
    query: { trangThai },
  });
};

/**
 * Điều hướng nhanh đến danh sách quá hạn
 */
const navigateToOverdue = () => {
  router.push({
    path: '/borrowings',
    query: {
      trangThai: 'DangMuon',
      quaHan: 'true',
    },
  });
};

onMounted(() => {
  fetchOverview();
});
</script>

<template>
  <div>
    <!-- Banner chào mừng người dùng & Thanh thao tác nhanh -->
    <div class="card shadow-sm border-0 rounded-4 bg-primary text-white mb-4 overflow-hidden">
      <div class="card-body p-4 p-md-5 position-relative">
        <div class="row align-items-center">
          <div class="col-lg-8">
            <span class="badge bg-white text-primary mb-2 px-3 py-1 fw-bold text-uppercase" style="font-size: 0.75rem;">
              {{ roleLabel }}
            </span>
            <h1 class="h3 fw-bold mb-2">
              Xin chào, {{ greetingName }}!
            </h1>
            <p class="mb-0 text-white-50">
              Bảng điều khiển trung tâm theo dõi hoạt động mượn trả, tình trạng kho sách và dòng tiền phạt của thư viện.
            </p>
          </div>
          <div class="col-lg-4 text-lg-end mt-3 mt-lg-0">
            <button
              type="button"
              class="btn btn-light text-primary fw-bold px-3 py-2 rounded-3 shadow-sm d-inline-flex align-items-center gap-2"
              :disabled="isRefreshingAll"
              @click="refreshAll"
            >
              <i class="bi bi-arrow-clockwise fs-6" :class="{ 'spin-anim': isRefreshingAll }"></i>
              <span>Làm mới số liệu</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Thông báo lỗi overview nếu có -->
    <div v-if="overviewError" class="alert alert-danger shadow-sm rounded-3 mb-4" role="alert">
      <div class="d-flex align-items-center justify-content-between">
        <div>
          <i class="bi bi-exclamation-octagon-fill me-2 fs-5"></i>
          <span>Lỗi khi tải số liệu tổng quan: {{ overviewError }}</span>
        </div>
        <button type="button" class="btn btn-sm btn-outline-danger" @click="fetchOverview">
          Thử lại
        </button>
      </div>
    </div>

    <!-- HÀNG 1: 4 THẺ SỐ LIỆU CHÍNH (Kho sách, Hết hàng, Độc giả, Tiền phạt) -->
    <div class="row g-3 mb-4">
      <!-- 1. Tổng đầu sách -->
      <div class="col-sm-6 col-xl-3">
        <div class="card shadow-sm border-0 h-100 rounded-4 overflow-hidden metric-card">
          <div class="card-body p-4 d-flex align-items-center gap-3">
            <div class="p-3 bg-primary bg-opacity-10 text-primary rounded-4 flex-shrink-0">
              <i class="bi bi-book-fill fs-2"></i>
            </div>
            <div class="flex-grow-1 min-w-0">
              <div class="text-muted small fw-medium text-uppercase">Đầu sách trong kho</div>
              <div class="fs-3 fw-bold text-dark mt-1">
                <span v-if="isLoadingOverview" class="placeholder col-6"></span>
                <span v-else>{{ overview.sach.tongDauSach.toLocaleString('vi-VN') }}</span>
              </div>
              <div class="small text-muted text-truncate mt-1">
                <span class="fw-semibold text-primary">{{ overview.sach.tongSoQuyen }}</span> quyển
                <span class="mx-1">•</span>
                còn lại <span class="fw-semibold text-success">{{ overview.sach.tongConLai }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. Sách hết hàng -->
      <div class="col-sm-6 col-xl-3">
        <div class="card shadow-sm border-0 h-100 rounded-4 overflow-hidden metric-card">
          <div class="card-body p-4 d-flex align-items-center gap-3">
            <div
              class="p-3 rounded-4 flex-shrink-0"
              :class="overview.sach.soSachHetHang > 0 ? 'bg-danger bg-opacity-10 text-danger' : 'bg-success bg-opacity-10 text-success'"
            >
              <i class="bi fs-2" :class="overview.sach.soSachHetHang > 0 ? 'bi-box-seam-fill' : 'bi-check-circle-fill'"></i>
            </div>
            <div class="flex-grow-1 min-w-0">
              <div class="text-muted small fw-medium text-uppercase">Đầu sách hết hàng</div>
              <div class="fs-3 fw-bold mt-1" :class="overview.sach.soSachHetHang > 0 ? 'text-danger' : 'text-success'">
                <span v-if="isLoadingOverview" class="placeholder col-6"></span>
                <span v-else>{{ overview.sach.soSachHetHang.toLocaleString('vi-VN') }}</span>
              </div>
              <div class="small text-muted text-truncate mt-1">
                <span v-if="overview.sach.soSachHetHang > 0" class="text-danger fw-medium">
                  Cần bổ sung thêm sách
                </span>
                <span v-else class="text-success fw-medium">
                  Kho đáp ứng tốt nhu cầu
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 3. Độc giả đăng ký -->
      <div class="col-sm-6 col-xl-3">
        <div class="card shadow-sm border-0 h-100 rounded-4 overflow-hidden metric-card">
          <div class="card-body p-4 d-flex align-items-center gap-3">
            <div class="p-3 bg-info bg-opacity-10 text-info rounded-4 flex-shrink-0">
              <i class="bi bi-people-fill fs-2 text-info"></i>
            </div>
            <div class="flex-grow-1 min-w-0">
              <div class="text-muted small fw-medium text-uppercase">Độc giả đăng ký</div>
              <div class="fs-3 fw-bold text-dark mt-1">
                <span v-if="isLoadingOverview" class="placeholder col-6"></span>
                <span v-else>{{ overview.docGia.tong.toLocaleString('vi-VN') }}</span>
              </div>
              <div class="small text-muted text-truncate mt-1">
                <span class="text-success fw-semibold">{{ overview.docGia.hoatDong }}</span> hoạt động
                <span class="mx-1">•</span>
                <span class="text-danger fw-semibold">{{ overview.docGia.biKhoa }}</span> bị khóa
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 4. Tiền phạt chưa thu -->
      <div class="col-sm-6 col-xl-3">
        <div class="card shadow-sm border-0 h-100 rounded-4 overflow-hidden metric-card">
          <div class="card-body p-4 d-flex align-items-center gap-3">
            <div class="p-3 bg-warning bg-opacity-10 text-warning rounded-4 flex-shrink-0">
              <i class="bi bi-cash-coin fs-2 text-warning"></i>
            </div>
            <div class="flex-grow-1 min-w-0">
              <div class="text-muted small fw-medium text-uppercase">Phạt chưa thu tại quầy</div>
              <div class="fs-3 fw-bold text-dark mt-1">
                <span v-if="isLoadingOverview" class="placeholder col-6"></span>
                <span v-else>{{ formatCurrency(overview.tongPhatChuaThu) }}</span>
              </div>
              <div class="small text-muted text-truncate mt-1">
                <span class="text-danger fw-semibold">{{ overview.soPhieuChuaThuPhat }}</span> phiếu chưa thanh toán
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- HÀNG 2: THANH THEO DÕI TRẠNG THÁI PHIẾU MƯỢN & CẢNH BÁO QUÁ HẠN -->
    <div class="card shadow-sm border-0 rounded-4 mb-4">
      <div class="card-body p-4">
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <h6 class="fw-bold text-dark mb-0 d-flex align-items-center gap-2">
            <i class="bi bi-diagram-3-fill text-primary"></i>
            <span>Tình Trạng Phiếu Mượn Hệ Thống</span>
          </h6>
          <span class="text-muted small">
            Nhấn vào trạng thái để lọc nhanh trong danh sách mượn
          </span>
        </div>

        <div class="row g-2">
          <!-- Chờ duyệt -->
          <div class="col-6 col-md-4 col-xl-2">
            <div
              class="p-3 rounded-3 bg-warning-subtle text-warning-emphasis border border-warning-subtle cursor-pointer transition-hover text-center"
              @click="navigateToBorrowingsStatus('ChoDuyet')"
            >
              <div class="small text-uppercase fw-semibold">Chờ duyệt</div>
              <div class="fs-4 fw-bold mt-1">{{ overview.phieuTheoTrangThai.ChoDuyet }}</div>
              <div class="small text-muted">yêu cầu mới</div>
            </div>
          </div>

          <!-- Đã duyệt -->
          <div class="col-6 col-md-4 col-xl-2">
            <div
              class="p-3 rounded-3 bg-info-subtle text-info-emphasis border border-info-subtle cursor-pointer transition-hover text-center"
              @click="navigateToBorrowingsStatus('DaDuyet')"
            >
              <div class="small text-uppercase fw-semibold">Đã duyệt</div>
              <div class="fs-4 fw-bold mt-1">{{ overview.phieuTheoTrangThai.DaDuyet }}</div>
              <div class="small text-muted">chờ lấy sách</div>
            </div>
          </div>

          <!-- Đang mượn -->
          <div class="col-6 col-md-4 col-xl-2">
            <div
              class="p-3 rounded-3 bg-primary-subtle text-primary-emphasis border border-primary-subtle cursor-pointer transition-hover text-center"
              @click="navigateToBorrowingsStatus('DangMuon')"
            >
              <div class="small text-uppercase fw-semibold">Đang mượn</div>
              <div class="fs-4 fw-bold mt-1">{{ overview.phieuTheoTrangThai.DangMuon }}</div>
              <div class="small text-muted">đã giao sách</div>
            </div>
          </div>

          <!-- Đã trả -->
          <div class="col-6 col-md-4 col-xl-2">
            <div
              class="p-3 rounded-3 bg-success-subtle text-success-emphasis border border-success-subtle cursor-pointer transition-hover text-center"
              @click="navigateToBorrowingsStatus('DaTra')"
            >
              <div class="small text-uppercase fw-semibold">Đã trả</div>
              <div class="fs-4 fw-bold mt-1">{{ overview.phieuTheoTrangThai.DaTra }}</div>
              <div class="small text-muted">đã hoàn thành</div>
            </div>
          </div>

          <!-- Bị từ chối -->
          <div class="col-6 col-md-4 col-xl-2">
            <div
              class="p-3 rounded-3 bg-danger-subtle text-danger-emphasis border border-danger-subtle cursor-pointer transition-hover text-center"
              @click="navigateToBorrowingsStatus('TuChoi')"
            >
              <div class="small text-uppercase fw-semibold">Bị từ chối</div>
              <div class="fs-4 fw-bold mt-1">{{ overview.phieuTheoTrangThai.TuChoi }}</div>
              <div class="small text-muted">thủ thư từ chối</div>
            </div>
          </div>

          <!-- Quá hạn (Cảnh báo đặc biệt) -->
          <div class="col-6 col-md-4 col-xl-2">
            <div
              class="p-3 rounded-3 border text-center cursor-pointer transition-hover position-relative"
              :class="overview.soQuaHan > 0 ? 'bg-danger text-white border-danger animate-pulse-border' : 'bg-light text-muted border-secondary-subtle'"
              @click="navigateToOverdue"
            >
              <div class="small text-uppercase fw-bold">
                <i class="bi bi-exclamation-triangle-fill me-1"></i>
                Quá hạn
              </div>
              <div class="fs-4 fw-bold mt-1">{{ overview.soQuaHan }}</div>
              <div class="small opacity-75">cần thu hồi ngay</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- HÀNG 3: BIỂU ĐỒ CHART.JS (Mượn sách 12 tháng + Tiền phạt 12 tháng) -->
    <div class="row g-4 mb-4">
      <div class="col-xl-6">
        <BorrowChart ref="borrowChartRef" />
      </div>
      <div class="col-xl-6">
        <FinesChart ref="finesChartRef" />
      </div>
    </div>

    <!-- HÀNG 4: BẢNG DANH SÁCH PHIẾU QUÁ HẠN -->
    <div class="mb-4">
      <OverdueTable ref="overdueTableRef" />
    </div>

    <!-- HÀNG 5: BẢNG XẾP HẠNG TOP SÁCH & TOP ĐỘC GIẢ -->
    <div class="mb-4">
      <TopRankings ref="topRankingsRef" />
    </div>

    <!-- Cuối trang: Kiểm tra kết nối máy chủ -->
    <div class="mt-4 pt-3 border-top">
      <ServerHealthCheck />
    </div>
  </div>
</template>

<style scoped>
.metric-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.metric-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.08) !important;
}

.cursor-pointer {
  cursor: pointer;
}

.transition-hover {
  transition: transform 0.15s ease, filter 0.15s ease;
}

.transition-hover:hover {
  transform: translateY(-2px);
  filter: brightness(0.96);
}

.spin-anim {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  100% {
    transform: rotate(360deg);
  }
}

@keyframes pulseBorder {
  0% {
    box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.6);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(220, 53, 69, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(220, 53, 69, 0);
  }
}

.animate-pulse-border {
  animation: pulseBorder 2s infinite ease-in-out;
}
</style>
