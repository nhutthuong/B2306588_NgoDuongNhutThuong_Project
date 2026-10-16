<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import bookApi from '../api/book.api.js';
import borrowingApi from '../api/borrowing.api.js';
import { getErrorMessage } from '../api/http.js';
import { formatCurrency, getCoverUrl } from '../utils/format.js';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import ConfirmModal from '../components/ConfirmModal.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const book = ref(null);
const isLoading = ref(true);
const notFound = ref(false);
const errorMessage = ref('');
const isImageError = ref(false);

const confirmModalRef = ref(null);
const isBorrowing = ref(false);
const borrowSuccess = ref(false);
const borrowError = ref('');

const maSach = computed(() => {
  return route.params.maSach ? String(route.params.maSach).trim().toUpperCase() : '';
});

/**
 * Trích xuất thông điệp lỗi nghiệp vụ tiếng Việt chi tiết khi mượn sách
 */
const getBorrowErrorMessage = (error) => {
  const code = error?.response?.data?.error?.code;
  switch (code) {
    case 'ACCOUNT_LOCKED':
      return 'Tài khoản của bạn đang bị khóa, không thể đăng ký mượn sách.';
    case 'HAS_OVERDUE':
      return 'Bạn đang có sách mượn quá hạn chưa trả. Vui lòng hoàn trả sách trước khi đăng ký mượn tiếp.';
    case 'HAS_UNPAID_FINE':
      return 'Bạn đang có khoản tiền phạt chưa thanh toán. Vui lòng đến thư viện hoàn tất đóng phạt trước khi mượn tiếp.';
    case 'BORROW_LIMIT_EXCEEDED':
      return 'Bạn đã đạt giới hạn mượn sách tối đa (tối đa 5 cuốn đang chiếm chỗ cùng lúc).';
    case 'ALREADY_BORROWING':
      return 'Bạn đang có phiếu mượn cuốn sách này (ở trạng thái chờ duyệt, đã duyệt hoặc đang mượn).';
    case 'OUT_OF_STOCK':
      return 'Sách tạm thời hết trong kho. Vui lòng thử lại sau.';
    case 'NOT_FOUND':
      return 'Không tìm thấy thông tin sách hoặc sách đã ngừng phục vụ.';
    default:
      return getErrorMessage(error);
  }
};

const handleBorrowClick = () => {
  borrowSuccess.value = false;
  borrowError.value = '';
  if (confirmModalRef.value) {
    confirmModalRef.value.show();
  }
};

const handleConfirmBorrow = async () => {
  if (!book.value?.MaSach) return;

  isBorrowing.value = true;
  borrowError.value = '';

  try {
    await borrowingApi.create(book.value.MaSach);
    borrowSuccess.value = true;
    if (confirmModalRef.value) {
      confirmModalRef.value.hide();
    }
    // Tải lại thông tin sách để cập nhật số lượng tồn kho hiển thị
    fetchBookDetail();
  } catch (error) {
    borrowError.value = getBorrowErrorMessage(error);
    if (confirmModalRef.value) {
      confirmModalRef.value.hide();
    }
  } finally {
    isBorrowing.value = false;
  }
};

/**
 * Nạp thông tin chi tiết của sách từ API
 */
const fetchBookDetail = async () => {
  // Kiểm tra định dạng mã sách regex ^S\d{4,}$
  if (!/^S\d{4,}$/.test(maSach.value)) {
    notFound.value = true;
    isLoading.value = false;
    errorMessage.value = `Mã sách "${maSach.value}" không đúng định dạng chuẩn (ví dụ: S0001).`;
    return;
  }

  isLoading.value = true;
  notFound.value = false;
  errorMessage.value = '';
  isImageError.value = false;

  try {
    const res = await bookApi.get(maSach.value);
    book.value = res.data?.data || null;

    if (!book.value) {
      notFound.value = true;
    } else {
      // Cập nhật tiêu đề trang
      document.title = `${book.value.TenSach} — Thư viện điện tử`;
    }
  } catch (error) {
    if (error.response?.status === 404) {
      notFound.value = true;
    } else {
      errorMessage.value = getErrorMessage(error);
    }
  } finally {
    isLoading.value = false;
  }
};

watch(
  () => route.params.maSach,
  () => {
    fetchBookDetail();
  }
);

onMounted(() => {
  fetchBookDetail();
});

const handleImageError = () => {
  isImageError.value = true;
};
</script>

