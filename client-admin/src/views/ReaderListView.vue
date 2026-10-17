<script setup>
import { ref, computed, watch, onUnmounted } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import readerApi from '../api/reader.api.js';
import { formatCurrency, formatDate } from '../utils/format.js';
import { getErrorMessage } from '../api/http.js';
import AppPagination from '../components/AppPagination.vue';
import EmptyState from '../components/EmptyState.vue';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import AppAlert from '../components/AppAlert.vue';

const route = useRoute();
const router = useRouter();

// Dữ liệu bảng độc giả và phân trang
const readers = ref([]);
const pagination = ref({
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 1,
});

const isLoading = ref(false);
const errorMessage = ref('');

// Từ khóa tìm kiếm cục bộ (chờ debounce 400ms)
const searchInput = ref('');
let searchDebounceTimer = null;
let activeAbortController = null;

// Whitelist các trường sắp xếp
const SORT_OPTIONS = [
  { value: '-createdAt', label: 'Mới đăng ký nhất' },
  { value: 'createdAt', label: 'Cũ nhất' },
  { value: 'Ten', label: 'Tên A → Z' },
  { value: '-Ten', label: 'Tên Z → A' },
  { value: 'MaDocGia', label: 'Mã độc giả A → Z' },
  { value: '-MaDocGia', label: 'Mã độc giả Z → A' },
  { value: '-LanDangNhapCuoi', label: 'Đăng nhập gần nhất' },
];

const ALLOWED_SORTS = SORT_OPTIONS.map((opt) => opt.value);

// Đọc giá trị bộ lọc từ URL (route.query) để đồng bộ 100% hai chiều
const querySearch = computed(() => (route.query.search ? String(route.query.search).trim() : ''));
const queryTrangThai = computed(() => {
  const status = route.query.trangThai;
  return status === 'HoatDong' || status === 'BiKhoa' ? status : '';
});
const querySort = computed(() => {
  return ALLOWED_SORTS.includes(route.query.sort) ? route.query.sort : '-createdAt';
});
const queryPage = computed(() => Math.max(1, parseInt(route.query.page, 10) || 1));

// Kiểm tra xem có bộ lọc nào đang áp dụng hay không
const isFiltered = computed(() => {
  return Boolean(querySearch.value || queryTrangThai.value || (route.query.sort && route.query.sort !== '-createdAt'));
});

// Cập nhật ô tìm kiếm khi route.query thay đổi (F5, nút Back/Forward)
watch(
  querySearch,
  (newVal) => {
    if (searchInput.value !== newVal) {
      searchInput.value = newVal;
    }
  },
  { immediate: true }
);

/**
 * Nạp danh sách độc giả từ backend
 * Sử dụng AbortController để hủy request cũ nếu có request mới đến nhanh
 */
const fetchReaders = async () => {
  if (activeAbortController) {
    activeAbortController.abort();
  }
  activeAbortController = new AbortController();

  isLoading.value = true;
  errorMessage.value = '';

  try {
    const params = {
      search: querySearch.value || undefined,
      trangThai: queryTrangThai.value || undefined,
      sort: querySort.value,
      page: queryPage.value,
      limit: 10,
    };

    const res = await readerApi.list(params, activeAbortController.signal);
    const data = res.data;

    readers.value = data?.data || [];
    if (data?.meta) {
      pagination.value = {
        page: data.meta.page || 1,
        limit: data.meta.limit || 10,
        total: data.meta.total || 0,
        totalPages: data.meta.totalPages || 1,
      };
    }
  } catch (err) {
    if (err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') {
      return;
    }
    errorMessage.value = getErrorMessage(err);
    readers.value = [];
  } finally {
    isLoading.value = false;
  }
};

/**
 * Xử lý nhập ô tìm kiếm kèm debounce 400ms
 */
const onSearchInput = () => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
  searchDebounceTimer = setTimeout(() => {
    updateQuery({
      search: searchInput.value.trim() || undefined,
      page: 1, // Thay đổi lọc luôn về trang 1
    });
  }, 400);
};

/**
 * Cập nhật route.query một cách mượt mà và an toàn
 */
const updateQuery = (newParams) => {
  const currentQuery = { ...route.query };
  const merged = { ...currentQuery, ...newParams };

  // Xóa các key rỗng/undefined
  Object.keys(merged).forEach((key) => {
    if (merged[key] === undefined || merged[key] === '' || merged[key] === null) {
      delete merged[key];
    }
  });

  router.push({ query: merged });
};

/**
 * Thay đổi trạng thái lọc
 */
const onTrangThaiChange = (event) => {
  updateQuery({
    trangThai: event.target.value || undefined,
    page: 1,
  });
};

/**
 * Thay đổi sắp xếp
 */
