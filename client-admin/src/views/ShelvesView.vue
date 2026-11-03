<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import shelfApi from '../api/shelf.api.js';
import { getErrorMessage } from '../api/http.js';
import { formatDate } from '../utils/format.js';
import AppPagination from '../components/AppPagination.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import EmptyState from '../components/EmptyState.vue';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import AppAlert from '../components/AppAlert.vue';
import ShelfFormModal from '../components/ShelfFormModal.vue';

const route = useRoute();
const router = useRouter();

// Trạng thái dữ liệu
const shelves = ref([]);
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

// Tìm kiếm cục bộ (debounced 400ms)
const searchInput = ref('');
let searchDebounceTimer = null;

// Modal components
const formModalRef = ref(null);
const confirmModalRef = ref(null);
const shelfToDelete = ref(null);
const isDeleting = ref(false);
const deleteErrorNotice = ref('');

// Đọc các giá trị từ route.query
const querySearch = computed(() => (route.query.search ? String(route.query.search).trim() : ''));
const queryKhuVuc = computed(() => (route.query.khuVuc ? String(route.query.khuVuc).trim() : ''));
const queryPage = computed(() => Math.max(1, parseInt(route.query.page, 10) || 1));
const querySort = computed(() => {
  const allowed = [
    'MaKe',
    '-MaKe',
    'TenKe',
    '-TenKe',
    'KhuVuc',
    '-KhuVuc',
    'SoNgan',
    '-SoNgan',
    'createdAt',
    '-createdAt',
  ];
  return allowed.includes(route.query.sort) ? route.query.sort : '-createdAt';
});

// Đồng bộ searchInput với route.query
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
 * Gọi API nạp danh sách kệ sách
 */
const fetchShelves = async () => {
  isLoading.value = true;
  errorMessage.value = '';

  try {
    const params = {
      search: querySearch.value || undefined,
      khuVuc: queryKhuVuc.value || undefined,
      page: queryPage.value,
      limit: 10,
      sort: querySort.value,
    };

    const response = await shelfApi.list(params);
    const data = response.data;
    shelves.value = data.data || [];
    if (data.meta) {
      pagination.value = {
        page: data.meta.page || 1,
        limit: data.meta.limit || 10,
        total: data.meta.total || 0,
        totalPages: data.meta.totalPages || 1,
      };
    }
  } catch (err) {
    errorMessage.value = getErrorMessage(err);
    shelves.value = [];
  } finally {
    isLoading.value = false;
  }
};

const updateQuery = (newParams) => {
  const currentQuery = { ...route.query };
  const merged = { ...currentQuery, ...newParams };

  Object.keys(merged).forEach((key) => {
    if (merged[key] === undefined || merged[key] === '' || merged[key] === null) {
      delete merged[key];
    }
  });

  router.push({ query: merged });
};

watch(
  () => route.query,
  () => {
    fetchShelves();
  }
);

const handleSearchInput = (e) => {
  const value = e.target.value;
  searchInput.value = value;

  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }

  searchDebounceTimer = setTimeout(() => {
    updateQuery({
      search: value.trim() || undefined,
      page: 1,
    });
  }, 400);
};

const handleClearSearch = () => {
  searchInput.value = '';
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
  updateQuery({
    search: undefined,
    page: 1,
  });
};

const handleSort = (field) => {
  let nextSort = field;
  if (querySort.value === field) {
    nextSort = `-${field}`;
  } else if (querySort.value === `-${field}`) {
    nextSort = field;
  }
  updateQuery({ sort: nextSort, page: 1 });
};

const getSortIcon = (field) => {
  if (querySort.value === field) return 'bi-sort-alpha-down text-primary';
  if (querySort.value === `-${field}`) return 'bi-sort-alpha-up-alt text-primary';
  return 'bi-arrow-down-up text-muted opacity-50';
};

const handlePageChange = (newPage) => {
  updateQuery({ page: newPage });
};

