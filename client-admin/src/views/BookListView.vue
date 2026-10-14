<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import axios from 'axios';
import { useAuthStore } from '../stores/auth.js';
import bookApi from '../api/book.api.js';
import publisherApi from '../api/publisher.api.js';
import { getErrorMessage } from '../api/http.js';
import { formatCurrency, getCoverUrl } from '../utils/format.js';
import AppPagination from '../components/AppPagination.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import EmptyState from '../components/EmptyState.vue';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import AppAlert from '../components/AppAlert.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

// Dữ liệu danh sách sách & NXB
const books = ref([]);
const publishers = ref([]);
const publisherTotalCount = ref(0);
const pagination = ref({
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 1,
});

const isLoading = ref(false);
const errorMessage = ref('');
const alertMessage = ref('');
const alertType = ref('success');

// Quản lý hủy request cũ chống race condition khi tìm kiếm nhanh
let activeAbortController = null;

// Quản lý debounce tìm kiếm 400ms
const searchInput = ref('');
let searchDebounceTimer = null;

// Modal xóa sách
const confirmModalRef = ref(null);
const bookToDelete = ref(null);
const isDeleting = ref(false);
const deleteErrorNotice = ref('');

// Theo dõi các ảnh bị lỗi để hiển thị placeholder
const brokenImages = ref(new Set());

const handleImageError = (maSach) => {
  brokenImages.value.add(maSach);
};

// Đọc query params từ URL (không dùng localStorage/sessionStorage)
const querySearch = computed(() => (route.query.search ? String(route.query.search).trim() : ''));
const queryMaNXB = computed(() => (route.query.maNXB ? String(route.query.maNXB).trim() : ''));
const queryTheLoai = computed(() => (route.query.theLoai ? String(route.query.theLoai).trim() : ''));
const queryDaXoa = computed(() => route.query.daXoa === 'true');
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

// Đồng bộ ô tìm kiếm với route.query (khi bấm nút Back/Forward)
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
 * Tải danh mục NXB phục vụ bộ lọc (giới hạn 100)
 */
const fetchPublishersList = async () => {
  try {
    const res = await publisherApi.list({ limit: 100, sort: 'TenNXB' });
    publishers.value = res.data?.data || [];
    publisherTotalCount.value = res.data?.meta?.total || publishers.value.length;
  } catch {
    // Không chặn luồng chính nếu nạp NXB lỗi
  }
};

/**
 * Nạp danh sách sách theo bộ lọc và phân trang hiện tại
 * Sử dụng AbortController để hủy các request đang chạy nếu người dùng thao tác liên tục
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
      daXoa: queryDaXoa.value ? true : undefined,
      page: queryPage.value,
      limit: 10,
      sort: querySort.value,
    };

    const response = await bookApi.list(params, { signal: activeAbortController.signal });
    const data = response.data;

    books.value = data?.data || [];
    if (data?.meta) {
      pagination.value = {
        page: data.meta.page || 1,
        limit: data.meta.limit || 10,
        total: data.meta.total || 0,
        totalPages: data.meta.totalPages || 1,
      };
    }
  } catch (error) {
    if (axios.isCancel(error) || error.name === 'CanceledError') {
      // Bị hủy bởi request mới, không báo lỗi
      return;
    }
    errorMessage.value = getErrorMessage(error);
  } finally {
    isLoading.value = false;
  }
};

// Lắng nghe thay đổi route.query để tự động fetch
watch(
  () => route.query,
  () => {
    fetchBooks();
  },
  { immediate: true }
);

onMounted(() => {
  fetchPublishersList();
  // Kiểm tra thông báo chuyển trang nếu có
  if (route.query.notice) {
    alertType.value = 'success';
    alertMessage.value = String(route.query.notice);
    // Xóa param notice khỏi URL để tránh hiển thị lại khi F5
    const cleanQuery = { ...route.query };
    delete cleanQuery.notice;
    router.replace({ query: cleanQuery });
  }
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
 * Xử lý nhập ô tìm kiếm (chờ 400ms sau khi ngừng gõ mới gọi API)
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
 * Cập nhật một hoặc nhiều tiêu chí lọc lên route.query (mọi thay đổi lọc đưa về trang 1)
 */
const updateFilter = (updates) => {
  const newQuery = { ...route.query, ...updates };

  // Xóa các khóa rỗng/undefined
  Object.keys(newQuery).forEach((key) => {
    if (newQuery[key] === undefined || newQuery[key] === '') {
      delete newQuery[key];
    }
  });

  router.push({ query: newQuery });
};

