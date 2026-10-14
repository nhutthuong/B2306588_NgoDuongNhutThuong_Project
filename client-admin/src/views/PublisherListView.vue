<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';
import publisherApi from '../api/publisher.api.js';
import { getErrorMessage } from '../api/http.js';
import { formatDate } from '../utils/format.js';
import AppPagination from '../components/AppPagination.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import EmptyState from '../components/EmptyState.vue';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import AppAlert from '../components/AppAlert.vue';
import PublisherFormModal from '../components/PublisherFormModal.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

// Trạng thái dữ liệu
const publishers = ref([]);
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

// Từ khóa tìm kiếm cục bộ phục vụ ô nhập (debounced 400ms)
const searchInput = ref('');
let searchDebounceTimer = null;

// Modal components
const formModalRef = ref(null);
const confirmModalRef = ref(null);
const publisherToDelete = ref(null);
const isDeleting = ref(false);
const deleteErrorNotice = ref('');

// Đọc các giá trị từ route.query để đồng bộ URL (không dùng localStorage/sessionStorage)
const querySearch = computed(() => (route.query.search ? String(route.query.search).trim() : ''));
const queryPage = computed(() => Math.max(1, parseInt(route.query.page, 10) || 1));
const querySort = computed(() => {
  const allowed = ['MaNXB', '-MaNXB', 'TenNXB', '-TenNXB', 'createdAt', '-createdAt'];
  return allowed.includes(route.query.sort) ? route.query.sort : '-createdAt';
});

// Cập nhật ô tìm kiếm khi URL thay đổi (nhấn Back/Forward)
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
 * Gọi API nạp danh sách NXB
 */
const fetchPublishers = async () => {
  isLoading.value = true;
  errorMessage.value = '';

  try {
    const params = {
      search: querySearch.value || undefined,
      page: queryPage.value,
      limit: 10,
      sort: querySort.value,
    };

    const response = await publisherApi.list(params);
    const data = response.data;

    publishers.value = data?.data || [];
    if (data?.meta) {
      pagination.value = {
        page: data.meta.page || 1,
        limit: data.meta.limit || 10,
        total: data.meta.total || 0,
        totalPages: data.meta.totalPages || 1,
      };
    }
  } catch (error) {
    errorMessage.value = getErrorMessage(error);
  } finally {
    isLoading.value = false;
  }
};

// Theo dõi thay đổi của route.query để tự động fetch lại dữ liệu (giữ trạng thái khi F5 / Back)
watch(
  () => route.query,
  () => {
    fetchPublishers();
  },
  { immediate: true }
);

/**
 * Xử lý nhập ô tìm kiếm với debounce 400ms
 */
const handleSearchInput = (e) => {
  const val = e.target.value;
  searchInput.value = val;

  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }

  searchDebounceTimer = setTimeout(() => {
    const newQuery = { ...route.query };
    const trimmed = val.trim();
    if (trimmed) {
      newQuery.search = trimmed;
    } else {
      delete newQuery.search;
    }
    // Tìm kiếm đưa về trang 1
    newQuery.page = 1;

    router.push({ query: newQuery });
  }, 400);
};

const clearSearch = () => {
  searchInput.value = '';
  const newQuery = { ...route.query };
  delete newQuery.search;
  newQuery.page = 1;
  router.push({ query: newQuery });
};

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
 * Sắp xếp theo cột (chỉ các trường backend hỗ trợ: MaNXB, TenNXB, createdAt)
 */
const handleSort = (field) => {
  const current = querySort.value;
  let nextSort = `-${field}`;

  if (current === `-${field}`) {
    nextSort = field;
  } else if (current === field) {
    nextSort = `-${field}`;
  }

  router.push({
    query: {
      ...route.query,
      sort: nextSort,
      page: 1,
    },
  });
};

const getSortIcon = (field) => {
  const current = querySort.value;
  if (current === field) return 'bi-arrow-up text-primary fw-bold';
  if (current === `-${field}`) return 'bi-arrow-down text-primary fw-bold';
  return 'bi-arrow-down-up text-muted opacity-50';
};

/**
 * Thao tác mở modal Thêm mới / Sửa
 */
const openCreateModal = () => {
  deleteErrorNotice.value = '';
  formModalRef.value?.openCreate();
};

const openEditModal = (pub) => {
  deleteErrorNotice.value = '';
  formModalRef.value?.openEdit(pub);
};

const handleSaved = ({ message }) => {
  alertType.value = 'success';
  alertMessage.value = message;
  fetchPublishers();
};