const handleOpenCreate = () => {
  formModalRef.value?.openCreate();
};

const handleOpenEdit = (shelf) => {
  formModalRef.value?.openEdit(shelf);
};

const handleSaved = ({ message }) => {
  alertMessage.value = message;
  alertType.value = 'success';
  fetchShelves();
};

const handleOpenDelete = (shelf) => {
  shelfToDelete.value = shelf;
  deleteErrorNotice.value = '';
  confirmModalRef.value?.show();
};

const handleConfirmDelete = async () => {
  if (!shelfToDelete.value) return;

  isDeleting.value = true;
  deleteErrorNotice.value = '';

  try {
    await shelfApi.remove(shelfToDelete.value.MaKe);
    confirmModalRef.value?.hide();
    alertMessage.value = `Đã xóa thành công kệ sách "${shelfToDelete.value.TenKe}".`;
    alertType.value = 'success';

    if (shelves.value.length === 1 && pagination.value.page > 1) {
      updateQuery({ page: pagination.value.page - 1 });
    } else {
      fetchShelves();
    }
  } catch (err) {
    deleteErrorNotice.value = getErrorMessage(err);
  } finally {
    isDeleting.value = false;
  }
};

onMounted(() => {
  fetchShelves();
});

onUnmounted(() => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
});
</script>