<template>
  <div class="book-detail-view py-2">
    <!-- Breadcrumb điều hướng -->
    <nav aria-label="breadcrumb" class="mb-4">
      <ol class="breadcrumb small">
        <li class="breadcrumb-item">
          <RouterLink to="/" class="text-decoration-none">
            <i class="bi bi-house-door me-1"></i>Trang chủ
          </RouterLink>
        </li>
        <li class="breadcrumb-item">
          <RouterLink to="/" class="text-decoration-none">Danh mục sách</RouterLink>
        </li>
        <li class="breadcrumb-item active text-truncate" aria-current="page" style="max-width: 300px;">
          {{ book?.TenSach || maSach }}
        </li>
      </ol>
    </nav>

    <!-- Trạng thái đang tải -->
    <LoadingSpinner v-if="isLoading" text="Đang tải chi tiết sách..." />

    <!-- Trạng thái 404 Không tìm thấy sách -->
    <div v-else-if="notFound" class="card border-0 shadow-sm rounded-4 py-5 text-center">
      <div class="card-body">
        <div class="text-secondary opacity-50 mb-3">
          <i class="bi bi-file-earmark-x" style="font-size: 4rem;"></i>
        </div>
        <h3 class="fw-bold mb-2 text-dark">Không tìm thấy sách</h3>
        <p class="text-muted small mb-4" style="max-width: 480px; margin: 0 auto;">
          {{ errorMessage || 'Cuốn sách bạn đang tìm không tồn tại hoặc đã ngừng phục vụ mượn.' }}
        </p>
        <RouterLink to="/" class="btn btn-primary btn-sm px-4 rounded-pill shadow-sm">
          <i class="bi bi-arrow-left me-1"></i> Quay lại danh mục sách
        </RouterLink>
      </div>
    </div>

    <!-- Trạng thái lỗi tải dữ liệu khác -->
    <div v-else-if="errorMessage" class="card border-0 shadow-sm rounded-4 py-5 text-center">
      <div class="card-body">
        <div class="text-danger mb-3">
          <i class="bi bi-exclamation-triangle" style="font-size: 3.5rem;"></i>
        </div>
        <h4 class="fw-bold mb-2">Đã xảy ra lỗi</h4>
        <p class="text-secondary small mb-4">{{ errorMessage }}</p>
        <button type="button" class="btn btn-outline-primary btn-sm px-4 rounded-pill" @click="fetchBookDetail">
          <i class="bi bi-arrow-clockwise me-1"></i> Thử lại
        </button>
      </div>
    </div>

    <!-- Nội dung chi tiết sách khi tải thành công -->
    <div v-else-if="book" class="row g-4">
      <!-- Cột trái: Ảnh bìa sách lớn -->
      <div class="col-12 col-md-5 col-lg-4">
        <div class="card border-0 shadow-sm rounded-4 overflow-hidden sticky-top" style="top: 80px;">
          <div class="book-detail-cover-box bg-light text-center p-3 d-flex align-items-center justify-content-center">
            <img
              v-if="getCoverUrl(book.AnhBia) && !isImageError"
              :src="getCoverUrl(book.AnhBia)"
              :alt="'Bìa sách ' + book.TenSach"
              class="img-fluid rounded-3 shadow-sm book-detail-cover"
              @error="handleImageError"
            />
            <div
              v-else
              class="book-detail-cover-placeholder d-flex flex-column align-items-center justify-content-center text-muted py-5"
            >
              <i class="bi bi-book text-secondary opacity-50" style="font-size: 5rem;"></i>
              <span class="small mt-2">Chưa có ảnh bìa</span>
            </div>
          </div>

          <!-- Tình trạng kho nhanh -->
          <div class="card-footer bg-white border-top p-3 text-center">
            <span
              class="badge rounded-pill px-3 py-2 fs-6"
              :class="book.conSach ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-danger-subtle text-danger border border-danger-subtle'"
            >
              <i class="bi" :class="book.conSach ? 'bi-check-circle-fill' : 'bi-x-circle-fill'"></i>
              <span class="ms-1">
                {{ book.conSach ? `Còn ${book.SoQuyenConLai} cuốn trong kho` : 'Tạm hết sách trong kho' }}
              </span>
            </span>
          </div>
        </div>
      </div>

      <!-- Cột phải: Thông tin chi tiết sách & Hành động -->
      <div class="col-12 col-md-7 col-lg-8">
        <div class="card border-0 shadow-sm rounded-4 p-4 mb-4">
          <!-- Huy hiệu mã sách & thể loại -->
          <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
            <span class="badge bg-light text-dark border font-monospace px-2 py-1">
              Mã: {{ book.MaSach }}
            </span>
            <span v-if="book.TheLoai" class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill">
              {{ book.TheLoai }}
            </span>
          </div>

          <!-- Tên sách -->
          <h1 class="h3 fw-bold text-dark mb-3">
            {{ book.TenSach }}
          </h1>

          <!-- Tác giả / Nguồn gốc -->
          <div class="d-flex align-items-center gap-2 text-secondary mb-3">
            <i class="bi bi-person-circle fs-5 text-primary"></i>
            <span class="fs-6">Tác giả / Nguồn gốc: <strong class="text-dark">{{ book.NguonGocTacGia }}</strong></span>
          </div>

          <!-- Bảng thông số chi tiết -->
          <div class="table-responsive mb-4">
            <table class="table table-sm table-borderless align-middle mb-0">
              <tbody>
                <tr class="border-bottom">
                  <td class="text-muted small py-2" style="width: 140px;">Nhà xuất bản</td>
                  <td class="fw-semibold text-dark py-2">
                    {{ book.TenNXB || book.NhaXuatBan?.TenNXB || book.MaNXB }}
                  </td>
                </tr>
                <tr v-if="book.NhaXuatBan?.DiaChi" class="border-bottom">
                  <td class="text-muted small py-2">Địa chỉ NXB</td>
                  <td class="text-secondary small py-2">
                    {{ book.NhaXuatBan.DiaChi }}
                  </td>
                </tr>
                <tr class="border-bottom">
                  <td class="text-muted small py-2">Năm xuất bản</td>
                  <td class="fw-medium text-dark py-2">
                    {{ book.NamXuatBan || '—' }}
                  </td>
                </tr>
                <tr class="border-bottom">
                  <td class="text-muted small py-2">Đơn giá sách</td>
                  <td class="py-2">
                    <span class="fs-4 fw-bold text-primary">{{ formatCurrency(book.DonGia) }}</span>
                    <span class="text-muted small ms-2">(Giá trị làm căn cứ bồi thường khi mất/hỏng)</span>
                  </td>
                </tr>
                <tr>
                  <td class="text-muted small py-2">Tình trạng kho</td>
                  <td class="py-2">
                    <span
                      class="badge"
                      :class="book.conSach ? 'bg-success text-white' : 'bg-danger text-white'"
                    >
                      {{ book.conSach ? `Còn ${book.SoQuyenConLai} cuốn` : 'Hết sách' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Mô tả nội dung -->
          <div class="mb-4">
            <h5 class="fw-bold fs-6 text-dark border-bottom pb-2 mb-2">
              <i class="bi bi-card-text text-primary me-1"></i> Giới thiệu nội dung sách
            </h5>
            <div
              v-if="book.MoTa"
              class="text-secondary small lh-lg"
              style="white-space: pre-line;"
            >
              {{ book.MoTa }}
            </div>
            <div v-else class="text-muted small fst-italic">
              Chưa có mô tả tóm tắt cho cuốn sách này.
            </div>
          </div>

          <!-- Thông báo đăng ký mượn thành công -->
          <div v-if="borrowSuccess" class="alert alert-success alert-dismissible fade show rounded-3 small py-3 px-4 mb-4 shadow-sm" role="alert">
            <div class="d-flex align-items-start gap-2">
              <i class="bi bi-check-circle-fill text-success fs-5"></i>
              <div class="flex-grow-1">
                <div class="fw-bold fs-6 mb-1">Đăng ký mượn sách thành công!</div>
                <p class="mb-2">Yêu cầu mượn cuốn <strong>{{ book.TenSach }}</strong> đã được gửi lên hệ thống và đang ở trạng thái <strong>Chờ duyệt</strong>. Sau khi thủ thư phê duyệt, bạn sẽ có 2 ngày để đến thư viện nhận sách.</p>
                <RouterLink to="/my-borrowings" class="btn btn-success btn-sm rounded-pill px-3">
                  <i class="bi bi-journal-check me-1"></i> Đến trang Lịch sử mượn
                </RouterLink>
              </div>
              <button type="button" class="btn-close" @click="borrowSuccess = false" aria-label="Đóng"></button>
            </div>
          </div>

          <!-- Thông báo lỗi đăng ký mượn -->
          <div v-if="borrowError" class="alert alert-danger alert-dismissible fade show rounded-3 small py-3 px-4 mb-4 shadow-sm" role="alert">
            <div class="d-flex align-items-center gap-2">
              <i class="bi bi-exclamation-triangle-fill text-danger fs-5"></i>
              <div class="flex-grow-1">
                <div class="fw-bold mb-1">Không thể gửi yêu cầu mượn sách</div>
                <div>{{ borrowError }}</div>
              </div>
              <button type="button" class="btn-close" @click="borrowError = ''" aria-label="Đóng"></button>
            </div>
          </div>

          <!-- Khối hành động: Đăng ký mượn & Quay lại -->
          <div class="p-3 bg-light rounded-3 border d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3">
            <div>
              <div v-if="book.conSach" class="small text-success fw-medium">
                <i class="bi bi-check2-circle me-1"></i> Sách đang sẵn sàng để mượn tại thư viện
              </div>
              <div v-else class="small text-danger fw-medium">
                <i class="bi bi-exclamation-circle me-1"></i> Sách tạm thời hết trong kho, bạn chưa thể mượn cuốn này
              </div>
            </div>

            <div class="d-flex align-items-center gap-2">
              <RouterLink to="/" class="btn btn-outline-secondary btn-sm px-3 rounded-pill">
                <i class="bi bi-arrow-left me-1"></i> Quay lại
              </RouterLink>

              <!-- Khi hết sách: Vô hiệu hóa nút mượn -->
              <button
                v-if="!book.conSach"
                type="button"
                class="btn btn-secondary btn-sm px-4 rounded-pill shadow-sm"
                disabled
              >
                <i class="bi bi-slash-circle me-1"></i> Tạm hết sách
              </button>

              <!-- Khi chưa đăng nhập: Chuyển hướng sang /login kèm redirect -->
              <RouterLink
                v-else-if="!authStore.isAuthenticated"
                :to="{ path: '/login', query: { redirect: `/books/${book.MaSach}` } }"
                class="btn btn-primary btn-sm px-4 rounded-pill shadow-sm"
              >
                <i class="bi bi-box-arrow-in-right me-1"></i> Đăng nhập để mượn
              </RouterLink>

              <!-- Khi đã đăng nhập và còn sách -->
              <button
                v-else
                type="button"
                class="btn btn-primary btn-sm px-4 rounded-pill shadow-sm"
                :disabled="isBorrowing"
                @click="handleBorrowClick"
              >
                <span
                  v-if="isBorrowing"
                  class="spinner-border spinner-border-sm me-1"
                  role="status"
                  aria-hidden="true"
                ></span>
                <i v-else class="bi bi-journal-plus me-1"></i>
                <span>{{ isBorrowing ? 'Đang xử lý...' : 'Đăng ký mượn sách' }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal xác nhận đăng ký mượn -->
    <ConfirmModal
      v-if="book"
      ref="confirmModalRef"
      title="Xác nhận đăng ký mượn sách"
      confirm-text="Xác nhận mượn"
      cancel-text="Để sau"
      confirm-btn-class="btn-primary"
      icon="bi-journal-plus text-primary"
      :is-processing="isBorrowing"
      @confirm="handleConfirmBorrow"
    >
      <div class="mb-3">
        Bạn có chắc chắn muốn đăng ký mượn cuốn sách sau đây?
      </div>
      <div class="card bg-light border-0 rounded-3 p-3 mb-3">
        <div class="fw-bold text-dark fs-6">{{ book.TenSach }}</div>
        <div class="small text-secondary mb-1">Mã sách: <span class="font-monospace text-dark">{{ book.MaSach }}</span></div>
        <div class="small text-secondary mb-1">Tác giả / Nguồn gốc: {{ book.NguonGocTacGia }}</div>
        <div class="small text-secondary">Đơn giá sách: <span class="text-primary fw-semibold">{{ formatCurrency(book.DonGia) }}</span></div>
      </div>
      <div class="alert alert-info py-2 px-3 small mb-0 rounded-3">
        <i class="bi bi-info-circle me-1"></i>
        <strong>Quy định mượn:</strong> Phiếu mượn sẽ có hiệu lực nhận trong 2 ngày sau khi được duyệt. Thời hạn mượn sách tối đa là 14 ngày kể từ ngày nhận sách thực tế.
      </div>
    </ConfirmModal>
  </div>
</template>

<style scoped>
.book-detail-cover-box {
  min-height: 380px;
}

.book-detail-cover {
  max-height: 420px;
  width: auto;
  max-width: 100%;
  object-fit: contain;
}

.book-detail-cover-placeholder {
  min-height: 320px;
}
</style>
