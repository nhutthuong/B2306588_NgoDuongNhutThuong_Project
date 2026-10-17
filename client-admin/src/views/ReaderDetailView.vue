<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import readerApi from '../api/reader.api.js';
import { useAuthStore } from '../stores/auth.js';
import { formatCurrency, formatDate } from '../utils/format.js';
import { getErrorMessage } from '../api/http.js';
import StatusBadge from '../components/StatusBadge.vue';
import AppPagination from '../components/AppPagination.vue';
import AppAlert from '../components/AppAlert.vue';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import ReaderEditModal from '../components/ReaderEditModal.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const maDocGia = computed(() => String(route.params.maDocGia || '').trim().toUpperCase());

// Trạng thái dữ liệu
const reader = ref(null);
const isLoading = ref(true);
const isNotFound = ref(false);
const errorMessage = ref('');
const alertMessage = ref('');
const alertType = ref('success');

// Lịch sử mượn và phân trang lịch sử
const borrowPage = ref(1);
const borrowLimit = ref(10);
const borrowStatusFilter = ref('');
const borrowings = ref([]);
const borrowMeta = ref({
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 1,
});

// Modal references
const editModalRef = ref(null);
const lockModalRef = ref(null);
const unlockModalRef = ref(null);
const deleteModalRef = ref(null);

// Trạng thái xử lý thao tác
const isLocking = ref(false);
const lockReason = ref('');
const isUnlocking = ref(false);
const isDeleting = ref(false);

/**
 * Nạp thông tin chi tiết độc giả và lịch sử mượn
 */