/**
 * Xóa toàn bộ bộ lọc
 */
const clearAllFilters = () => {
  searchInput.value = '';
  router.push({
    query: {},
  });
};

const hasActiveFilters = computed(() => {
  return Boolean(querySearch.value || queryMaNXB.value || queryTheLoai.value || queryDaXoa.value);
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

/**
 * Sắp xếp theo cột
 */
const handleSort = (field) => {
  const current = querySort.value;
  let nextSort = `-${field}`;

  if (current === `-${field}`) {
    nextSort = field;
  } else if (current === field) {
    nextSort = `-${field}`;
  }

  updateFilter({ sort: nextSort, page: 1 });
};

const getSortIcon = (field) => {
  const current = querySort.value;
  if (current === field) return 'bi-arrow-up text-primary fw-bold';
  if (current === `-${field}`) return 'bi-arrow-down text-primary fw-bold';
  return 'bi-arrow-down-up text-muted opacity-50';
};

/**
 * Thao tác Xóa (Chỉ role admin mới thấy nút xóa; backend kiểm tra bắt buộc qua middleware requireRole('admin'))
 */
const promptDelete = (book) => {
  deleteErrorNotice.value = '';
  bookToDelete.value = book;
  confirmModalRef.value?.show();
};

const handleConfirmDelete = async () => {
  if (!bookToDelete.value) return;

  isDeleting.value = true;
  deleteErrorNotice.value = '';

  try {
    const response = await bookApi.remove(bookToDelete.value.MaSach);
    confirmModalRef.value?.hide();
    alertType.value = 'success';
    alertMessage.value = response.data?.message || 'Xóa mềm sách thành công.';
    bookToDelete.value = null;
    fetchBooks();
  } catch (error) {
    const status = error.response?.status;
    const errorCode = error.response?.data?.error?.code;
    const msg = error.response?.data?.error?.message || getErrorMessage(error);

    // Lỗi 409 HAS_ACTIVE_BORROWINGS: còn phiếu mượn đang hoạt động
    if (status === 409 && errorCode === 'HAS_ACTIVE_BORROWINGS') {
      deleteErrorNotice.value = msg;
    } else {
      deleteErrorNotice.value = msg;
    }
  } finally {
    isDeleting.value = false;
  }
};

const handleCancelDelete = () => {
  bookToDelete.value = null;
  deleteErrorNotice.value = '';
};
</script>

<template>
  <div class="book-list-view">
    <!-- Tiêu đề trang & Nút thêm sách -->
    <div class="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3 mb-4">
      <div>
        <h1 class="h3 fw-bold mb-1 d-flex align-items-center gap-2">
          <i class="bi bi-book text-primary"></i>
          <span>Quản lý Sách</span>
        </h1>
        <p class="text-muted mb-0 small">
          Danh mục tất cả các đầu sách trong kho, số lượng còn lại và thao tác chỉnh sửa/xóa mềm.
        </p>
      </div>
      <div>
        <RouterLink
          to="/books/new"
          class="btn btn-primary d-flex align-items-center gap-2 text-nowrap shadow-sm"
        >
          <i class="bi bi-plus-lg"></i>
          <span>Thêm sách mới</span>
        </RouterLink>
      </div>
    </div>

    <!-- Thông báo kết quả thao tác -->
    <AppAlert
      v-if="alertMessage"
      :type="alertType"
      :message="alertMessage"
      @close="alertMessage = ''"
    />

    <!-- Thanh tìm kiếm & bộ lọc đa tiêu chí -->
    <div class="card shadow-sm border-0 mb-4">
      <div class="card-body p-3">
        <div class="row g-3">
          <!-- Ô tìm kiếm (Tên sách hoặc tác giả) -->
          <div class="col-12 col-md-4">
            <label class="form-label small text-muted mb-1">Tìm kiếm</label>
            <div class="input-group input-group-sm">
              <span class="input-group-text bg-white border-end-0 text-muted">
                <i class="bi bi-search"></i>
              </span>
              <input
                type="text"
                class="form-control border-start-0 ps-0"
                placeholder="Tên sách, tác giả/nguồn gốc..."
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
            <div class="d-flex justify-content-between align-items-center mb-1">
              <label class="form-label small text-muted mb-0">Nhà xuất bản</label>
              <span v-if="publisherTotalCount > 100" class="text-secondary" style="font-size: 0.7rem;">
                (tối đa 100 NXB)
              </span>
            </div>
            <select
              class="form-select form-select-sm"
              :value="queryMaNXB"
              @change="updateFilter({ maNXB: $event.target.value || undefined, page: 1 })"
            >
              <option value="">Tất cả nhà xuất bản</option>
              <option v-for="pub in publishers" :key="pub.MaNXB" :value="pub.MaNXB">
                {{ pub.TenNXB }} ({{ pub.MaNXB }})
              </option>
            </select>
          </div>

          <!-- Lọc theo Thể loại -->
          <div class="col-12 col-sm-6 col-md-2">
            <label class="form-label small text-muted mb-1">Thể loại</label>
            <input
              type="text"
              class="form-control form-control-sm"
              placeholder="Nhập thể loại..."
              :value="queryTheLoai"
              @change="updateFilter({ theLoai: $event.target.value.trim() || undefined, page: 1 })"
            />
          </div>

          <!-- Sắp xếp nhanh -->
          <div class="col-12 col-sm-6 col-md-3">
            <label class="form-label small text-muted mb-1">Sắp xếp theo</label>
            <select
              class="form-select form-select-sm"
              :value="querySort"
              @change="updateFilter({ sort: $event.target.value, page: 1 })"
            >
              <option value="-createdAt">Mới nhất trước</option>
              <option value="createdAt">Cũ nhất trước</option>
              <option value="TenSach">Tên sách (A-Z)</option>
              <option value="-TenSach">Tên sách (Z-A)</option>
              <option value="DonGia">Đơn giá tăng dần</option>
              <option value="-DonGia">Đơn giá giảm dần</option>
              <option value="SoQuyen">Tổng số quyển tăng dần</option>
              <option value="-SoQuyen">Tổng số quyển giảm dần</option>
              <option value="-NamXuatBan">Năm xuất bản mới nhất</option>
            </select>
          </div>
        </div>

        <!-- Dòng dưới: Switch Hiện sách đã xóa + Nút Xóa bộ lọc -->
        <div class="d-flex flex-wrap align-items-center justify-content-between pt-3 mt-3 border-top gap-2">
          <div class="form-check form-switch mb-0">
            <input
              id="switchDaXoa"
              class="form-check-input"
              type="checkbox"
              role="switch"
              :checked="queryDaXoa"
              @change="updateFilter({ daXoa: $event.target.checked ? 'true' : undefined, page: 1 })"
            />
            <label class="form-check-label small fw-medium text-dark" for="switchDaXoa">
              Hiện sách đã xóa mềm
            </label>
          </div>

          <div class="d-flex align-items-center gap-2">
            <button
              v-if="hasActiveFilters"
              type="button"
              class="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
              @click="clearAllFilters"
            >
              <i class="bi bi-arrow-counterclockwise"></i>
              <span>Xóa bộ lọc</span>
            </button>
            <span class="text-muted small">
              Tổng số: <strong class="text-dark">{{ pagination.total }}</strong> đầu sách
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Bảng dữ liệu / Trạng thái loading / Empty / Lỗi -->
    <div class="card shadow-sm border-0">
      <!-- Đang tải -->
      <LoadingSpinner v-if="isLoading" text="Đang nạp danh sách sách..." />

      <!-- Lỗi tải dữ liệu -->
      <div v-else-if="errorMessage" class="card-body py-5 text-center">
        <div class="text-danger mb-3">
          <i class="bi bi-exclamation-triangle" style="font-size: 3rem;"></i>
        </div>
        <h5 class="fw-bold mb-2">Không thể tải danh sách sách</h5>
        <p class="text-secondary small mb-3" style="white-space: pre-line;">{{ errorMessage }}</p>
        <button type="button" class="btn btn-outline-primary btn-sm" @click="fetchBooks">
          <i class="bi bi-arrow-clockwise me-1"></i> Thử lại
        </button>
      </div>

      <!-- Danh sách rỗng -->
      <EmptyState
        v-else-if="books.length === 0"
        :title="hasActiveFilters ? 'Không tìm thấy sách phù hợp' : 'Chưa có đầu sách nào'"
        :message="hasActiveFilters ? 'Không có sách nào khớp với các điều kiện lọc hiện tại của bạn.' : 'Thư viện hiện chưa có đầu sách nào. Hãy thêm cuốn sách đầu tiên!'"
        :action-text="hasActiveFilters ? 'Xóa toàn bộ bộ lọc' : 'Thêm sách mới'"
        @action="hasActiveFilters ? clearAllFilters() : router.push('/books/new')"
      />

      <!-- Bảng sách có dữ liệu -->
      <div v-else class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light border-bottom text-secondary small text-uppercase">
            <tr>
              <th scope="col" style="width: 70px;" class="text-center">Bìa</th>
              <th scope="col" style="width: 110px; cursor: pointer;" @click="handleSort('MaSach')">
                <div class="d-flex align-items-center gap-1">
                  <span>Mã sách</span>
                  <i class="bi" :class="getSortIcon('MaSach')"></i>
                </div>
              </th>
              <th scope="col" style="cursor: pointer;" @click="handleSort('TenSach')">
                <div class="d-flex align-items-center gap-1">
                  <span>Tên sách / Tác giả</span>
                  <i class="bi" :class="getSortIcon('TenSach')"></i>
                </div>
              </th>
              <th scope="col">Nhà xuất bản</th>
              <th scope="col" style="width: 130px; cursor: pointer;" @click="handleSort('DonGia')">
                <div class="d-flex align-items-center gap-1">
                  <span>Đơn giá</span>
                  <i class="bi" :class="getSortIcon('DonGia')"></i>
                </div>
              </th>
              <th scope="col" style="width: 140px; cursor: pointer;" class="text-center" @click="handleSort('SoQuyen')">
                <div class="d-flex align-items-center justify-content-center gap-1">
                  <span>Còn lại / Tổng</span>
                  <i class="bi" :class="getSortIcon('SoQuyen')"></i>
                </div>
              </th>
              <th scope="col" style="width: 100px; cursor: pointer;" class="text-center" @click="handleSort('NamXuatBan')">
                <div class="d-flex align-items-center justify-content-center gap-1">
                  <span>Năm XB</span>
                  <i class="bi" :class="getSortIcon('NamXuatBan')"></i>
                </div>
              </th>
              <th scope="col" style="width: 140px;" class="text-end pe-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="book in books"
              :key="book.MaSach"
              :class="{ 'table-secondary opacity-75': book.DaXoa }"
            >
              <!-- Ảnh bìa thu nhỏ kèm placeholder dự phòng -->
              <td class="text-center">
                <div class="book-cover-thumb mx-auto">
                  <img
                    v-if="getCoverUrl(book.AnhBia) && !brokenImages.has(book.MaSach)"
                    :src="getCoverUrl(book.AnhBia)"
                    :alt="'Bìa sách ' + book.TenSach"
                    class="rounded border shadow-2xs"
                    @error="handleImageError(book.MaSach)"
                  />
                  <!-- Fallback ảnh thay thế inline bằng Bootstrap Icons -->
                  <div
                    v-else
                    class="book-cover-placeholder rounded border bg-light d-flex align-items-center justify-content-center text-muted"
                    :title="'Không có ảnh bìa: ' + book.TenSach"
                  >
                    <i class="bi bi-book fs-5"></i>
                  </div>
                </div>
              </td>

              <!-- Mã sách -->
              <td>
                <span class="badge bg-light text-dark border font-monospace px-2 py-1">
                  {{ book.MaSach }}
                </span>
                <div v-if="book.DaXoa" class="mt-1">
                  <span class="badge bg-secondary" style="font-size: 0.65rem;">
                    Đã xóa
                  </span>
                </div>
              </td>

              <!-- Tên sách & tác giả -->
              <td>
                <div class="fw-semibold text-dark text-break">
                  {{ book.TenSach }}
                </div>
                <div class="text-muted small mt-1 d-flex align-items-center gap-2">
                  <span><i class="bi bi-person me-1"></i>{{ book.NguonGocTacGia }}</span>
                  <span v-if="book.TheLoai" class="badge bg-light text-secondary border">
                    {{ book.TheLoai }}
                  </span>
                </div>
              </td>

              <!-- Nhà xuất bản -->
              <td class="small">
                <span v-if="book.TenNXB" class="fw-medium text-dark">{{ book.TenNXB }}</span>
                <span v-else class="text-muted font-monospace">{{ book.MaNXB }}</span>
              </td>

              <!-- Đơn giá -->
              <td class="fw-medium text-nowrap">
                {{ formatCurrency(book.DonGia) }}
              </td>

              <!-- Còn lại / Tổng số quyển -->
              <td class="text-center text-nowrap">
                <div class="d-inline-flex flex-column align-items-center">
                  <span
                    class="badge rounded-pill px-2 py-1"
                    :class="book.SoQuyenConLai === 0 ? 'bg-danger text-white' : 'bg-success-subtle text-success border border-success-subtle'"
                  >
                    {{ book.SoQuyenConLai }} / {{ book.SoQuyen }}
                  </span>
                  <span
                    v-if="book.SoQuyenConLai === 0"
                    class="text-danger fw-bold mt-1"
                    style="font-size: 0.65rem;"
                  >
                    Hết sách
                  </span>
                </div>
              </td>

              <!-- Năm xuất bản -->
              <td class="text-center text-secondary small">
                {{ book.NamXuatBan || '—' }}
              </td>

              <!-- Cột thao tác: Xem, Sửa, Xóa -->
              <td class="text-end pe-3 text-nowrap">
                <!-- Khi sách đã xóa mềm: ẩn Sửa và Xóa, chỉ có nút Xem -->
                <template v-if="book.DaXoa">
                  <RouterLink
                    :to="`/books/${book.MaSach}/edit`"
                    class="btn btn-outline-secondary btn-sm"
                    title="Xem chi tiết sách đã xóa"
                  >
                    <i class="bi bi-eye"></i>
                    <span class="d-none d-lg-inline ms-1">Xem</span>
                  </RouterLink>
                </template>

                <!-- Khi sách đang hoạt động -->
                <template v-else>
                  <div class="btn-group btn-group-sm" role="group">
                    <RouterLink
                      :to="`/books/${book.MaSach}/edit`"
                      class="btn btn-outline-secondary"
                      title="Chỉnh sửa thông tin sách"
                    >
                      <i class="bi bi-pencil"></i>
                      <span class="d-none d-lg-inline ms-1">Sửa</span>
                    </RouterLink>

                    <!--
                      Chỉ hiển thị nút Xóa cho vai trò admin (UX).
                      Quyền thực tế được kiểm tra tại backend qua middleware requireRole('admin').
                    -->
                    <button
                      v-if="authStore.isAdmin"
                      type="button"
                      class="btn btn-outline-danger"
                      title="Xóa mềm sách (Chỉ Admin)"
                      @click="promptDelete(book)"
                    >
                      <i class="bi bi-trash"></i>
                      <span class="d-none d-lg-inline ms-1">Xóa</span>
                    </button>
                  </div>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Phân trang -->
      <div
        v-if="pagination.totalPages > 1"
        class="card-footer bg-white border-top p-3 d-flex flex-column flex-sm-row justify-content-between align-items-center gap-2"
      >
        <div class="text-muted small">
          Trang <strong>{{ pagination.page }}</strong> / {{ pagination.totalPages }} (Tổng số {{ pagination.total }} đầu sách)
        </div>
        <AppPagination
          :current-page="pagination.page"
          :total-pages="pagination.totalPages"
          @change-page="handlePageChange"
        />
      </div>
    </div>

    <!-- Modal xác nhận xóa sách -->
    <ConfirmModal
      ref="confirmModalRef"
      title="Xác nhận xóa mềm sách"
      :message="bookToDelete ? `Bạn có chắc chắn muốn xóa mềm cuốn sách '${bookToDelete.TenSach}' (${bookToDelete.MaSach}) không?\nSách sau khi xóa sẽ không thể mượn hay chỉnh sửa.` : ''"
      confirm-text="Xóa sách"
      confirm-btn-class="btn-danger"
      :is-processing="isDeleting"
      @confirm="handleConfirmDelete"
      @cancel="handleCancelDelete"
    >
      <template #extra>
        <div v-if="deleteErrorNotice" class="alert alert-danger py-2 px-3 small mt-3 mb-0">
          <i class="bi bi-exclamation-octagon-fill me-1"></i>
          <span style="white-space: pre-line;">{{ deleteErrorNotice }}</span>
        </div>
      </template>
    </ConfirmModal>
  </div>
</template>

<style scoped>
.book-cover-thumb {
  width: 44px;
  height: 60px;
}

.book-cover-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.book-cover-placeholder {
  width: 100%;
  height: 100%;
}

.table th,
.table td {
  padding-top: 0.75rem;
  padding-bottom: 0.75rem;
}
</style>
