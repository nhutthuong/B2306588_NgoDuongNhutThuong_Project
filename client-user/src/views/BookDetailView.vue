<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import bookApi from '../api/book.api.js';
import { getErrorMessage } from '../api/http.js';
import { formatCurrency, getCoverUrl } from '../utils/format.js';
import LoadingSpinner from '../components/LoadingSpinner.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const book = ref(null);
const isLoading = ref(true);
const notFound = ref(false);
const errorMessage = ref('');
const isImageError = ref(false);

const maSach = computed(() => {
  return route.params.maSach ? String(route.params.maSach).trim().toUpperCase() : '';
});

const borrowNotice = ref('');
const handleBorrowClick = () => {
  borrowNotice.value = 'Chức năng gửi phiếu đăng ký mượn trực tuyến sẽ được kích hoạt tại Phase 3 (P3-6). Vui lòng quay lại sau!';
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

          <!-- Thông báo tạm thời khi bấm mượn sách -->
          <div v-if="borrowNotice" class="alert alert-info alert-dismissible fade show rounded-3 small py-2 px-3 mb-4" role="alert">
            <i class="bi bi-info-circle me-1"></i>
            {{ borrowNotice }}
            <button type="button" class="btn-close py-2" @click="borrowNotice = ''" aria-label="Đóng"></button>
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
                @click="handleBorrowClick"
              >
                <i class="bi bi-journal-plus me-1"></i> Đăng ký mượn sách
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
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