/**
 * Thao tác Xóa (Chỉ role admin mới thấy nút xóa trên giao diện UX; backend kiểm tra bắt buộc qua middleware requireRole('admin'))
 */
const promptDelete = (pub) => {
  deleteErrorNotice.value = '';
  publisherToDelete.value = pub;
  confirmModalRef.value?.show();
};

const handleConfirmDelete = async () => {
  if (!publisherToDelete.value) return;

  isDeleting.value = true;
  deleteErrorNotice.value = '';

  try {
    const response = await publisherApi.remove(publisherToDelete.value.MaNXB);
    confirmModalRef.value?.hide();
    alertType.value = 'success';
    alertMessage.value = response.data?.message || 'Xóa nhà xuất bản thành công.';
    publisherToDelete.value = null;
    fetchPublishers();
  } catch (error) {
    const status = error.response?.status;
    const errorCode = error.response?.data?.error?.code;
    const msg = error.response?.data?.error?.message || getErrorMessage(error);

    // Xử lý lỗi 409 HAS_BOOKS: còn sách thuộc NXB này
    if (status === 409 && errorCode === 'HAS_BOOKS') {
      deleteErrorNotice.value = `${msg}. Gợi ý: Vui lòng chuyển hoặc xóa tất cả các cuốn sách thuộc nhà xuất bản này trước khi thực hiện xóa.`;
    } else {
      deleteErrorNotice.value = msg;
    }
  } finally {
    isDeleting.value = false;
  }
};

const handleCancelDelete = () => {
  publisherToDelete.value = null;
  deleteErrorNotice.value = '';
};

onUnmounted(() => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
});
</script>

