<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import axios from 'axios';
import { useAuthStore } from '../stores/auth.js';
import bookApi from '../api/book.api.js';
import publisherApi from '../api/publisher.api.js';
import { getErrorMessage } from '../api/http.js';
import BookCard from '../components/BookCard.vue';
import AppPagination from '../components/AppPagination.vue';
import EmptyState from '../components/EmptyState.vue';
import LoadingSpinner from '../components/LoadingSpinner.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

// Dữ liệu danh sách sách và nhà xuất bản
const books = ref([]);
const publishers = ref([]);
const pagination = ref({
  page: 1,
  limit: 12,
  total: 0,
  totalPages: 1,
});

// Chế độ xem: 'grid' (lưới) hoặc 'list' (danh sách)
const viewLayout = ref('grid');

// Trạng thái tải và lỗi
const isLoading = ref(false);
const errorMessage = ref('');

// Quản lý debounce tìm kiếm 400ms
const searchInput = ref('');
let searchDebounceTimer = null;
let activeAbortController = null;

// Đọc tham số từ URL route.query (không dùng localStorage/sessionStorage)
const querySearch = computed(() => (route.query.search ? String(route.query.search).trim() : ''));
const queryMaNXB = computed(() => (route.query.maNXB ? String(route.query.maNXB).trim() : ''));
const queryTheLoai = computed(() => (route.query.theLoai ? String(route.query.theLoai).trim() : ''));
const queryNamXB = computed(() => (route.query.namXuatBan ? String(route.query.namXuatBan).trim() : ''));
const queryConSach = computed(() => route.query.conSach === 'true');
const queryPage = computed(() => Math.max(1, parseInt(route.query.page, 10) || 1));
const querySort = computed(() => {
  const allowed = [
    'MaSach',
    '-MaSach',
    'TenSach',
    '-TenSach',
    'DonGia',
    '-DonGia',
    'SoQuyen',
    '-SoQuyen',
    'NamXuatBan',
    '-NamXuatBan',
    'createdAt',
    '-createdAt',
  ];
  return allowed.includes(route.query.sort) ? route.query.sort : '-createdAt';
});

// Đồng bộ ô tìm kiếm với URL khi người dùng nhấn nút Back/Forward
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
 * Tải danh mục NXB phục vụ bộ lọc
 */
const loadPublishers = async () => {
  try {
    const res = await publisherApi.list();
    publishers.value = res.data?.data || [];
  } catch {
    // Không chặn luồng chính nếu nạp NXB lỗi
  }
};

/**
 * Nạp danh sách sách theo các tiêu chí lọc
 */
const fetchBooks = async () => {
  if (activeAbortController) {
    activeAbortController.abort();
  }
  activeAbortController = new AbortController();

  isLoading.value = true;
  errorMessage.value = '';

  try {
    const params = {
      search: querySearch.value || undefined,
      maNXB: queryMaNXB.value || undefined,
      theLoai: queryTheLoai.value || undefined,
      namXuatBan: queryNamXB.value || undefined,
      conSach: queryConSach.value ? true : undefined,
      page: queryPage.value,
      limit: pagination.value.limit,
      sort: querySort.value,
    };

    const response = await bookApi.list(params, { signal: activeAbortController.signal });
    const data = response.data;

    books.value = data?.data || [];
    if (data?.meta) {
      pagination.value = {
        page: data.meta.page || 1,
        limit: data.meta.limit || 12,
        total: data.meta.total || 0,
        totalPages: data.meta.totalPages || 1,
      };
    }
  } catch (error) {
    if (axios.isCancel(error) || error.name === 'CanceledError') {
      return;
    }
    errorMessage.value = getErrorMessage(error);
  } finally {
    isLoading.value = false;
  }
};

// Theo dõi thay đổi của route.query để tự động fetch lại
watch(
  () => route.query,
  () => {
    fetchBooks();
  },
  { immediate: true }
);

onMounted(() => {
  loadPublishers();
});

onUnmounted(() => {
  if (activeAbortController) {
    activeAbortController.abort();
  }
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
});

/**
 * Nhập từ khóa tìm kiếm (debounced 400ms)
 */
