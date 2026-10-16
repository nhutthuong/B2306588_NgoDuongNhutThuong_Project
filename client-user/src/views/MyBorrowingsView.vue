<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { Modal } from 'bootstrap';
import borrowingApi from '../api/borrowing.api.js';
import { getErrorMessage } from '../api/http.js';
import { formatCurrency, formatDate, getCoverUrl } from '../utils/format.js';
import StatusBadge from '../components/StatusBadge.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import AppPagination from '../components/AppPagination.vue';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import EmptyState from '../components/EmptyState.vue';

const route = useRoute();
const router = useRouter();

const borrowings = ref([]);
const summary = ref(null);
const meta = ref({
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 1,
});

const isLoading = ref(true);
const isSummaryLoading = ref(true);
const errorMessage = ref('');
const cancelSuccessMessage = ref('');

// Bộ lọc trạng thái
const selectedStatus = computed(() => {
  return typeof route.query.trangThai === 'string' ? route.query.trangThai : '';
});

const currentPage = computed(() => {
  const p = parseInt(route.query.page, 10);
  return !isNaN(p) && p >= 1 ? p : 1;
});

// Quản lý Modal hủy phiếu
const cancelModalRef = ref(null);
const borrowingToCancel = ref(null);
const isCancelling = ref(false);

// Quản lý Modal xem chi tiết phiếu
const detailModalElement = ref(null);
let detailModalInstance = null;
const selectedBorrowing = ref(null);

const statusTabs = [
  { value: '', label: 'Tất cả' },
  { value: 'ChoDuyet', label: 'Chờ duyệt' },
  { value: 'DaDuyet', label: 'Đã duyệt' },
  { value: 'DangMuon', label: 'Đang mượn' },
  { value: 'DaTra', label: 'Đã trả' },
  { value: 'TuChoi', label: 'Bị từ chối' },
  { value: 'DaHuy', label: 'Đã hủy' },
];

/**
 * Tải tóm tắt tình trạng mượn sách
 */
const fetchSummary = async () => {
  isSummaryLoading.value = true;
  try {
    const res = await borrowingApi.getSummary();
    summary.value = res.data?.data || null;
  } catch (err) {
    console.error('Lỗi khi tải tóm tắt mượn sách:', err);
  } finally {
    isSummaryLoading.value = false;
  }
};

/**
 * Tải danh sách phiếu mượn của độc giả
 */
const fetchBorrowings = async () => {
  isLoading.value = true;
  errorMessage.value = '';

  try {
    const params = {
      page: currentPage.value,
      limit: 10,
    };
    if (selectedStatus.value) {
      params.trangThai = selectedStatus.value;
    }

    const res = await borrowingApi.list(params);
    borrowings.value = res.data?.data || [];
    meta.value = res.data?.meta || {
      page: currentPage.value,
      limit: 10,
      total: borrowings.value.length,
      totalPages: 1,
    };
  } catch (err) {
    errorMessage.value = getErrorMessage(err);
  } finally {
    isLoading.value = false;
  }
};

const handleStatusChange = (status) => {
  cancelSuccessMessage.value = '';
  router.push({
    query: {
      ...route.query,
      trangThai: status || undefined,
      page: 1,
    },
  });
};

const handlePageChange = (newPage) => {
  router.push({
    query: {
      ...route.query,
      page: newPage,
    },
  });
};

// Mở modal xác nhận hủy phiếu
const openCancelModal = (item) => {
  cancelSuccessMessage.value = '';
  borrowingToCancel.value = item;
  if (cancelModalRef.value) {
    cancelModalRef.value.show();
  }
};

// Thực hiện hủy phiếu
const confirmCancelBorrowing = async () => {
  if (!borrowingToCancel.value?._id) return;

  isCancelling.value = true;
  try {
    await borrowingApi.cancel(borrowingToCancel.value._id);
    cancelSuccessMessage.value = `Đã hủy thành công phiếu mượn cuốn sách "${borrowingToCancel.value.Sach?.TenSach || borrowingToCancel.value.MaSach}". Sách đã được hoàn kho cho độc giả khác.`;
    if (cancelModalRef.value) {
      cancelModalRef.value.hide();
    }
    // Cập nhật lại danh sách và tóm tắt
    await Promise.all([fetchBorrowings(), fetchSummary()]);
  } catch (err) {
    errorMessage.value = getErrorMessage(err);
    if (cancelModalRef.value) {
      cancelModalRef.value.hide();
    }
  } finally {
    isCancelling.value = false;
  }
};