const fetchReaderDetail = async () => {
  if (!/^DG\d{4,}$/.test(maDocGia.value)) {
    isNotFound.value = true;
    isLoading.value = false;
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';
  isNotFound.value = false;

  try {
    const params = {
      borrowPage: borrowPage.value,
      borrowLimit: borrowLimit.value,
      trangThai: borrowStatusFilter.value || undefined,
    };

    const res = await readerApi.get(maDocGia.value, params);
    const data = res.data?.data;

    reader.value = data;
    borrowings.value = data?.borrowings?.items || [];
    if (data?.borrowings?.meta) {
      borrowMeta.value = data.borrowings.meta;
    }
  } catch (err) {
    if (err?.response?.status === 404) {
      isNotFound.value = true;
    } else {
      errorMessage.value = getErrorMessage(err);
    }
  } finally {
    isLoading.value = false;
  }
};

/**
 * Thay đổi lọc trạng thái phiếu mượn
 */
const onBorrowStatusChange = (status) => {
  borrowStatusFilter.value = status;
  borrowPage.value = 1;
  fetchReaderDetail();
};

/**
 * Đổi trang lịch sử mượn
 */
const onBorrowPageChange = (page) => {
  borrowPage.value = page;
  fetchReaderDetail();
};

/**
 * Mở modal chỉnh sửa thông tin độc giả
 */
const openEditModal = () => {
  if (editModalRef.value && reader.value) {
    editModalRef.value.open(reader.value);
  }
};

/**
 * Sau khi cập nhật thành công từ modal
 */
const onReaderSaved = (updatedDoc) => {
  alertType.value = 'success';
  alertMessage.value = 'Cập nhật thông tin độc giả thành công';
  if (updatedDoc) {
    reader.value = {
      ...reader.value,
      ...updatedDoc,
    };
  }
  fetchReaderDetail();
};

/**
 * Mở modal Khóa tài khoản (CHỈ admin)
 */
const openLockModal = () => {
  lockReason.value = '';
  if (lockModalRef.value) {
    lockModalRef.value.show();
  }
};

/**
 * Xác nhận Khóa tài khoản
 */
const handleConfirmLock = async () => {
  isLocking.value = true;
  errorMessage.value = '';

  try {
    const res = await readerApi.updateStatus(maDocGia.value, {
      TrangThai: 'BiKhoa',
      LyDo: lockReason.value.trim() || undefined,
    });
    if (lockModalRef.value) {
      lockModalRef.value.hide();
    }
    alertType.value = 'success';
    alertMessage.value = res.data?.message || 'Khóa tài khoản độc giả thành công';
    await fetchReaderDetail();
  } catch (err) {
    errorMessage.value = getErrorMessage(err);
  } finally {
    isLocking.value = false;
  }
};

/**
 * Mở modal Mở khóa tài khoản (CHỈ admin)
 */
const openUnlockModal = () => {
  if (unlockModalRef.value) {
    unlockModalRef.value.show();
  }
};

/**
 * Xác nhận Mở khóa tài khoản
 */
const handleConfirmUnlock = async () => {
  isUnlocking.value = true;
  errorMessage.value = '';

  try {
    const res = await readerApi.updateStatus(maDocGia.value, {
      TrangThai: 'HoatDong',
    });
    if (unlockModalRef.value) {
      unlockModalRef.value.hide();
    }
    alertType.value = 'success';
    alertMessage.value = res.data?.message || 'Mở khóa tài khoản độc giả thành công';
    await fetchReaderDetail();
  } catch (err) {
    errorMessage.value = getErrorMessage(err);
  } finally {
    isUnlocking.value = false;
  }
};

/**
 * Mở modal Xóa độc giả (CHỈ admin)
 */
const openDeleteModal = () => {
  if (deleteModalRef.value) {
    deleteModalRef.value.show();
  }
};

/**
 * Xác nhận Xóa độc giả
 */
const handleConfirmDelete = async () => {
  isDeleting.value = true;

  try {
    const res = await readerApi.remove(maDocGia.value);
    if (deleteModalRef.value) {
      deleteModalRef.value.hide();
    }
    // Chuyển hướng về trang danh sách độc giả kèm thông báo
    router.push({
      path: '/readers',
      query: { deleted: maDocGia.value },
    });
  } catch (err) {
    if (deleteModalRef.value) {
      deleteModalRef.value.hide();
    }
    // Nếu server trả 409 HAS_BORROWINGS hoặc lỗi khác: hiển thị nguyên văn thông báo cùng gợi ý khóa tài khoản
    alertType.value = 'warning';
    alertMessage.value = getErrorMessage(err);
  } finally {
    isDeleting.value = false;
  }
};

onMounted(() => {
  fetchReaderDetail();
});

watch(
  () => route.params.maDocGia,
  () => {
    borrowPage.value = 1;
    borrowStatusFilter.value = '';
    fetchReaderDetail();
  }
);
</script>

<template>
  <div class="reader-detail-view">
    <!-- Breadcrumb điều hướng -->
    <nav aria-label="breadcrumb" class="mb-3">
      <ol class="breadcrumb small">
        <li class="breadcrumb-item">
          <RouterLink to="/" class="text-decoration-none">Dashboard</RouterLink>
        </li>
        <li class="breadcrumb-item">
          <RouterLink to="/readers" class="text-decoration-none">Độc giả</RouterLink>
        </li>
        <li class="breadcrumb-item active" aria-current="page">
          {{ maDocGia }}
        </li>
      </ol>
    </nav>

    <!-- Trường hợp Không tìm thấy độc giả (404) -->
    <div v-if="isNotFound" class="card border-0 shadow-sm p-5 text-center my-4">
      <div class="my-4">
        <i class="bi bi-person-x text-muted" style="font-size: 4rem;"></i>
        <h2 class="h4 fw-bold mt-3 mb-2">Không tìm thấy độc giả</h2>
        <p class="text-muted mb-4">
          Mã độc giả <code class="fw-bold">{{ maDocGia }}</code> không tồn tại trên hệ thống hoặc đã bị xóa.
        </p>
        <RouterLink to="/readers" class="btn btn-primary btn-sm px-4">
          <i class="bi bi-arrow-left me-1"></i>Quay lại danh sách độc giả
        </RouterLink>
      </div>
    </div>

    <!-- Đang tải -->
    <div v-else-if="isLoading" class="card border-0 shadow-sm p-5 text-center my-4">
      <LoadingSpinner message="Đang nạp hồ sơ chi tiết độc giả..." />
    </div>

    <!-- Nội dung hồ sơ độc giả -->
    <div v-else-if="reader">
      <!-- Banner cảnh báo khi tài khoản bị khóa -->
      <div
        v-if="reader.TrangThai === 'BiKhoa'"
        class="alert alert-danger d-flex align-items-center gap-3 shadow-sm mb-4 border-0"
        role="alert"
      >
        <i class="bi bi-lock-fill fs-2 text-danger flex-shrink-0"></i>
        <div>
          <h5 class="alert-heading fw-bold mb-1">Tài khoản độc giả này hiện đang bị khóa</h5>
          <p class="mb-0 small">
            Độc giả không thể đăng nhập vào hệ thống và không thể gửi yêu cầu mượn sách mới. Toàn bộ phiên làm việc của độc giả đã bị vô hiệu hóa.
          </p>
        </div>
      </div>

      <!-- Thông báo alert phản hồi thao tác -->
      <AppAlert
        v-if="alertMessage"
        :type="alertType"
        :message="alertMessage"
        @close="alertMessage = ''"
      />

      <AppAlert
        v-if="errorMessage"
        type="danger"
        :message="errorMessage"
        @close="errorMessage = ''"
      />

      <!-- Tiêu đề và các nút thao tác đầu trang -->
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
        <div class="d-flex align-items-center gap-3">
          <div class="avatar-circle bg-primary-subtle text-primary fw-bold fs-4 d-flex align-items-center justify-content-center">
            <i class="bi bi-person"></i>
          </div>
          <div>
            <div class="d-flex align-items-center gap-2">
              <h1 class="h3 fw-bold mb-0">{{ reader.HoLot }} {{ reader.Ten }}</h1>
              <span
                v-if="reader.TrangThai === 'HoatDong'"
                class="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2"
              >
                <i class="bi bi-check-circle me-1"></i>Hoạt động
              </span>
              <span
                v-else
                class="badge bg-danger text-white border border-danger-subtle rounded-pill px-2"
              >
                <i class="bi bi-lock-fill me-1"></i>Bị khóa
              </span>
            </div>
            <div class="text-muted small mt-1">
              Mã độc giả: <span class="font-monospace fw-bold text-dark">{{ reader.MaDocGia }}</span>
              <span class="mx-2">·</span>
              Email: <span class="text-dark">{{ reader.Email }}</span>
            </div>
          </div>
        </div>

        <!-- Nhóm nút hành động -->
        <div class="d-flex flex-wrap align-items-center gap-2">
          <!-- Sửa thông tin (Thủ thư + Admin) -->
          <button
            type="button"
            class="btn btn-outline-primary btn-sm d-flex align-items-center gap-1"
            @click="openEditModal"
          >
            <i class="bi bi-pencil-square"></i>
            <span>Sửa thông tin</span>
          </button>

          <!-- Nút Khóa / Mở khóa (CHỈ Admin) -->
          <template v-if="authStore.isAdmin">
            <button
              v-if="reader.TrangThai === 'HoatDong'"
              type="button"
              class="btn btn-outline-warning btn-sm d-flex align-items-center gap-1 text-dark"
              @click="openLockModal"
            >
              <i class="bi bi-lock-fill text-warning"></i>
              <span>Khóa tài khoản</span>
            </button>
            <button
              v-else
              type="button"
              class="btn btn-outline-success btn-sm d-flex align-items-center gap-1"
              @click="openUnlockModal"
            >
              <i class="bi bi-unlock-fill text-success"></i>
              <span>Mở khóa tài khoản</span>
            </button>

            <!-- Nút Xóa độc giả (CHỈ Admin) -->
            <button
              type="button"
              class="btn btn-outline-danger btn-sm d-flex align-items-center gap-1"
              @click="openDeleteModal"
            >
              <i class="bi bi-trash3"></i>
              <span>Xóa độc giả</span>
            </button>
          </template>
        </div>
      </div>

      <!-- Khối tóm tắt tình trạng mượn sách -->
      <div v-if="reader.summary" class="row g-3 mb-4">
        <!-- Đang chiếm chỗ -->
        <div class="col-6 col-md-3">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-body p-3">
              <div class="text-muted small fw-medium mb-1">Đang giữ chỗ</div>
              <div class="h4 fw-bold mb-0 text-primary">
                {{ reader.summary.dangChiemCho }}
                <span class="text-secondary fs-6 fw-normal">/ {{ reader.summary.toiDa }} cuốn</span>
              </div>
              <div class="progress mt-2" style="height: 4px;">
                <div
                  class="progress-bar bg-primary"
                  role="progressbar"
                  :style="{ width: `${Math.min(100, (reader.summary.dangChiemCho / (reader.summary.toiDa || 1)) * 100)}%` }"
                ></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Còn được mượn -->
        <div class="col-6 col-md-3">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-body p-3">
              <div class="text-muted small fw-medium mb-1">Còn được mượn</div>
              <div class="h4 fw-bold mb-0 text-success">
                {{ reader.summary.conDuocMuon }}
                <span class="text-secondary fs-6 fw-normal">cuốn</span>
              </div>
              <small class="text-muted">Theo quy định mượn tối đa</small>
            </div>
          </div>
        </div>

        <!-- Tình trạng quá hạn -->
        <div class="col-6 col-md-3">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-body p-3">
              <div class="text-muted small fw-medium mb-1">Sách quá hạn</div>
              <div class="d-flex align-items-center gap-2">
                <span
                  v-if="reader.summary.coQuaHan"
                  class="badge bg-danger text-white px-2 py-1 fs-6 animate-pulse"
                >
                  <i class="bi bi-exclamation-triangle-fill me-1"></i>Có sách quá hạn
                </span>
                <span v-else class="badge bg-success-subtle text-success fs-6 px-2 py-1">
                  <i class="bi bi-check-circle me-1"></i>Không quá hạn
                </span>
              </div>
              <small class="text-muted d-block mt-1">Cảnh báo mượn thêm sách</small>
            </div>
          </div>
        </div>

        <!-- Phạt chưa trả -->
        <div class="col-6 col-md-3">
          <div class="card border-0 shadow-sm h-100">
            <div class="card-body p-3">
              <div class="text-muted small fw-medium mb-1">Phạt chưa trả</div>
              <div class="h4 fw-bold mb-0" :class="reader.summary.tongPhatChuaTra > 0 ? 'text-danger' : 'text-dark'">
                {{ formatCurrency(reader.summary.tongPhatChuaTra) }}
              </div>
              <small class="text-muted">
                {{ reader.summary.soKhoanPhatChuaTra > 0 ? `${reader.summary.soKhoanPhatChuaTra} khoản chưa nộp` : 'Không có nợ phạt' }}
              </small>
            </div>
          </div>
        </div>
      </div>

      <!-- Khối thông tin cá nhân (Chỉ đọc) -->
      <div class="card border-0 shadow-sm mb-4">
        <div class="card-header bg-white border-bottom py-3 d-flex align-items-center justify-content-between">
          <h5 class="card-title fw-bold mb-0 d-flex align-items-center gap-2">
            <i class="bi bi-person-lines-fill text-primary"></i>
            <span>Thông tin cá nhân</span>
          </h5>
          <span class="badge bg-light text-secondary border">Hồ sơ chỉ đọc</span>
        </div>
        <div class="card-body p-4">
          <div class="row g-3">
            <div class="col-md-3 col-sm-6">
              <div class="text-muted small">Mã độc giả</div>
              <div class="fw-bold font-monospace text-primary">{{ reader.MaDocGia }}</div>
            </div>
            <div class="col-md-3 col-sm-6">
              <div class="text-muted small">Họ và tên</div>
              <div class="fw-semibold">{{ reader.HoLot }} {{ reader.Ten }}</div>
            </div>
            <div class="col-md-3 col-sm-6">
              <div class="text-muted small">Giới tính</div>
              <div>{{ reader.Phai === 'Nam' ? 'Nam' : reader.Phai === 'Nu' ? 'Nữ' : 'Khác' }}</div>
            </div>
            <div class="col-md-3 col-sm-6">
              <div class="text-muted small">Ngày sinh</div>
              <div>{{ formatDate(reader.NgaySinh) }}</div>
            </div>
            <div class="col-md-3 col-sm-6">
              <div class="text-muted small">Địa chỉ Email</div>
              <div class="text-break">{{ reader.Email }}</div>
            </div>
            <div class="col-md-3 col-sm-6">
              <div class="text-muted small">Số điện thoại</div>
              <div class="font-monospace">{{ reader.DienThoai || '—' }}</div>
            </div>
            <div class="col-md-3 col-sm-6">
              <div class="text-muted small">Lần đăng nhập cuối</div>
              <div>{{ formatDate(reader.LanDangNhapCuoi, true) }}</div>
            </div>
            <div class="col-md-3 col-sm-6">
              <div class="text-muted small">Ngày đăng ký tài khoản</div>
              <div>{{ formatDate(reader.createdAt, true) }}</div>
            </div>
            <div class="col-12">
              <div class="text-muted small">Địa chỉ thường trú</div>
              <div>{{ reader.DiaChi || '—' }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Khối Lịch sử mượn sách -->
      <div class="card border-0 shadow-sm">
        <div class="card-header bg-white border-bottom py-3">
          <div class="d-flex flex-wrap align-items-center justify-content-between gap-3">
            <div class="d-flex align-items-center gap-2">
              <h5 class="card-title fw-bold mb-0 d-flex align-items-center gap-2">
                <i class="bi bi-clock-history text-primary"></i>
                <span>Lịch sử mượn sách</span>
              </h5>
              <span class="badge bg-secondary rounded-pill">{{ borrowMeta.total }} phiếu</span>
            </div>

            <!-- Bộ lọc trạng thái phiếu mượn -->
            <div class="btn-group btn-group-sm flex-wrap" role="group" aria-label="Bộ lọc trạng thái">
              <button
                type="button"
                class="btn"
                :class="borrowStatusFilter === '' ? 'btn-primary' : 'btn-outline-secondary'"
                @click="onBorrowStatusChange('')"
              >
                Tất cả
              </button>
              <button
                type="button"
                class="btn"
                :class="borrowStatusFilter === 'ChoDuyet' ? 'btn-primary' : 'btn-outline-secondary'"
                @click="onBorrowStatusChange('ChoDuyet')"
              >
                Chờ duyệt
              </button>
              <button
                type="button"
                class="btn"
                :class="borrowStatusFilter === 'DaDuyet' ? 'btn-primary' : 'btn-outline-secondary'"
                @click="onBorrowStatusChange('DaDuyet')"
              >
                Đã duyệt
              </button>
              <button
                type="button"
                class="btn"
                :class="borrowStatusFilter === 'DangMuon' ? 'btn-primary' : 'btn-outline-secondary'"
                @click="onBorrowStatusChange('DangMuon')"
              >
                Đang mượn
              </button>
              <button
                type="button"
                class="btn"
                :class="borrowStatusFilter === 'DaTra' ? 'btn-primary' : 'btn-outline-secondary'"
                @click="onBorrowStatusChange('DaTra')"
              >
                Đã trả
              </button>
              <button
                type="button"
                class="btn"
                :class="borrowStatusFilter === 'TuChoi' ? 'btn-primary' : 'btn-outline-secondary'"
                @click="onBorrowStatusChange('TuChoi')"
              >
                Từ chối
              </button>
              <button
                type="button"
                class="btn"
                :class="borrowStatusFilter === 'DaHuy' ? 'btn-primary' : 'btn-outline-secondary'"
                @click="onBorrowStatusChange('DaHuy')"
              >
                Đã hủy
              </button>
            </div>
          </div>
        </div>

        <div class="card-body p-0">
          <!-- Bảng rỗng -->
          <div v-if="borrowings.length === 0" class="p-5 text-center text-muted">
            <i class="bi bi-journal-x fs-1 d-block mb-2 text-secondary"></i>
            <div>Độc giả chưa có phiếu mượn nào trong danh mục này.</div>
          </div>

          <!-- Bảng phiếu mượn -->
          <div v-else class="table-responsive">
            <table class="table table-hover align-middle mb-0">
              <thead class="table-light">
                <tr class="text-secondary small">
                  <th scope="col" style="min-width: 100px;">Mã phiếu</th>
                  <th scope="col" style="min-width: 200px;">Tên sách</th>
                  <th scope="col" style="min-width: 120px;">Ngày đăng ký</th>
                  <th scope="col" style="min-width: 120px;">Hạn trả</th>
                  <th scope="col" style="min-width: 150px;">Trạng thái</th>
                  <th scope="col" class="text-end" style="min-width: 120px;">Tiền phạt</th>
                  <th scope="col" style="min-width: 140px;">Tình trạng trả</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="b in borrowings" :key="b._id">
                  <!-- Mã phiếu -->
                  <td class="font-monospace fw-bold text-secondary">
                    {{ String(b._id).substring(18) }}
                  </td>

                  <!-- Tên sách -->
                  <td>
                    <div class="fw-semibold text-dark">{{ b.TenSach || '—' }}</div>
                    <small class="text-muted font-monospace">{{ b.MaSach }}</small>
                  </td>

                  <!-- Ngày đăng ký / Ngày mượn -->
                  <td>
                    <div>{{ formatDate(b.NgayDangKy) }}</div>
                    <small v-if="b.NgayMuon" class="text-muted">
                      Giao: {{ formatDate(b.NgayMuon) }}
                    </small>
                  </td>

                  <!-- Hạn trả -->
                  <td>
                    <div v-if="b.HanTra">
                      <span :class="{ 'text-danger fw-bold': b.isOverdue }">
                        {{ formatDate(b.HanTra) }}
                      </span>
                    </div>
                    <div v-else-if="b.HanNhanSach" class="text-muted small">
                      Nhận trước: {{ formatDate(b.HanNhanSach) }}
                    </div>
                    <span v-else class="text-muted">—</span>
                  </td>

                  <!-- Trạng thái kèm cờ quá hạn -->
                  <td>
                    <StatusBadge
                      :status="b.TrangThai"
                      :is-overdue="Boolean(b.isOverdue)"
                      :so-ngay-tre="b.soNgayTre || 0"
                      :fine-status="b.TrangThaiPhat"
                      :fine-amount="b.TienPhat || 0"
                    />
                  </td>

                  <!-- Tiền phạt -->
                  <td class="text-end">
                    <span
                      v-if="b.TienPhat > 0"
                      class="font-monospace fw-bold"
                      :class="b.TrangThaiPhat === 'ChuaThanhToan' ? 'text-danger' : 'text-success'"
                    >
                      {{ formatCurrency(b.TienPhat) }}
                    </span>
                    <span v-else class="text-muted font-monospace">0 ₫</span>
                  </td>

                  <!-- Tình trạng khi trả -->
                  <td>
                    <span v-if="b.TinhTrangTra === 'BinhThuong'" class="badge bg-light text-dark border">
                      Bình thường
                    </span>
                    <span v-else-if="b.TinhTrangTra === 'Rach'" class="badge bg-warning text-dark border border-warning-subtle">
                      Rách ({{ b.MucRach === 'Nang' ? 'Nặng' : 'Nhẹ' }})
                    </span>
                    <span v-else-if="b.TinhTrangTra === 'Mat'" class="badge bg-danger text-white border border-danger-subtle">
                      Mất sách
                    </span>
                    <span v-else class="text-muted">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Phân trang lịch sử mượn -->
          <div
            v-if="borrowMeta.totalPages > 1"
            class="card-footer bg-white border-top p-3 d-flex flex-wrap align-items-center justify-content-between gap-2"
          >
            <div class="small text-muted">
              Trang {{ borrowMeta.page }} / {{ borrowMeta.totalPages }} (Tổng cộng {{ borrowMeta.total }} phiếu)
            </div>
            <AppPagination
              :current-page="borrowMeta.page"
              :total-pages="borrowMeta.totalPages"
              @change-page="onBorrowPageChange"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Modal sửa thông tin độc giả -->
    <ReaderEditModal
      ref="editModalRef"
      @saved="onReaderSaved"
    />

    <!-- Modal Khóa tài khoản -->
    <ConfirmModal
      ref="lockModalRef"
      title="Khóa tài khoản độc giả"
      message="Bạn có chắc chắn muốn khóa tài khoản độc giả này không? Khi bị khóa, độc giả sẽ không thể đăng nhập hoặc thực hiện mượn sách mới."
      confirm-text="Khóa tài khoản"
      confirm-btn-class="btn-danger"
      :is-processing="isLocking"
      icon="bi-lock-fill text-danger"
      @confirm="handleConfirmLock"
      @cancel="lockReason = ''"
    >
      <template #extra>
        <div class="mt-3">
          <label for="lockReasonInput" class="form-label small fw-medium text-dark">
            Lý do khóa (tùy chọn, tối đa 300 ký tự):
          </label>
          <textarea
            id="lockReasonInput"
            v-model="lockReason"
            class="form-control form-control-sm"
            rows="2"
            maxlength="300"
            placeholder="Nhập lý do khóa tài khoản..."
          ></textarea>
        </div>
      </template>
    </ConfirmModal>

    <!-- Modal Mở khóa tài khoản -->
    <ConfirmModal
      ref="unlockModalRef"
      title="Mở khóa tài khoản độc giả"
      message="Bạn có chắc chắn muốn mở khóa cho tài khoản độc giả này không? Độc giả sẽ có thể đăng nhập lại bình thường và bộ đếm sai mật khẩu sẽ được đặt lại về 0."
      confirm-text="Mở khóa tài khoản"
      confirm-btn-class="btn-success"
      :is-processing="isUnlocking"
      icon="bi-unlock-fill text-success"
      @confirm="handleConfirmUnlock"
    />

    <!-- Modal Xóa độc giả -->
    <ConfirmModal
      ref="deleteModalRef"
      title="Xác nhận xóa độc giả"
      message="Hành động này sẽ xóa vĩnh viễn tài khoản độc giả chưa từng mượn sách khỏi hệ thống và không thể hoàn tác."
      confirm-text="Xóa vĩnh viễn"
      confirm-btn-class="btn-danger"
      :is-processing="isDeleting"
      icon="bi-trash3-fill text-danger"
      @confirm="handleConfirmDelete"
    />
  </div>
</template>

<style scoped>
.avatar-circle {
  width: 56px;
  height: 56px;
  border-radius: 50%;
}

@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.75;
  }
  100% {
    opacity: 1;
  }
}

.animate-pulse {
  animation: pulse 1.8s infinite ease-in-out;
}
</style>