const handleSearchInput = (e) => {
  const val = e.target.value;
  searchInput.value = val;

  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }

  searchDebounceTimer = setTimeout(() => {
    updateFilter({ search: val.trim() || undefined, page: 1 });
  }, 400);
};

const clearSearch = () => {
  searchInput.value = '';
  updateFilter({ search: undefined, page: 1 });
};

/**
 * Cập nhật bộ lọc lên route.query
 */
const updateFilter = (updates) => {
  const newQuery = { ...route.query, ...updates };

  Object.keys(newQuery).forEach((key) => {
    if (newQuery[key] === undefined || newQuery[key] === '') {
      delete newQuery[key];
    }
  });

  router.push({ query: newQuery });
};

const clearAllFilters = () => {
  searchInput.value = '';
  router.push({ query: {} });
};

const hasActiveFilters = computed(() => {
  return Boolean(
    querySearch.value ||
    queryMaNXB.value ||
    queryTheLoai.value ||
    queryNamXB.value ||
    queryConSach.value
  );
});

/**
 * Đổi trang
 */
const handlePageChange = (newPage) => {
  if (newPage === queryPage.value) return;
  router.push({
    query: {
      ...route.query,
      page: newPage,
    },
  });
};
</script>

<template>
  <div class="home-view">
    <!-- Hero banner & Lời chào độc giả -->
    <div
      v-if="authStore.isAuthenticated"
      class="card border-0 shadow-sm bg-primary bg-opacity-10 rounded-4 mb-4"
    >
      <div class="card-body p-4 d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
        <div class="d-flex align-items-center gap-3">
          <div class="p-3 bg-primary text-white rounded-circle shadow-sm">
            <i class="bi bi-person-fill fs-3"></i>
          </div>
          <div>
            <h2 class="h5 fw-bold text-dark mb-1">
              Xin chào, {{ authStore.fullName || 'Độc giả' }}!
            </h2>
            <p class="text-muted small mb-0">
              Mã độc giả: <span class="fw-semibold text-primary font-monospace">{{ authStore.user?.MaDocGia }}</span> |
              Email: <span>{{ authStore.user?.Email }}</span>
            </p>
          </div>
        </div>
        <div class="d-flex align-items-center gap-2">
          <RouterLink to="/my-borrowings" class="btn btn-primary btn-sm px-3 rounded-pill shadow-sm">
            <i class="bi bi-journal-check me-1"></i> Xem lịch sử mượn
          </RouterLink>
          <RouterLink to="/profile" class="btn btn-outline-primary btn-sm px-3 rounded-pill">
            <i class="bi bi-person-circle me-1"></i> Hồ sơ cá nhân
          </RouterLink>
        </div>
      </div>
    </div>

    <!-- Banner giới thiệu thư viện khi chưa đăng nhập -->
    <div v-else class="card border-0 shadow-sm bg-gradient text-bg-primary rounded-4 mb-4 overflow-hidden">
      <div class="card-body p-4 p-md-5 text-center text-md-start">
        <div class="row align-items-center">
          <div class="col-12 col-md-8">
            <h1 class="display-6 fw-bold mb-2">Thư Viện Số Trực Tuyến</h1>
            <p class="lead mb-3 text-white-50 fs-6">
              Tra cứu hàng trăm đầu sách phong phú, đăng ký mượn sách trực tuyến nhanh chóng và thuận tiện.
            </p>
            <div class="d-flex flex-wrap gap-2">
              <RouterLink to="/login" class="btn btn-light text-primary fw-semibold px-4 rounded-pill shadow-sm">
                <i class="bi bi-box-arrow-in-right me-1"></i> Đăng nhập ngay
              </RouterLink>
              <RouterLink to="/register" class="btn btn-outline-light px-4 rounded-pill">
                <i class="bi bi-person-plus me-1"></i> Đăng ký tài khoản
              </RouterLink>
            </div>
          </div>
          <div class="col-12 col-md-4 d-none d-md-block text-center">
            <i class="bi bi-book-half" style="font-size: 6rem; opacity: 0.85;"></i>
          </div>
        </div>
      </div>
    </div>

    <!-- Thanh tìm kiếm & bộ lọc đa tiêu chí -->
    <div class="card shadow-sm border-0 rounded-4 mb-4">
      <div class="card-body p-3 p-md-4">
        <div class="row g-3">
          <!-- Ô tìm kiếm -->
          <div class="col-12 col-md-5">
            <label class="form-label small fw-semibold text-secondary mb-1">
              Tìm kiếm sách
            </label>
            <div class="input-group">
              <span class="input-group-text bg-white border-end-0 text-muted">
                <i class="bi bi-search"></i>
              </span>
              <input
                type="text"
                class="form-control border-start-0 ps-0"
                placeholder="Nhập tên sách, tác giả hoặc mã sách..."
                :value="searchInput"
                @input="handleSearchInput"
              />
              <button
                v-if="searchInput"
                type="button"
                class="btn btn-outline-secondary border-start-0"
                aria-label="Xóa từ khóa"
                @click="clearSearch"
              >
                <i class="bi bi-x-lg"></i>
              </button>
            </div>
          </div>

          <!-- Lọc theo Nhà xuất bản -->
          <div class="col-12 col-sm-6 col-md-3">
            <label class="form-label small fw-semibold text-secondary mb-1">
              Nhà xuất bản
            </label>
            <select
              class="form-select"
              :value="queryMaNXB"
              @change="updateFilter({ maNXB: $event.target.value || undefined, page: 1 })"
            >
              <option value="">Tất cả nhà xuất bản</option>
              <option v-for="pub in publishers" :key="pub.MaNXB" :value="pub.MaNXB">
                {{ pub.TenNXB }}
              </option>
            </select>
          </div>

          <!-- Lọc theo Thể loại -->
          <div class="col-12 col-sm-6 col-md-2">
            <label class="form-label small fw-semibold text-secondary mb-1">
              Thể loại
            </label>
            <input
              type="text"
              class="form-control"
              placeholder="Ví dụ: Công nghệ..."
              :value="queryTheLoai"
              @change="updateFilter({ theLoai: $event.target.value.trim() || undefined, page: 1 })"
            />
          </div>

          <!-- Lọc theo Năm xuất bản -->
          <div class="col-12 col-sm-6 col-md-2">
            <label class="form-label small fw-semibold text-secondary mb-1">
              Năm XB
            </label>
            <input
              type="number"
              class="form-control"
              placeholder="Ví dụ: 2024"
              :value="queryNamXB"
              @change="updateFilter({ namXuatBan: $event.target.value || undefined, page: 1 })"
            />
          </div>
        </div>

        <!-- Dòng dưới: Switch còn sách, Sắp xếp, Chế độ xem & Nút xóa lọc -->
        <div class="d-flex flex-wrap align-items-center justify-content-between pt-3 mt-3 border-top gap-2">
          <!-- Switch chỉ hiện sách còn trong kho -->
          <div class="form-check form-switch mb-0">
            <input
              id="switchConSach"
              class="form-check-input"
              type="checkbox"
              role="switch"
              :checked="queryConSach"
              @change="updateFilter({ conSach: $event.target.checked ? 'true' : undefined, page: 1 })"
            />
            <label class="form-check-label small fw-medium text-dark" for="switchConSach">
              Chỉ hiện sách còn trong kho
            </label>
          </div>

          <div class="d-flex flex-wrap align-items-center gap-3 ms-auto">
            <!-- Sắp xếp -->
            <div class="d-flex align-items-center gap-2">
              <label class="small text-muted text-nowrap mb-0">Sắp xếp:</label>
              <select
                class="form-select form-select-sm"
                style="width: 175px;"
                :value="querySort"
                @change="updateFilter({ sort: $event.target.value, page: 1 })"
              >
                <option value="-createdAt">Mới nhất trước</option>
                <option value="createdAt">Cũ nhất trước</option>
                <option value="TenSach">Tên sách (A-Z)</option>
                <option value="-TenSach">Tên sách (Z-A)</option>
                <option value="DonGia">Đơn giá tăng dần</option>
                <option value="-DonGia">Đơn giá giảm dần</option>
                <option value="-NamXuatBan">Năm xuất bản mới</option>
              </select>
            </div>

            <!-- Nút chuyển chế độ xem: Lưới / Danh sách -->
            <div class="btn-group btn-group-sm" role="group" aria-label="Chế độ xem">
              <button
                type="button"
                class="btn"
                :class="viewLayout === 'grid' ? 'btn-primary' : 'btn-outline-secondary'"
                title="Xem dạng lưới thẻ"
                @click="viewLayout = 'grid'"
              >
                <i class="bi bi-grid-3x3-gap-fill"></i>
              </button>
              <button
                type="button"
                class="btn"
                :class="viewLayout === 'list' ? 'btn-primary' : 'btn-outline-secondary'"
                title="Xem dạng danh sách"
                @click="viewLayout = 'list'"
              >
                <i class="bi bi-list-ul"></i>
              </button>
            </div>

            <!-- Nút xóa bộ lọc -->
            <button
              v-if="hasActiveFilters"
              type="button"
              class="btn btn-outline-secondary btn-sm rounded-pill d-flex align-items-center gap-1"
              @click="clearAllFilters"
            >
              <i class="bi bi-arrow-counterclockwise"></i>
              <span>Xóa lọc</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Thông tin số lượng & Tiêu đề danh sách -->
    <div class="d-flex align-items-center justify-content-between mb-3 px-1">
      <h2 class="h5 fw-bold mb-0 text-dark d-flex align-items-center gap-2">
        <i class="bi bi-journal-album text-primary"></i>
        <span>Danh mục sách</span>
      </h2>
      <span class="text-muted small">
        Tìm thấy <strong class="text-dark">{{ pagination.total }}</strong> cuốn sách
      </span>
    </div>

    <!-- Khu vực hiển thị danh sách sách -->
    <div>
      <!-- Trạng thái đang tải -->
      <LoadingSpinner v-if="isLoading" text="Đang tìm kiếm sách..." />

      <!-- Trạng thái lỗi tải dữ liệu -->
      <div v-else-if="errorMessage" class="card shadow-sm border-0 rounded-4 py-5 text-center">
        <div class="card-body">
          <div class="text-danger mb-3">
            <i class="bi bi-exclamation-triangle" style="font-size: 3rem;"></i>
          </div>
          <h5 class="fw-bold mb-2">Không thể tải danh mục sách</h5>
          <p class="text-secondary small mb-3" style="white-space: pre-line;">{{ errorMessage }}</p>
          <button type="button" class="btn btn-outline-primary btn-sm px-3 rounded-pill" @click="fetchBooks">
            <i class="bi bi-arrow-clockwise me-1"></i> Thử lại
          </button>
        </div>
      </div>

      <!-- Trạng thái danh sách rỗng -->
      <EmptyState
        v-else-if="books.length === 0"
        :title="hasActiveFilters ? 'Không tìm thấy sách phù hợp' : 'Chưa có sách nào'"
        :message="hasActiveFilters ? 'Không có cuốn sách nào khớp với các tiêu chí tìm kiếm hoặc bộ lọc hiện tại của bạn.' : 'Thư viện hiện chưa có đầu sách nào được xuất bản.'"
        :action-text="hasActiveFilters ? 'Xóa toàn bộ bộ lọc' : ''"
        @action="clearAllFilters"
      />

      <!-- Hiển thị danh sách khi có dữ liệu -->
      <div v-else>
        <!-- Chế độ Lưới (Grid) -->
        <div v-if="viewLayout === 'grid'" class="row row-cols-1 row-cols-sm-2 row-cols-md-3 row-cols-lg-4 g-4">
          <div v-for="book in books" :key="book.MaSach" class="col">
            <BookCard :book="book" layout="grid" />
          </div>
        </div>

        <!-- Chế độ Danh sách (List) -->
        <div v-else>
          <div v-for="book in books" :key="book.MaSach">
            <BookCard :book="book" layout="list" />
          </div>
        </div>

        <!-- Phân trang -->
        <div
          v-if="pagination.totalPages > 1"
          class="card border-0 shadow-sm rounded-4 p-3 mt-4 d-flex flex-column flex-sm-row justify-content-between align-items-center gap-2"
        >
          <div class="text-muted small">
            Trang <strong>{{ pagination.page }}</strong> / {{ pagination.totalPages }} (Tổng số {{ pagination.total }} cuốn sách)
          </div>
          <AppPagination
            :current-page="pagination.page"
            :total-pages="pagination.totalPages"
            @change-page="handlePageChange"
          />
        </div>
      </div>
    </div>
  </div>
</template>