// Xem chi tiết phiếu mượn
const openDetailModal = (item) => {
  selectedBorrowing.value = item;
  if (detailModalInstance) {
    detailModalInstance.show();
  }
};

watch(
  () => [route.query.trangThai, route.query.page],
  () => {
    fetchBorrowings();
  }
);

onMounted(() => {
  fetchSummary();
  fetchBorrowings();

  if (detailModalElement.value) {
    detailModalInstance = new Modal(detailModalElement.value);
  }
});
</script>

<template>
  <div class="my-borrowings-view py-3">
    <!-- Tiêu đề trang -->
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
      <div>
        <h1 class="h3 fw-bold text-dark mb-1 d-flex align-items-center gap-2">
          <i class="bi bi-journal-bookmark-fill text-primary"></i>
          <span>Lịch sử mượn sách</span>
        </h1>
        <p class="text-secondary small mb-0">
          Theo dõi tiến trình xét duyệt, hạn nhận sách, thời hạn mượn và tình trạng xử lý các phiếu mượn của bạn.
        </p>
      </div>

      <RouterLink to="/" class="btn btn-outline-primary btn-sm rounded-pill px-3 shadow-sm">
        <i class="bi bi-search me-1"></i> Khám phá thêm sách
      </RouterLink>
    </div>

    <!-- Thông báo thao tác thành công -->
    <div
      v-if="cancelSuccessMessage"
      class="alert alert-success alert-dismissible fade show rounded-4 shadow-sm mb-4"
      role="alert"
    >
      <div class="d-flex align-items-center gap-2">
        <i class="bi bi-check-circle-fill fs-5 text-success"></i>
        <div class="flex-grow-1 small">{{ cancelSuccessMessage }}</div>
        <button
          type="button"
          class="btn-close py-2"
          @click="cancelSuccessMessage = ''"
          aria-label="Đóng"
        ></button>
      </div>
    </div>

    <!-- Thông báo lỗi nếu có -->
    <div
      v-if="errorMessage"
      class="alert alert-danger alert-dismissible fade show rounded-4 shadow-sm mb-4"
      role="alert"
    >
      <div class="d-flex align-items-center gap-2">
        <i class="bi bi-exclamation-triangle-fill fs-5 text-danger"></i>
        <div class="flex-grow-1 small">{{ errorMessage }}</div>
        <button
          type="button"
          class="btn-close py-2"
          @click="errorMessage = ''"
          aria-label="Đóng"
        ></button>
      </div>
    </div>

    <!-- 4 THẺ THỐNG KÊ TÓM TẮT TÌNH TRẠNG MƯỢN SÁCH -->
    <div class="row g-3 mb-4">
      <!-- Thẻ 1: Đang chiếm chỗ -->
      <div class="col-12 col-sm-6 col-lg-3">
        <div class="card border-0 shadow-sm rounded-4 h-100 p-3 bg-white summary-card">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <span class="small text-secondary fw-medium">Đang giữ chỗ</span>
            <span class="badge bg-primary-subtle text-primary rounded-pill px-2 py-1 small">
              Tối đa {{ summary?.toiDa || 5 }}
            </span>
          </div>
          <div class="d-flex align-items-baseline gap-2">
            <h3 class="fw-bold mb-0 text-dark">
              {{ summary?.dangChiemCho || 0 }}
            </h3>
            <span class="text-muted small">/ {{ summary?.toiDa || 5 }} cuốn</span>
          </div>
          <div class="progress mt-2" style="height: 6px;">
            <div
              class="progress-bar bg-primary"
              role="progressbar"
              :style="{ width: `${Math.min(100, ((summary?.dangChiemCho || 0) / (summary?.toiDa || 5)) * 100)}%` }"
              aria-valuenow="20"
              aria-valuemin="0"
              aria-valuemax="100"
            ></div>
          </div>
          <div class="small text-muted mt-2" style="font-size: 0.75rem;">
            Bao gồm Chờ duyệt, Đã duyệt và Đang mượn
          </div>
        </div>
      </div>

      <!-- Thẻ 2: Còn được mượn thêm -->
      <div class="col-12 col-sm-6 col-lg-3">
        <div class="card border-0 shadow-sm rounded-4 h-100 p-3 bg-white summary-card">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <span class="small text-secondary fw-medium">Còn được mượn</span>
            <i class="bi bi-book text-success fs-5"></i>
          </div>
          <div class="d-flex align-items-baseline gap-2">
            <h3
              class="fw-bold mb-0"
              :class="(summary?.conDuocMuon || 0) > 0 ? 'text-success' : 'text-danger'"
            >
              {{ summary?.conDuocMuon || 0 }}
            </h3>
            <span class="text-muted small">cuốn sách</span>
          </div>
          <div class="small mt-2" :class="(summary?.conDuocMuon || 0) > 0 ? 'text-success' : 'text-danger'" style="font-size: 0.75rem;">
            <i class="bi" :class="(summary?.conDuocMuon || 0) > 0 ? 'bi-check-circle' : 'bi-exclamation-circle'"></i>
            <span>{{ (summary?.conDuocMuon || 0) > 0 ? 'Hạn mức khả dụng để đăng ký' : 'Đã đạt hạn mức tối đa' }}</span>
          </div>
        </div>
      </div>

      <!-- Thẻ 3: Tình trạng quá hạn -->
      <div class="col-12 col-sm-6 col-lg-3">
        <div
          class="card border-0 shadow-sm rounded-4 h-100 p-3 summary-card"
          :class="summary?.coQuaHan ? 'bg-danger-subtle border border-danger-subtle' : 'bg-white'"
        >
          <div class="d-flex align-items-center justify-content-between mb-2">
            <span class="small fw-medium" :class="summary?.coQuaHan ? 'text-danger' : 'text-secondary'">
              Sách quá hạn
            </span>
            <i
              class="bi fs-5"
              :class="summary?.coQuaHan ? 'bi-exclamation-triangle-fill text-danger' : 'bi-shield-check text-success'"
            ></i>
          </div>
          <div class="fw-bold fs-5 mb-0" :class="summary?.coQuaHan ? 'text-danger' : 'text-success'">
            {{ summary?.coQuaHan ? 'CÓ SÁCH QUÁ HẠN' : 'Không có quá hạn' }}
          </div>
          <div class="small mt-2" :class="summary?.coQuaHan ? 'text-danger' : 'text-muted'" style="font-size: 0.75rem;">
            {{ summary?.coQuaHan ? 'Cần hoàn trả trước khi được mượn tiếp' : 'Tài khoản mượn trả đúng hạn' }}
          </div>
        </div>
      </div>

      <!-- Thẻ 4: Tiền phạt chưa thanh toán -->
      <div class="col-12 col-sm-6 col-lg-3">
        <div
          class="card border-0 shadow-sm rounded-4 h-100 p-3 summary-card"
          :class="(summary?.tongPhatChuaTra || 0) > 0 ? 'bg-warning-subtle border border-warning-subtle' : 'bg-white'"
        >
          <div class="d-flex align-items-center justify-content-between mb-2">
            <span class="small fw-medium" :class="(summary?.tongPhatChuaTra || 0) > 0 ? 'text-warning-emphasis' : 'text-secondary'">
              Phạt chưa thanh toán
            </span>
            <i class="bi bi-cash-stack text-warning-emphasis fs-5"></i>
          </div>
          <div
            class="fw-bold fs-5 mb-0"
            :class="(summary?.tongPhatChuaTra || 0) > 0 ? 'text-danger' : 'text-dark'"
          >
            {{ formatCurrency(summary?.tongPhatChuaTra || 0) }}
          </div>
          <div class="small mt-2" :class="(summary?.tongPhatChuaTra || 0) > 0 ? 'text-danger' : 'text-muted'" style="font-size: 0.75rem;">
            {{ (summary?.tongPhatChuaTra || 0) > 0 ? `${summary?.soKhoanPhatChuaTra || 0} khoản phạt cần thanh toán tại quầy` : 'Không có khoản phạt tồn đọng' }}
          </div>
        </div>
      </div>
    </div>

    <!-- BỘ LỌC TABS THEO TRẠNG THÁI -->
    <div class="card border-0 shadow-sm rounded-4 mb-4">
      <div class="card-body p-2 p-md-3">
        <div class="d-flex flex-wrap align-items-center gap-2">
          <button
            v-for="tab in statusTabs"
            :key="tab.value"
            type="button"
            class="btn btn-sm rounded-pill px-3 transition-all"
            :class="selectedStatus === tab.value ? 'btn-primary shadow-sm' : 'btn-light text-secondary'"
            @click="handleStatusChange(tab.value)"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>
    </div>

    <!-- TRẠNG THÁI ĐANG TẢI -->
    <LoadingSpinner v-if="isLoading" text="Đang tải danh sách phiếu mượn..." />

    <!-- TRẠNG THÁI DANH SÁCH TRỐNG -->
    <div v-else-if="borrowings.length === 0" class="card border-0 shadow-sm rounded-4 py-5 text-center">
      <EmptyState
        title="Không tìm thấy phiếu mượn nào"
        :message="selectedStatus ? `Không có phiếu mượn nào ở trạng thái '${statusTabs.find(t => t.value === selectedStatus)?.label || selectedStatus}'.` : 'Bạn chưa đăng ký mượn cuốn sách nào từ thư viện.'"
      >
        <template #action>
          <div class="d-flex justify-content-center gap-2 mt-3">
            <button
              v-if="selectedStatus"
              type="button"
              class="btn btn-outline-secondary btn-sm rounded-pill px-3"
              @click="handleStatusChange('')"
            >
              <i class="bi bi-arrow-counterclockwise me-1"></i> Xem tất cả phiếu
            </button>
            <RouterLink to="/" class="btn btn-primary btn-sm rounded-pill px-4 shadow-sm">
              <i class="bi bi-book me-1"></i> Khám phá sách để mượn
            </RouterLink>
          </div>
        </template>
      </EmptyState>
    </div>

    <!-- DANH SÁCH PHIẾU MƯỢN (DESKTOP TABLE + MOBILE CARDS) -->
    <div v-else>
      <!-- Bảng hiển thị trên Desktop & Tablet -->
      <div class="card border-0 shadow-sm rounded-4 overflow-hidden mb-4 d-none d-md-block">
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead class="table-light text-secondary small text-uppercase">
              <tr>
                <th scope="col" style="width: 320px;" class="ps-4">Thông tin sách</th>
                <th scope="col">Các mốc thời gian</th>
                <th scope="col" style="width: 180px;">Trạng thái</th>
                <th scope="col" style="width: 150px;">Phạt / Kho</th>
                <th scope="col" style="width: 140px;" class="text-end pe-4">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in borrowings" :key="item._id" class="transition-hover">
                <!-- Cột Sách -->
                <td class="ps-4 py-3">
                  <div class="d-flex align-items-center gap-3">
                    <img
                      v-if="getCoverUrl(item.Sach?.AnhBia)"
                      :src="getCoverUrl(item.Sach?.AnhBia)"
                      :alt="item.Sach?.TenSach || item.MaSach"
                      class="rounded-3 shadow-sm object-fit-cover"
                      style="width: 48px; height: 68px;"
                    />
                    <div
                      v-else
                      class="rounded-3 bg-light d-flex align-items-center justify-content-center text-muted"
                      style="width: 48px; height: 68px;"
                    >
                      <i class="bi bi-book fs-4 opacity-50"></i>
                    </div>

                    <div class="text-truncate" style="max-width: 240px;">
                      <RouterLink
                        :to="`/books/${item.MaSach}`"
                        class="fw-bold text-dark text-decoration-none hover-primary d-block text-truncate"
                        :title="item.Sach?.TenSach || item.MaSach"
                      >
                        {{ item.Sach?.TenSach || item.MaSach }}
                      </RouterLink>
                      <div class="small text-secondary text-truncate" :title="item.Sach?.NguonGocTacGia">
                        <i class="bi bi-person me-1"></i>{{ item.Sach?.NguonGocTacGia || '—' }}
                      </div>
                      <div class="small text-muted font-monospace" style="font-size: 0.75rem;">
                        Mã: {{ item.MaSach }}
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

                    <!-- Mốc hạn nhận sách khi Đã duyệt -->
                    <div v-if="item.TrangThai === 'DaDuyet' && item.HanNhanSach" class="text-info-emphasis mt-1">
                      <i class="bi bi-calendar-event me-1"></i>
                      <span>Hạn nhận: <strong>{{ formatDate(item.HanNhanSach, true) }}</strong></span>
                    </div>

                    <!-- Mốc ngày mượn & hạn trả khi Đang mượn -->
                    <div v-if="item.TrangThai === 'DangMuon' && item.HanTra" class="mt-1" :class="item.isOverdue ? 'text-danger fw-bold' : 'text-primary'">
                      <i class="bi" :class="item.isOverdue ? 'bi-alarm-fill' : 'bi-calendar-check'"></i>
                      <span class="ms-1">Hạn trả: {{ formatDate(item.HanTra) }}</span>
                    </div>

                    <!-- Mốc ngày trả thực tế khi Đã trả -->
                    <div v-if="item.TrangThai === 'DaTra' && item.NgayTra" class="text-success mt-1">
                      <i class="bi bi-check-circle me-1"></i>
                      <span>Đã trả ngày: {{ formatDate(item.NgayTra) }}</span>
                    </div>
                  </div>
                </td>

                <!-- Cột Trạng thái -->
                <td class="py-3">
                  <StatusBadge
                    :status="item.TrangThai"
                    :is-overdue="item.isOverdue"
                    :so-ngay-tre="item.soNgayTre"
                    :fine-status="item.TrangThaiPhat"
                    :fine-amount="item.TienPhat"
                  />
                  <!-- Hiển thị lý do từ chối tóm tắt nếu có -->
                  <div v-if="item.TrangThai === 'TuChoi' && item.LyDoTuChoi" class="small text-danger mt-1 text-truncate" style="max-width: 170px;" :title="item.LyDoTuChoi">
                    <em>"{{ item.LyDoTuChoi }}"</em>
                  </div>
                </td>

                <!-- Cột Phạt & Bồi thường -->
                <td class="py-3">
                  <div v-if="item.TienPhat > 0" class="small">
                    <div class="fw-bold text-danger">
                      {{ formatCurrency(item.TienPhat) }}
                    </div>
                    <div class="small text-muted" style="font-size: 0.75rem;">
                      {{ item.TrangThaiPhat === 'DaThanhToan' ? 'Đã thanh toán' : 'Chưa đóng phạt' }}
                    </div>
                    <div v-if="item.TinhTrangTra && item.TinhTrangTra !== 'BinhThuong'" class="badge bg-light text-danger border mt-1">
                      {{ item.TinhTrangTra === 'Rach' ? 'Sách rách' : 'Mất sách' }}
                    </div>
                  </div>
                  <div v-else class="text-muted small">
                    —
                  </div>
                </td>

                <!-- Cột Thao tác -->
                <td class="py-3 pe-4 text-end">
                  <div class="d-inline-flex align-items-center gap-1">
                    <!-- Nút Xem chi tiết -->
                    <button
                      type="button"
                      class="btn btn-outline-secondary btn-sm rounded-circle p-1"
                      style="width: 32px; height: 32px;"
                      title="Xem chi tiết phiếu mượn"
                      @click="openDetailModal(item)"
                    >
                      <i class="bi bi-eye"></i>
                    </button>

                    <!-- Nút Hủy phiếu (chỉ khả dụng với ChoDuyet hoặc DaDuyet) -->
                    <button
                      v-if="item.TrangThai === 'ChoDuyet' || item.TrangThai === 'DaDuyet'"
                      type="button"
                      class="btn btn-outline-danger btn-sm rounded-pill px-2 py-1 small"
                      title="Hủy phiếu mượn"
                      @click="openCancelModal(item)"
                    >
                      <i class="bi bi-x-circle me-1"></i>Hủy
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Danh sách dạng Card trên Mobile -->
      <div class="d-md-none mb-4">
        <div
          v-for="item in borrowings"
          :key="item._id"
          class="card border-0 shadow-sm rounded-4 mb-3 p-3 bg-white"
        >
          <div class="d-flex align-items-start gap-3 mb-2">
            <img
              v-if="getCoverUrl(item.Sach?.AnhBia)"
              :src="getCoverUrl(item.Sach?.AnhBia)"
              :alt="item.Sach?.TenSach || item.MaSach"
              class="rounded-3 shadow-sm object-fit-cover"
              style="width: 54px; height: 76px;"
            />
            <div
              v-else
              class="rounded-3 bg-light d-flex align-items-center justify-content-center text-muted"
              style="width: 54px; height: 76px;"
            >
              <i class="bi bi-book fs-3 opacity-50"></i>
            </div>

            <div class="flex-grow-1 text-truncate">
              <RouterLink
                :to="`/books/${item.MaSach}`"
                class="fw-bold text-dark text-decoration-none hover-primary d-block text-truncate"
              >
                {{ item.Sach?.TenSach || item.MaSach }}
              </RouterLink>
              <div class="small text-secondary mb-1">
                {{ item.Sach?.NguonGocTacGia || '—' }}
              </div>
              <StatusBadge
                :status="item.TrangThai"
                :is-overdue="item.isOverdue"
                :so-ngay-tre="item.soNgayTre"
                :fine-status="item.TrangThaiPhat"
                :fine-amount="item.TienPhat"
              />
            </div>
          </div>

          <!-- Các mốc thời gian trên Mobile -->
          <div class="small bg-light p-2 rounded-3 text-secondary mb-2">
            <div><span class="text-muted">Đăng ký:</span> {{ formatDate(item.NgayDangKy) }}</div>
            <div v-if="item.TrangThai === 'DaDuyet' && item.HanNhanSach" class="text-info-emphasis">
              <i class="bi bi-calendar-event me-1"></i>Hạn nhận: {{ formatDate(item.HanNhanSach, true) }}
            </div>
            <div v-if="item.TrangThai === 'DangMuon' && item.HanTra" :class="item.isOverdue ? 'text-danger fw-bold' : 'text-primary'">
              <i class="bi bi-alarm me-1"></i>Hạn trả: {{ formatDate(item.HanTra) }}
            </div>
            <div v-if="item.TrangThai === 'DaTra' && item.NgayTra" class="text-success">
              <i class="bi bi-check2-circle me-1"></i>Đã trả: {{ formatDate(item.NgayTra) }}
            </div>
          </div>

          <div class="d-flex align-items-center justify-content-between pt-1">
            <div v-if="item.TienPhat > 0" class="small text-danger fw-bold">
              Phạt: {{ formatCurrency(item.TienPhat) }}
            </div>
            <div v-else class="small text-muted">Không có phạt</div>

            <div class="d-flex align-items-center gap-2">
              <button
                type="button"
                class="btn btn-outline-secondary btn-sm rounded-pill px-3"
                @click="openDetailModal(item)"
              >
                Chi tiết
              </button>
              <button
                v-if="item.TrangThai === 'ChoDuyet' || item.TrangThai === 'DaDuyet'"
                type="button"
                class="btn btn-outline-danger btn-sm rounded-pill px-3"
                @click="openCancelModal(item)"
              >
                Hủy phiếu
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Phân trang -->
      <div v-if="meta.totalPages > 1" class="d-flex justify-content-center mt-4">
        <AppPagination
          :current-page="meta.page"
          :total-pages="meta.totalPages"
          @change-page="handlePageChange"
        />
      </div>
    </div>

    <!-- MODAL XÁC NHẬN HỦY PHIẾU -->
    <ConfirmModal
      ref="cancelModalRef"
      title="Xác nhận hủy phiếu mượn"
      confirm-text="Xác nhận hủy"
      cancel-text="Giữ lại phiếu"
      confirm-btn-class="btn-danger"
      icon="bi-exclamation-triangle-fill text-danger"
      :is-processing="isCancelling"
      @confirm="confirmCancelBorrowing"
    >
      <div v-if="borrowingToCancel">
        <p class="mb-2">
          Bạn có chắc chắn muốn hủy phiếu mượn cuốn sách <strong>"{{ borrowingToCancel.Sach?.TenSach || borrowingToCancel.MaSach }}"</strong> không?
        </p>
        <div v-if="borrowingToCancel.TrangThai === 'DaDuyet'" class="alert alert-warning py-2 px-3 small rounded-3 mb-0">
          <i class="bi bi-info-circle me-1"></i>
          <strong>Lưu ý:</strong> Phiếu mượn này đã được duyệt và sách đang được giữ cho bạn. Khi bạn xác nhận hủy, sách sẽ được hoàn trả lại kho thư viện để các độc giả khác có thể mượn.
        </div>
      </div>
    </ConfirmModal>

    <!-- MODAL XEM CHI TIẾT PHIẾU MƯỢN -->
    <div
      ref="detailModalElement"
      class="modal fade"
      tabindex="-1"
      aria-hidden="true"
    >
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content border-0 shadow-lg rounded-4">
          <div class="modal-header border-0 pb-0">
            <h5 class="modal-title fw-bold d-flex align-items-center gap-2">
              <i class="bi bi-file-earmark-text text-primary"></i>
              <span>Chi tiết phiếu mượn</span>
            </h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button>
          </div>

          <div v-if="selectedBorrowing" class="modal-body py-3">
            <!-- Thông tin sách -->
            <div class="card bg-light border-0 rounded-4 p-3 mb-3">
              <div class="d-flex align-items-start gap-3">
                <img
                  v-if="getCoverUrl(selectedBorrowing.Sach?.AnhBia)"
                  :src="getCoverUrl(selectedBorrowing.Sach?.AnhBia)"
                  :alt="selectedBorrowing.Sach?.TenSach"
                  class="rounded-3 shadow-sm object-fit-cover"
                  style="width: 64px; height: 90px;"
                />
                <div class="flex-grow-1">
                  <h6 class="fw-bold text-dark mb-1">{{ selectedBorrowing.Sach?.TenSach || selectedBorrowing.MaSach }}</h6>
                  <div class="small text-secondary mb-1">Tác giả: {{ selectedBorrowing.Sach?.NguonGocTacGia || '—' }}</div>
                  <div class="small text-secondary mb-1">Mã sách: <span class="font-monospace text-dark">{{ selectedBorrowing.MaSach }}</span></div>
                  <div class="small text-secondary">Đơn giá sách: <span class="text-primary fw-semibold">{{ formatCurrency(selectedBorrowing.Sach?.DonGia) }}</span></div>
                </div>
              </div>
            </div>

            <!-- Trạng thái và các mốc tiến trình -->
            <h6 class="fw-bold text-dark fs-6 mb-2 border-bottom pb-2">Tiến trình xử lý phiếu</h6>
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

              <div class="col-6 col-sm-4 text-muted">Ngày đăng ký mượn:</div>
              <div class="col-6 col-sm-8 fw-medium">{{ formatDate(selectedBorrowing.NgayDangKy, true) }}</div>

              <template v-if="selectedBorrowing.NgayDuyet">
                <div class="col-6 col-sm-4 text-muted">Ngày xét duyệt:</div>
                <div class="col-6 col-sm-8 fw-medium">{{ formatDate(selectedBorrowing.NgayDuyet, true) }}</div>
              </template>

              <template v-if="selectedBorrowing.HanNhanSach">
                <div class="col-6 col-sm-4 text-muted">Hạn đến nhận sách:</div>
                <div class="col-6 col-sm-8 fw-semibold text-info-emphasis">{{ formatDate(selectedBorrowing.HanNhanSach, true) }}</div>
              </template>

              <template v-if="selectedBorrowing.NgayMuon">
                <div class="col-6 col-sm-4 text-muted">Ngày nhận sách (Giao):</div>
                <div class="col-6 col-sm-8 fw-medium">{{ formatDate(selectedBorrowing.NgayMuon, true) }}</div>
              </template>

              <template v-if="selectedBorrowing.HanTra">
                <div class="col-6 col-sm-4 text-muted">Hạn trả sách:</div>
                <div class="col-6 col-sm-8 fw-bold" :class="selectedBorrowing.isOverdue ? 'text-danger' : 'text-primary'">
                  {{ formatDate(selectedBorrowing.HanTra, true) }}
                  <span v-if="selectedBorrowing.isOverdue" class="badge bg-danger ms-1">Quá hạn {{ selectedBorrowing.soNgayTre }} ngày</span>
                </div>
              </template>

              <template v-if="selectedBorrowing.NgayTra">
                <div class="col-6 col-sm-4 text-muted">Ngày trả sách thực tế:</div>
                <div class="col-6 col-sm-8 fw-medium text-success">{{ formatDate(selectedBorrowing.NgayTra, true) }}</div>
              </template>

              <template v-if="selectedBorrowing.LyDoTuChoi">
                <div class="col-6 col-sm-4 text-muted">Lý do từ chối:</div>
                <div class="col-6 col-sm-8 text-danger fw-semibold">{{ selectedBorrowing.LyDoTuChoi }}</div>
              </template>
            </div>

            <!-- Thông tin tình trạng trả và xử lý phạt (nếu có) -->
            <template v-if="selectedBorrowing.TrangThai === 'DaTra' || selectedBorrowing.TienPhat > 0">
              <h6 class="fw-bold text-dark fs-6 mb-2 border-bottom pb-2">Biên nhận trả & Tiền phạt</h6>
              <div class="row g-2 small">
                <div class="col-6 col-sm-4 text-muted">Tình trạng sách khi trả:</div>
                <div class="col-6 col-sm-8 fw-medium">
                  {{ selectedBorrowing.TinhTrangTra === 'BinhThuong' ? 'Bình thường' : selectedBorrowing.TinhTrangTra === 'Rach' ? `Sách bị rách (${selectedBorrowing.MucRach === 'Nang' ? 'Nặng' : 'Nhẹ'})` : 'Báo mất sách' }}
                </div>

                <div v-if="selectedBorrowing.PhiTre > 0" class="col-6 col-sm-4 text-muted">Phí trễ hạn:</div>
                <div v-if="selectedBorrowing.PhiTre > 0" class="col-6 col-sm-8 fw-medium text-danger">{{ formatCurrency(selectedBorrowing.PhiTre) }}</div>

                <div class="col-6 col-sm-4 text-muted">Tổng tiền phạt:</div>
                <div class="col-6 col-sm-8 fw-bold" :class="selectedBorrowing.TienPhat > 0 ? 'text-danger fs-6' : 'text-success'">
                  {{ formatCurrency(selectedBorrowing.TienPhat) }}
                </div>

                <div v-if="selectedBorrowing.TienPhat > 0" class="col-6 col-sm-4 text-muted">Tình trạng thanh toán:</div>
                <div v-if="selectedBorrowing.TienPhat > 0" class="col-6 col-sm-8">
                  <span
                    class="badge rounded-pill px-2 py-1"
                    :class="selectedBorrowing.TrangThaiPhat === 'DaThanhToan' ? 'bg-success text-white' : 'bg-danger text-white'"
                  >
                    {{ selectedBorrowing.TrangThaiPhat === 'DaThanhToan' ? 'Đã thanh toán tại quầy' : 'Chưa thanh toán (Vui lòng đến thư viện)' }}
                  </span>
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
  </div>
</template>

<style scoped>
.summary-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.summary-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.08) !important;
}

.hover-primary:hover {
  color: var(--bs-primary) !important;
}

.transition-all {
  transition: all 0.2s ease;
}

.transition-hover:hover {
  background-color: rgba(var(--bs-primary-rgb), 0.03);
}
</style>