<template>
  <div class="shelves-view container-fluid py-4 px-md-4">
    <!-- Tiêu đề và nút Thêm mới -->
    <div class="d-flex flex-column flex-md-row md-align-items-center justify-content-between gap-3 mb-4">
      <div>
        <div class="d-flex align-items-center gap-2 mb-1">
          <h2 class="h3 fw-bold text-dark mb-0">Quản lý Kệ sách</h2>
          <span v-if="!isLoading && pagination.total > 0" class="badge bg-secondary-subtle text-secondary border">
            {{ pagination.total }} kệ
          </span>
        </div>
        <p class="text-secondary mb-0 small">
          Theo dõi và sắp xếp vị trí kệ sách, khu vực lưu trữ trong thư viện
        </p>
      </div>

      <div class="d-flex align-items-center gap-2">
        <button
          type="button"
          class="btn btn-primary d-flex align-items-center gap-2 shadow-sm"
          @click="handleOpenCreate"
        >
          <i class="bi bi-plus-lg"></i>
          <span>Thêm Kệ sách mới</span>
        </button>
      </div>
    </div>

    <!-- Alert thông báo -->
    <AppAlert
      v-if="alertMessage"
      :type="alertType"
      :message="alertMessage"
      dismissible
      class="mb-3"
      @dismiss="alertMessage = ''"
    />

    <!-- Thanh tìm kiếm & bộ lọc -->
    <div class="card border-0 shadow-sm rounded-4 mb-4">
      <div class="card-body p-3">
        <div class="row g-2 align-items-center">
          <!-- Ô tìm kiếm -->
          <div class="col-12 col-md-6 col-lg-5">
            <div class="input-group">
              <span class="input-group-text bg-white border-end-0 text-muted">
                <i class="bi bi-search"></i>
              </span>
              <input
                type="text"
                class="form-control border-start-0 ps-0"
                placeholder="Tìm theo tên kệ, mã kệ, khu vực..."
                :value="searchInput"
                @input="handleSearchInput"
              />
              <button
                v-if="searchInput"
                class="btn btn-outline-secondary border-start-0 border-end"
                type="button"
                @click="handleClearSearch"
                title="Xóa tìm kiếm"
              >
                <i class="bi bi-x-lg"></i>
              </button>
            </div>
          </div>

          <!-- Sắp xếp nhanh -->
          <div class="col-12 col-sm-6 col-md-4 col-lg-3 ms-auto">
            <select
              class="form-select"
              :value="querySort"
              @change="updateQuery({ sort: $event.target.value, page: 1 })"
            >
              <option value="-createdAt">Mới tạo gần đây</option>
              <option value="createdAt">Cũ nhất trước</option>
              <option value="TenKe">Tên kệ (A-Z)</option>
              <option value="-TenKe">Tên kệ (Z-A)</option>
              <option value="KhuVuc">Khu vực (A-Z)</option>
              <option value="SoNgan">Số ngăn (Ít đến nhiều)</option>
              <option value="-SoNgan">Số ngăn (Nhiều đến ít)</option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <!-- Bảng danh sách kệ sách -->
    <div class="card border-0 shadow-sm rounded-4 overflow-hidden mb-4">
      <div v-if="isLoading" class="p-5 text-center">
        <LoadingSpinner message="Đang tải danh sách kệ sách..." />
      </div>

      <div v-else-if="errorMessage" class="p-4">
        <div class="alert alert-danger mb-0 d-flex align-items-center justify-content-between">
          <div class="d-flex align-items-center gap-2">
            <i class="bi bi-exclamation-octagon-fill fs-5"></i>
            <span>{{ errorMessage }}</span>
          </div>
          <button class="btn btn-sm btn-outline-danger" @click="fetchShelves">
            Thử lại
          </button>
        </div>
      </div>

      <div v-else-if="shelves.length === 0" class="p-5">
        <EmptyState
          icon="bi-bookshelf"
          title="Không tìm thấy kệ sách nào"
          :description="
            querySearch
              ? `Không có kệ sách nào phù hợp với từ khóa &quot;${querySearch}&quot;.`
              : 'Hiện chưa có kệ sách nào trong hệ thống. Hãy tạo kệ sách đầu tiên.'
          "
        >
          <template #action>
            <button
              v-if="querySearch"
              type="button"
              class="btn btn-outline-secondary me-2"
              @click="handleClearSearch"
            >
              Xóa tìm kiếm
            </button>
            <button
              type="button"
              class="btn btn-primary"
              @click="handleOpenCreate"
            >
              <i class="bi bi-plus-lg me-1"></i> Thêm kệ sách
            </button>
          </template>
        </EmptyState>
      </div>

      <div v-else class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light border-bottom text-secondary small text-uppercase">
            <tr>
              <th scope="col" style="width: 120px;" class="ps-3 cursor-pointer" @click="handleSort('MaKe')">
                <div class="d-flex align-items-center gap-1">
                  <span>Mã kệ</span>
                  <i class="bi" :class="getSortIcon('MaKe')"></i>
                </div>
              </th>
              <th scope="col" class="cursor-pointer" @click="handleSort('TenKe')">
                <div class="d-flex align-items-center gap-1">
                  <span>Tên kệ sách</span>
                  <i class="bi" :class="getSortIcon('TenKe')"></i>
                </div>
              </th>
              <th scope="col" class="cursor-pointer" @click="handleSort('KhuVuc')">
                <div class="d-flex align-items-center gap-1">
                  <span>Khu vực / Tầng</span>
                  <i class="bi" :class="getSortIcon('KhuVuc')"></i>
                </div>
              </th>
              <th scope="col" style="width: 120px;" class="text-center cursor-pointer" @click="handleSort('SoNgan')">
                <div class="d-flex align-items-center justify-content-center gap-1">
                  <span>Số ngăn</span>
                  <i class="bi" :class="getSortIcon('SoNgan')"></i>
                </div>
              </th>
              <th scope="col" style="width: 140px;" class="text-center">
                <span>Số đầu sách</span>
              </th>
              <th scope="col" style="width: 150px;">
                <span>Ngày tạo</span>
              </th>
              <th scope="col" style="width: 130px;" class="text-end pe-3">
                <span>Thao tác</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="shelf in shelves" :key="shelf.MaKe">
              <!-- Mã kệ -->
              <td class="ps-3">
                <span class="badge bg-light text-dark border font-monospace px-2 py-1">
                  {{ shelf.MaKe }}
                </span>
              </td>

              <!-- Tên kệ sách -->
              <td>
                <div class="fw-bold text-dark d-flex align-items-center gap-2">
                  <i class="bi bi-grid-3x3-gap-fill text-primary"></i>
                  <span>{{ shelf.TenKe }}</span>
                </div>
              </td>

              <!-- Khu vực -->
              <td>
                <span class="badge bg-info-subtle text-info-emphasis border border-info-subtle px-2 py-1">
                  <i class="bi bi-geo-alt me-1"></i>{{ shelf.KhuVuc }}
                </span>
              </td>

              <!-- Số ngăn -->
              <td class="text-center">
                <span class="fw-semibold text-secondary">
                  {{ shelf.SoNgan }} tầng
                </span>
              </td>

              <!-- Số đầu sách đang chứa -->
              <td class="text-center">
                <span
                  class="badge rounded-pill px-3 py-1"
                  :class="shelf.SoSach > 0 ? 'bg-primary-subtle text-primary border border-primary-subtle' : 'bg-light text-muted border'"
                >
                  <i class="bi bi-book me-1"></i>
                  {{ shelf.SoSach }} đầu sách
                </span>
              </td>

              <!-- Ngày tạo -->
              <td class="small text-secondary">
                {{ formatDate(shelf.createdAt) }}
              </td>

              <!-- Thao tác -->
              <td class="text-end pe-3">
                <div class="btn-group btn-group-sm" role="group">
                  <button
                    type="button"
                    class="btn btn-outline-secondary"
                    title="Chỉnh sửa thông tin kệ"
                    @click="handleOpenEdit(shelf)"
                  >
                    <i class="bi bi-pencil-square"></i>
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline-danger"
                    title="Xóa kệ sách"
                    @click="handleOpenDelete(shelf)"
                  >
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Phân trang -->
      <div v-if="!isLoading && shelves.length > 0 && pagination.totalPages > 1" class="card-footer bg-white border-top p-3">
        <AppPagination
          :current-page="pagination.page"
          :total-pages="pagination.totalPages"
          :total-items="pagination.total"
          :page-size="pagination.limit"
          @page-change="handlePageChange"
        />
      </div>
    </div>

    <!-- Modal Form Thêm/Sửa Kệ sách -->
    <ShelfFormModal ref="formModalRef" @saved="handleSaved" />

    <!-- Modal Xác nhận Xóa Kệ sách -->
    <ConfirmModal
      ref="confirmModalRef"
      title="Xác nhận xóa kệ sách"
      confirm-text="Xóa kệ sách"
      confirm-variant="danger"
      :is-loading="isDeleting"
      @confirm="handleConfirmDelete"
    >
      <div v-if="shelfToDelete">
        <p>
          Bạn có chắc chắn muốn xóa kệ sách
          <strong class="text-danger">{{ shelfToDelete.TenKe }}</strong>
          (Mã: <code>{{ shelfToDelete.MaKe }}</code>, Khu vực: {{ shelfToDelete.KhuVuc }}) không?
        </p>

        <div v-if="shelfToDelete.SoSach > 0" class="alert alert-warning py-2 px-3 small d-flex align-items-center gap-2 mb-2">
          <i class="bi bi-exclamation-triangle-fill fs-5 flex-shrink-0"></i>
          <div>
            Kệ sách này đang chứa <strong>{{ shelfToDelete.SoSach }}</strong> đầu sách.
            Hệ thống sẽ từ chối xóa để đảm bảo toàn vẹn dữ liệu vị trí.
          </div>
        </div>

        <div v-if="deleteErrorNotice" class="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-0">
          <i class="bi bi-x-circle-fill fs-5 flex-shrink-0"></i>
          <div>{{ deleteErrorNotice }}</div>
        </div>
      </div>
    </ConfirmModal>
  </div>
</template>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
.cursor-pointer:hover {
  background-color: rgba(0, 0, 0, 0.02);
}
</style>