<template>
  <div class="publisher-list-view">
    <!-- Tiêu đề trang & Nút thêm mới -->
    <div class="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3 mb-4">
      <div>
        <h1 class="h3 fw-bold mb-1 d-flex align-items-center gap-2">
          <i class="bi bi-building text-primary"></i>
          <span>Quản lý Nhà xuất bản</span>
        </h1>
        <p class="text-muted mb-0 small">
          Danh mục các nhà xuất bản sách, quản lý địa chỉ và thống kê số đầu sách liên kết.
        </p>
      </div>
      <div>
        <button
          type="button"
          class="btn btn-primary d-flex align-items-center gap-2 text-nowrap shadow-sm"
          @click="openCreateModal"
        >
          <i class="bi bi-plus-lg"></i>
          <span>Thêm nhà xuất bản</span>
        </button>
      </div>
    </div>

    <!-- Thông báo kết quả thao tác -->
    <AppAlert
      v-if="alertMessage"
      :type="alertType"
      :message="alertMessage"
      @close="alertMessage = ''"
    />

    <!-- Thanh tìm kiếm & bộ lọc -->
    <div class="card shadow-sm border-0 mb-4">
      <div class="card-body p-3">
        <div class="row g-2 align-items-center">
          <div class="col-12 col-md-6 col-lg-5">
            <div class="input-group">
              <span class="input-group-text bg-white border-end-0 text-muted">
                <i class="bi bi-search"></i>
              </span>
              <input
                type="text"
                class="form-control border-start-0 ps-0"
                placeholder="Tìm kiếm theo tên nhà xuất bản..."
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
          <div class="col-12 col-md-6 col-lg-7 text-md-end text-muted small">
            <span>Tổng cộng: <strong class="text-dark">{{ pagination.total }}</strong> nhà xuất bản</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Bảng dữ liệu / Trạng thái loading / Empty / Lỗi -->
    <div class="card shadow-sm border-0">
      <!-- Trạng thái đang tải -->
      <LoadingSpinner v-if="isLoading" text="Đang tải danh sách nhà xuất bản..." />

      <!-- Trạng thái lỗi tải dữ liệu -->
      <div v-else-if="errorMessage" class="card-body py-5 text-center">
        <div class="text-danger mb-3">
          <i class="bi bi-exclamation-triangle" style="font-size: 3rem;"></i>
        </div>
        <h5 class="fw-bold mb-2">Không thể tải danh sách nhà xuất bản</h5>
        <p class="text-secondary small mb-3" style="white-space: pre-line;">{{ errorMessage }}</p>
        <button type="button" class="btn btn-outline-primary btn-sm" @click="fetchPublishers">
          <i class="bi bi-arrow-clockwise me-1"></i> Thử lại
        </button>
      </div>

      <!-- Trạng thái danh sách rỗng -->
      <EmptyState
        v-else-if="publishers.length === 0"
        :title="querySearch ? 'Không tìm thấy kết quả' : 'Chưa có nhà xuất bản nào'"
        :message="querySearch ? `Không tìm thấy nhà xuất bản khớp với từ khóa '${querySearch}'.` : 'Hệ thống hiện chưa có nhà xuất bản nào. Hãy bấm nút thêm mới để tạo.'"
        :action-text="querySearch ? 'Xóa từ khóa tìm kiếm' : 'Thêm nhà xuất bản mới'"
        @action="querySearch ? clearSearch() : openCreateModal()"
      />

      <!-- Bảng danh sách khi có dữ liệu -->
      <div v-else class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light border-bottom text-secondary small text-uppercase">
            <tr>
              <th scope="col" style="width: 140px; cursor: pointer;" @click="handleSort('MaNXB')">
                <div class="d-flex align-items-center gap-1">
                  <span>Mã NXB</span>
                  <i class="bi" :class="getSortIcon('MaNXB')"></i>
                </div>
              </th>
              <th scope="col" style="cursor: pointer;" @click="handleSort('TenNXB')">
                <div class="d-flex align-items-center gap-1">
                  <span>Tên Nhà Xuất Bản</span>
                  <i class="bi" :class="getSortIcon('TenNXB')"></i>
                </div>
              </th>
              <th scope="col">Địa chỉ</th>
              <th scope="col" style="width: 120px;" class="text-center">Số sách</th>
              <th scope="col" style="width: 160px; cursor: pointer;" @click="handleSort('createdAt')">
                <div class="d-flex align-items-center gap-1">
                  <span>Ngày tạo</span>
                  <i class="bi" :class="getSortIcon('createdAt')"></i>
                </div>
              </th>
              <th scope="col" style="width: 130px;" class="text-end pe-3">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="pub in publishers" :key="pub.MaNXB">
              <td>
                <span class="badge bg-light text-dark border font-monospace px-2 py-1">
                  {{ pub.MaNXB }}
                </span>
              </td>
              <td class="fw-semibold text-dark">
                {{ pub.TenNXB }}
              </td>
              <td class="text-secondary small">
                {{ pub.DiaChi || '—' }}
              </td>
              <td class="text-center">
                <span
                  class="badge rounded-pill"
                  :class="pub.SoSach > 0 ? 'bg-primary-subtle text-primary border border-primary-subtle' : 'bg-light text-muted border'"
                >
                  {{ pub.SoSach || 0 }} cuốn
                </span>
              </td>
              <td class="text-secondary small">
                {{ formatDate(pub.createdAt) }}
              </td>
              <td class="text-end pe-3">
                <div class="btn-group btn-group-sm" role="group">
                  <button
                    type="button"
                    class="btn btn-outline-secondary"
                    title="Chỉnh sửa nhà xuất bản"
                    @click="openEditModal(pub)"
                  >
                    <i class="bi bi-pencil"></i>
                    <span class="d-none d-lg-inline ms-1">Sửa</span>
                  </button>

                  <!--
                    Chỉ hiển thị nút Xóa cho vai trò admin (UX).
                    Quyền thực tế được kiểm tra tại backend qua middleware requireRole('admin').
                  -->
                  <button
                    v-if="authStore.isAdmin"
                    type="button"
                    class="btn btn-outline-danger"
                    title="Xóa nhà xuất bản (Chỉ Admin)"
                    @click="promptDelete(pub)"
                  >
                    <i class="bi bi-trash"></i>
                    <span class="d-none d-lg-inline ms-1">Xóa</span>
                  </button>
                </div>
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
          Trang <strong>{{ pagination.page }}</strong> / {{ pagination.totalPages }} (Tổng số {{ pagination.total }} bản ghi)
        </div>
        <AppPagination
          :current-page="pagination.page"
          :total-pages="pagination.totalPages"
          @change-page="handlePageChange"
        />
      </div>
    </div>

    <!-- Modal Thêm / Sửa Nhà xuất bản -->
    <PublisherFormModal ref="formModalRef" @saved="handleSaved" />

    <!-- Modal Xác nhận xóa Nhà xuất bản -->
    <ConfirmModal
      ref="confirmModalRef"
      title="Xác nhận xóa Nhà xuất bản"
      :message="publisherToDelete ? `Bạn có chắc chắn muốn xóa nhà xuất bản '${publisherToDelete.TenNXB}' (${publisherToDelete.MaNXB}) không? Hành động này không thể hoàn tác.` : ''"
      confirm-text="Xóa nhà xuất bản"
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
.table th,
.table td {
  padding-top: 0.75rem;
  padding-bottom: 0.75rem;
}
</style>