const onSortChange = (event) => {
  updateQuery({
    sort: event.target.value === '-createdAt' ? undefined : event.target.value,
    page: 1,
  });
};

/**
 * Chuyển trang
 */
const onPageChange = (newPage) => {
  updateQuery({
    page: newPage > 1 ? newPage : undefined,
  });
};

/**
 * Đặt lại toàn bộ bộ lọc về mặc định
 */
const resetFilters = () => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
  searchInput.value = '';
  router.push({ query: {} });
};

// Theo dõi sự thay đổi của route.query để tự động fetch dữ liệu
watch(
  () => route.query,
  () => {
    fetchReaders();
  },
  { immediate: true }
);

onUnmounted(() => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
  if (activeAbortController) {
    activeAbortController.abort();
  }
});
</script>

<template>
  <div class="reader-list-view">
    <!-- Tiêu đề trang -->
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
      <div>
        <h1 class="h3 fw-bold mb-1 d-flex align-items-center gap-2">
          <i class="bi bi-people text-primary"></i>
          <span>Quản lý Độc giả</span>
        </h1>
        <p class="text-muted small mb-0">
          Danh sách độc giả, xem thông tin cá nhân, hồ sơ mượn sách, lịch sử phạt và quản lý trạng thái tài khoản.
        </p>
      </div>

      <div class="d-flex align-items-center gap-2">
        <span class="badge bg-light text-dark border px-3 py-2 fw-medium">
          Tổng cộng: <span class="fw-bold text-primary">{{ pagination.total }}</span> độc giả
        </span>
      </div>
    </div>

    <!-- Thông báo lỗi tải trang nếu có -->
    <AppAlert
      v-if="errorMessage"
      type="danger"
      :message="errorMessage"
      @close="errorMessage = ''"
    >
      <template #extra>
        <button
          type="button"
          class="btn btn-outline-danger btn-sm ms-3"
          @click="fetchReaders"
        >
          <i class="bi bi-arrow-clockwise me-1"></i>Thử lại
        </button>
      </template>
    </AppAlert>

    <!-- Khối bộ lọc -->
    <div class="card border-0 shadow-sm mb-4">
      <div class="card-body p-3">
        <div class="row g-2 align-items-center">
          <!-- Ô tìm kiếm -->
          <div class="col-12 col-md-5">
            <div class="input-group input-group-sm">
              <span class="input-group-text bg-white border-end-0">
                <i class="bi bi-search text-muted"></i>
              </span>
              <input
                v-model="searchInput"
                type="text"
                class="form-control border-start-0 ps-0"
                placeholder="Tìm mã, họ tên, email, số điện thoại..."
                @input="onSearchInput"
              />
              <button
                v-if="searchInput"
                type="button"
                class="btn btn-outline-secondary border-start-0"
                title="Xóa tìm kiếm"
                @click="searchInput = ''; onSearchInput();"
              >
                <i class="bi bi-x-lg"></i>
              </button>
            </div>
          </div>

          <!-- Lọc trạng thái -->
          <div class="col-6 col-md-3">
            <select
              class="form-select form-select-sm"
              :value="queryTrangThai"
              aria-label="Lọc trạng thái"
              @change="onTrangThaiChange"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="HoatDong">Hoạt động</option>
              <option value="BiKhoa">Bị khóa</option>
            </select>
          </div>

          <!-- Sắp xếp -->
          <div class="col-6 col-md-3">
            <select
              class="form-select form-select-sm"
              :value="querySort"
              aria-label="Sắp xếp danh sách"
              @change="onSortChange"
            >
              <option
                v-for="opt in SORT_OPTIONS"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </div>

          <!-- Nút xóa bộ lọc -->
          <div class="col-12 col-md-1 d-flex justify-content-end">
            <button
              v-if="isFiltered"
              type="button"
              class="btn btn-outline-secondary btn-sm w-100"
              title="Đặt lại bộ lọc"
              @click="resetFilters"
            >
              <i class="bi bi-arrow-counterclockwise"></i>
              <span class="d-md-none ms-1">Xóa bộ lọc</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Bảng danh sách độc giả -->
    <div class="card border-0 shadow-sm">
      <div class="card-body p-0">
        <!-- Trạng thái Loading -->
        <div v-if="isLoading" class="p-5 text-center">
          <LoadingSpinner message="Đang nạp danh sách độc giả..." />
        </div>

        <!-- Trạng thái Trống -->
        <div v-else-if="readers.length === 0" class="p-5">
          <EmptyState
            title="Không tìm thấy độc giả nào"
            :message="
              isFiltered
                ? 'Không có độc giả nào phù hợp với điều kiện tìm kiếm và bộ lọc hiện tại.'
                : 'Chưa có dữ liệu độc giả trong hệ thống.'
            "
            icon="bi-people"
          >
            <template #action>
              <button
                v-if="isFiltered"
                type="button"
                class="btn btn-outline-primary btn-sm"
                @click="resetFilters"
              >
                <i class="bi bi-arrow-counterclockwise me-1"></i>Xóa bộ lọc
              </button>
            </template>
          </EmptyState>
        </div>

        <!-- Bảng hiển thị khi có dữ liệu -->
        <div v-else class="table-responsive">
          <table class="table table-hover align-middle mb-0 reader-table">
            <thead class="table-light">
              <tr class="text-secondary small">
                <th scope="col" style="min-width: 100px;">Mã</th>
                <th scope="col" style="min-width: 170px;">Họ và tên</th>
                <th scope="col" style="min-width: 200px;">Email</th>
                <th scope="col" style="min-width: 120px;">Điện thoại</th>
                <th scope="col" class="text-center" style="min-width: 110px;">Trạng thái</th>
                <th scope="col" class="text-center" style="min-width: 130px;">Đang mượn</th>
                <th scope="col" class="text-end" style="min-width: 130px;">Phạt chưa trả</th>
                <th scope="col" style="min-width: 150px;">Lần đăng nhập cuối</th>
                <th scope="col" class="text-center" style="min-width: 90px;">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in readers" :key="r.MaDocGia">
                <!-- Mã độc giả -->
                <td>
                  <RouterLink
                    :to="`/readers/${r.MaDocGia}`"
                    class="fw-bold text-decoration-none font-monospace text-primary"
                  >
                    {{ r.MaDocGia }}
                  </RouterLink>
                </td>

                <!-- Họ và tên -->
                <td>
                  <div class="fw-semibold text-dark">{{ r.HoLot }} {{ r.Ten }}</div>
                  <div class="small text-muted">
                    <span>{{ r.Phai === 'Nam' ? 'Nam' : r.Phai === 'Nu' ? 'Nữ' : 'Khác' }}</span>
                    <span v-if="r.NgaySinh"> · {{ formatDate(r.NgaySinh) }}</span>
                  </div>
                </td>

                <!-- Email -->
                <td>
                  <div class="text-break">{{ r.Email }}</div>
                </td>

                <!-- Điện thoại -->
                <td>
                  <span class="font-monospace">{{ r.DienThoai || '—' }}</span>
                </td>

                <!-- Trạng thái -->
                <td class="text-center">
                  <span
                    v-if="r.TrangThai === 'HoatDong'"
                    class="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2 py-1"
                  >
                    <i class="bi bi-check-circle me-1"></i>Hoạt động
                  </span>
                  <span
                    v-else
                    class="badge bg-danger text-white border border-danger-subtle rounded-pill px-2 py-1"
                  >
                    <i class="bi bi-lock-fill me-1"></i>Bị khóa
                  </span>
                </td>

                <!-- Đang mượn & Quá hạn -->
                <td class="text-center">
                  <div class="d-inline-flex align-items-center gap-1">
                    <span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-2">
                      {{ r.dangChiemCho }} cuốn
                    </span>
                    <span
                      v-if="r.coQuaHan"
                      class="badge bg-danger text-white rounded-pill px-2 py-1 animate-pulse"
                      title="Có sách đang quá hạn trả"
                    >
                      <i class="bi bi-exclamation-triangle-fill me-1"></i>Quá hạn
                    </span>
                  </div>
                </td>

                <!-- Phạt chưa trả -->
                <td class="text-end">
                  <span
                    v-if="r.tongPhatChuaTra > 0"
                    class="text-danger fw-bold font-monospace"
                  >
                    {{ formatCurrency(r.tongPhatChuaTra) }}
                  </span>
                  <span v-else class="text-muted font-monospace">0 ₫</span>
                </td>

                <!-- Lần đăng nhập cuối -->
                <td>
                  <small class="text-muted">
                    {{ formatDate(r.LanDangNhapCuoi, true) }}
                  </small>
                </td>

                <!-- Thao tác Xem -->
                <td class="text-center">
                  <RouterLink
                    :to="`/readers/${r.MaDocGia}`"
                    class="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1"
                    title="Xem chi tiết hồ sơ độc giả"
                  >
                    <i class="bi bi-eye"></i>
                    <span>Xem</span>
                  </RouterLink>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Phân trang -->
        <div
          v-if="pagination.totalPages > 1"
          class="card-footer bg-white border-top p-3 d-flex flex-wrap align-items-center justify-content-between gap-2"
        >
          <div class="small text-muted">
            Hiển thị trang <span class="fw-bold">{{ pagination.page }}</span> / {{ pagination.totalPages }}
            (Tổng cộng {{ pagination.total }} độc giả)
          </div>
          <AppPagination
            :current-page="pagination.page"
            :total-pages="pagination.totalPages"
            @change-page="onPageChange"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reader-table th {
  white-space: nowrap;
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
