<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import auditApi from '../api/audit.api.js';
import { formatDate } from '../utils/format.js';
import { getErrorMessage } from '../api/http.js';
import AppPagination from '../components/AppPagination.vue';
import EmptyState from '../components/EmptyState.vue';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import AppAlert from '../components/AppAlert.vue';

const route = useRoute();
const router = useRouter();

// Dữ liệu danh sách nhật ký & phân trang
const logs = ref([]);
const pagination = ref({
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 1,
});

const isLoading = ref(false);
const errorMessage = ref('');

// Danh sách hành động và đối tượng phục vụ bộ lọc
const actionList = ref([]);
const targetList = ref([]);

// Ô tìm kiếm cục bộ (chờ debounce 400ms)
const searchInput = ref('');
let searchDebounceTimer = null;
let activeAbortController = null;

// Whitelist các lựa chọn sắp xếp
const SORT_OPTIONS = [
  { value: '-createdAt', label: 'Thời gian mới nhất' },
  { value: 'createdAt', label: 'Thời gian cũ nhất' },
  { value: 'HanhDong', label: 'Hành động A → Z' },
  { value: '-HanhDong', label: 'Hành động Z → A' },
  { value: 'MSNV', label: 'Tác nhân A → Z' },
  { value: '-MSNV', label: 'Tác nhân Z → A' },
];

const ALLOWED_SORTS = SORT_OPTIONS.map((opt) => opt.value);

// Đọc giá trị bộ lọc từ URL (route.query)
const querySearch = computed(() => (route.query.search ? String(route.query.search).trim() : ''));
const queryMsnv = computed(() => (route.query.msnv ? String(route.query.msnv).trim() : ''));
const queryHanhDong = computed(() => (route.query.hanhDong ? String(route.query.hanhDong).trim() : ''));
const queryDoiTuong = computed(() => (route.query.doiTuong ? String(route.query.doiTuong).trim() : ''));
const queryTuNgay = computed(() => (route.query.tuNgay ? String(route.query.tuNgay).trim() : ''));
const queryDenNgay = computed(() => (route.query.denNgay ? String(route.query.denNgay).trim() : ''));
const querySort = computed(() => {
  return ALLOWED_SORTS.includes(route.query.sort) ? route.query.sort : '-createdAt';
});
const queryPage = computed(() => Math.max(1, parseInt(route.query.page, 10) || 1));

// Kiểm tra xem có bộ lọc nào đang áp dụng hay không
const isFiltered = computed(() => {
  return Boolean(
    querySearch.value ||
    queryMsnv.value ||
    queryHanhDong.value ||
    queryDoiTuong.value ||
    queryTuNgay.value ||
    queryDenNgay.value ||
    (route.query.sort && route.query.sort !== '-createdAt')
  );
});

// Cập nhật ô tìm kiếm khi route.query thay đổi
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
 * Nạp danh sách nhật ký từ backend
 */
const fetchAuditLogs = async () => {
  if (activeAbortController) {
    activeAbortController.abort();
  }
  activeAbortController = new AbortController();

  isLoading.value = true;
  errorMessage.value = '';

  try {
    const params = {
      search: querySearch.value || undefined,
      msnv: queryMsnv.value || undefined,
      hanhDong: queryHanhDong.value || undefined,
      doiTuong: queryDoiTuong.value || undefined,
      tuNgay: queryTuNgay.value || undefined,
      denNgay: queryDenNgay.value || undefined,
      sort: querySort.value,
      page: queryPage.value,
      limit: 10,
    };

    const res = await auditApi.list(params, activeAbortController.signal);
    const data = res.data;

    logs.value = data?.data || [];
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
    logs.value = [];
  } finally {
    isLoading.value = false;
  }
};

/**
 * Nạp metadata phục vụ danh sách chọn lọc hành động và đối tượng
 */
const fetchMetadata = async () => {
  try {
    const res = await auditApi.getMetadata();
    const data = res.data?.data;
    if (data) {
      actionList.value = data.actions || [];
      targetList.value = data.targets || [];
    }
  } catch {
    // Bỏ qua lỗi metadata nếu có
  }
};

onMounted(() => {
  fetchMetadata();
});

/**
 * Cập nhật route query
 */
const updateQuery = (newParams) => {
  const currentQuery = { ...route.query };
  const merged = { ...currentQuery, ...newParams };

  Object.keys(merged).forEach((key) => {
    if (merged[key] === undefined || merged[key] === null || merged[key] === '') {
      delete merged[key];
    }
  });

  router.push({ path: '/audit-logs', query: merged });
};

const onSearchInput = () => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
  searchDebounceTimer = setTimeout(() => {
    updateQuery({ search: searchInput.value.trim() || undefined, page: undefined });
  }, 400);
};

const clearSearch = () => {
  searchInput.value = '';
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
  updateQuery({ search: undefined, page: undefined });
};

const onActionChange = (event) => {
  updateQuery({ hanhDong: event.target.value || undefined, page: undefined });
};

const onTargetChange = (event) => {
  updateQuery({ doiTuong: event.target.value || undefined, page: undefined });
};

const onDateChange = (field, event) => {
  updateQuery({ [field]: event.target.value || undefined, page: undefined });
};

const onSortChange = (event) => {
  const val = event.target.value;
  updateQuery({
    sort: val === '-createdAt' ? undefined : val,
    page: undefined,
  });
};

const onPageChange = (newPage) => {
  updateQuery({ page: newPage === 1 ? undefined : newPage });
};

const resetAllFilters = () => {
  searchInput.value = '';
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
  router.push({ path: '/audit-logs', query: {} });
};

// Theo dõi thay đổi của route.query để tự động fetch
watch(
  () => route.query,
  () => {
    fetchAuditLogs();
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

// =============================================================================
// MODAL XEM CHI TIẾT NHẬT KÝ
// =============================================================================
const selectedLog = ref(null);
const detailModalRef = ref(null);

const viewLogDetail = (log) => {
  selectedLog.value = log;
  const modalEl = document.getElementById('auditDetailModal');
  if (modalEl && window.bootstrap) {
    const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  }
};

/**
 * Định dạng badge màu cho từng loại hành động
 */
const getActionBadgeClass = (action) => {
  const act = String(action || '').toUpperCase();
  if (act.includes('XOA') || act.includes('KHOA') || act.includes('TU_CHOI')) {
    return 'bg-danger-subtle text-danger border-danger-subtle';
  }
  if (act.includes('THEM') || act.includes('DUYET') || act.includes('MO_KHOA') || act.includes('DANG_KY')) {
    return 'bg-success-subtle text-success border-success-subtle';
  }
  if (act.includes('SUA') || act.includes('CAP_NHAT') || act.includes('THU_PHAT') || act.includes('RESET')) {
    return 'bg-warning-subtle text-warning-emphasis border-warning-subtle';
  }
  if (act.includes('GIAO') || act.includes('NHAN_TRA') || act.includes('DOI_VAI_TRO')) {
    return 'bg-primary-subtle text-primary border-primary-subtle';
  }
  return 'bg-secondary-subtle text-secondary border-secondary-subtle';
};
</script>

<template>
  <div class="audit-logs-view">
    <!-- Tiêu đề trang -->
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
      <div>
        <div class="d-flex align-items-center gap-2">
          <div class="p-2 bg-primary-subtle text-primary rounded-3">
            <i class="bi bi-journal-text fs-4"></i>
          </div>
          <div>
            <h1 class="h3 fw-bold mb-0 text-dark">Nhật ký Hệ thống (Audit Logs)</h1>
            <p class="text-muted small mb-0">
              Theo dõi và truy vết chi tiết mọi hoạt động quản trị, duyệt mượn, xử lý sách và thay đổi cấu hình.
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Thông báo lỗi nếu có -->
    <AppAlert
      v-if="errorMessage"
      type="danger"
      :message="errorMessage"
      dismissible
      class="mb-3"
      @dismiss="errorMessage = ''"
    />

    <!-- Khối thẻ chính chứa Bộ lọc và Bảng nhật ký -->
    <div class="card border-0 shadow-sm">
      <!-- Thanh công cụ & Bộ lọc đa tiêu chí -->
      <div class="card-header bg-white border-bottom p-3">
        <div class="row g-2 align-items-center">
          <!-- Ô tìm kiếm tự do -->
          <div class="col-lg-3 col-md-6">
            <div class="input-group input-group-sm">
              <span class="input-group-text bg-light text-muted border-end-0">
                <i class="bi bi-search"></i>
              </span>
              <input
                v-model="searchInput"
                type="text"
                class="form-control border-start-0 ps-0"
                placeholder="Tìm hành động, mã đối tượng, IP..."
                @input="onSearchInput"
              />
              <button
                v-if="searchInput"
                type="button"
                class="btn btn-outline-secondary border-start-0"
                title="Xóa ô tìm kiếm"
                @click="clearSearch"
              >
                <i class="bi bi-x-lg"></i>
              </button>
            </div>
          </div>

          <!-- Lọc theo hành động -->
          <div class="col-lg-2 col-md-3 col-sm-6">
            <select
              class="form-select form-select-sm"
              :value="queryHanhDong"
              aria-label="Lọc theo hành động"
              @change="onActionChange"
            >
              <option value="">Tất cả hành động</option>
              <option
                v-for="act in actionList"
                :key="act"
                :value="act"
              >
                {{ act }}
              </option>
            </select>
          </div>

          <!-- Lọc theo đối tượng -->
          <div class="col-lg-2 col-md-3 col-sm-6">
            <select
              class="form-select form-select-sm"
              :value="queryDoiTuong"
              aria-label="Lọc theo đối tượng"
              @change="onTargetChange"
            >
              <option value="">Tất cả đối tượng</option>
              <option
                v-for="target in targetList"
                :key="target"
                :value="target"
              >
                {{ target }}
              </option>
            </select>
          </div>

          <!-- Từ ngày -->
          <div class="col-lg-2 col-md-3 col-sm-6">
            <div class="input-group input-group-sm">
              <span class="input-group-text bg-light text-muted" title="Từ ngày">Từ</span>
              <input
                type="date"
                class="form-control"
                :value="queryTuNgay"
                @change="onDateChange('tuNgay', $event)"
              />
            </div>
          </div>

          <!-- Đến ngày -->
          <div class="col-lg-2 col-md-3 col-sm-6">
            <div class="input-group input-group-sm">
              <span class="input-group-text bg-light text-muted" title="Đến ngày">Đến</span>
              <input
                type="date"
                class="form-control"
                :value="queryDenNgay"
                @change="onDateChange('denNgay', $event)"
              />
            </div>
          </div>

          <!-- Nút xóa bộ lọc -->
          <div class="col-lg-1 col-md-2 col-sm-6 text-end">
            <button
              v-if="isFiltered"
              type="button"
              class="btn btn-outline-secondary btn-sm w-100 d-flex align-items-center justify-content-center gap-1"
              title="Đặt lại toàn bộ bộ lọc"
              @click="resetAllFilters"
            >
              <i class="bi bi-arrow-counterclockwise"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- Bảng danh sách nhật ký -->
      <div class="card-body p-0">
        <!-- Đang tải -->
        <div v-if="isLoading" class="p-5 text-center">
          <LoadingSpinner text="Đang nạp nhật ký kiểm toán..." />
        </div>

        <!-- Trống dữ liệu -->
        <div v-else-if="logs.length === 0" class="p-4">
          <EmptyState
            icon="bi-journal-x"
            title="Không tìm thấy nhật ký nào"
            :message="isFiltered ? 'Không có bản ghi nhật ký nào phù hợp với bộ lọc hiện tại.' : 'Hệ thống chưa ghi nhận nhật ký nào.'"
          >
            <template #action>
              <button
                v-if="isFiltered"
                type="button"
                class="btn btn-outline-primary btn-sm mt-3"
                @click="resetAllFilters"
              >
                <i class="bi bi-arrow-counterclockwise me-1"></i>
                Đặt lại bộ lọc
              </button>
            </template>
          </EmptyState>
        </div>

        <!-- Bảng nhật ký -->
        <div v-else class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead class="table-light text-muted small text-uppercase">
              <tr>
                <th scope="col" class="ps-3" style="width: 170px;">Thời gian</th>
                <th scope="col" style="width: 220px;">Tác nhân thực hiện</th>
                <th scope="col" style="width: 180px;">Hành động</th>
                <th scope="col">Đối tượng / Mã</th>
                <th scope="col" style="width: 140px;">Địa chỉ IP</th>
                <th scope="col" class="text-end pe-3" style="width: 100px;">Chi tiết</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in logs" :key="l._id">
                <!-- Thời gian -->
                <td class="ps-3 small font-monospace text-dark">
                  <i class="bi bi-clock text-muted me-1"></i>
                  {{ formatDate(l.createdAt, true) }}
                </td>

                <!-- Tác nhân thực hiện -->
                <td>
                  <!-- Nếu là nhân viên -->
                  <div v-if="l.NhanVien" class="d-flex flex-column">
                    <span class="fw-bold text-dark">{{ l.NhanVien.HoTenNV }}</span>
                    <div class="d-flex align-items-center gap-1 small text-muted">
                      <span class="font-monospace">{{ l.MSNV }}</span>
                      <span
                        v-if="l.NhanVien.VaiTro === 'admin'"
                        class="badge bg-primary-subtle text-primary border border-primary-subtle"
                        style="font-size: 0.65rem;"
                      >
                        Admin
                      </span>
                      <span
                        v-else
                        class="badge bg-secondary-subtle text-secondary border border-secondary-subtle"
                        style="font-size: 0.65rem;"
                      >
                        Thủ thư
                      </span>
                    </div>
                  </div>

                  <!-- Nếu là độc giả -->
                  <div v-else-if="l.DocGia" class="d-flex flex-column">
                    <span class="fw-bold text-dark">{{ l.DocGia.HoLot }} {{ l.DocGia.Ten }}</span>
                    <span class="small text-muted font-monospace">{{ l.MSNV }} (Độc giả)</span>
                  </div>

                  <!-- Tác nhân hệ thống -->
                  <div v-else-if="l.MSNV === 'HE_THONG'" class="d-flex align-items-center gap-1">
                    <span class="badge bg-dark-subtle text-dark border border-dark-subtle">
                      <i class="bi bi-robot me-1"></i>Hệ thống tự động
                    </span>
                  </div>

                  <!-- Khác / Mã chuỗi -->
                  <div v-else class="small font-monospace text-dark">
                    {{ l.MSNV || '—' }}
                  </div>
                </td>

                <!-- Hành động -->
                <td>
                  <span
                    class="badge border px-2 py-1"
                    :class="getActionBadgeClass(l.HanhDong)"
                  >
                    {{ l.HanhDong }}
                  </span>
                </td>

                <!-- Đối tượng / Mã đối tượng -->
                <td>
                  <div class="d-flex align-items-center gap-2">
                    <span class="badge bg-light text-dark border">
                      {{ l.DoiTuong }}
                    </span>
                    <span v-if="l.MaDoiTuong" class="font-monospace small text-primary fw-medium">
                      {{ l.MaDoiTuong }}
                    </span>
                  </div>
                </td>

                <!-- Địa chỉ IP -->
                <td class="small font-monospace text-muted">
                  {{ l.IP || '—' }}
                </td>

                <!-- Nút xem chi tiết -->
                <td class="text-end pe-3">
                  <button
                    type="button"
                    class="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1"
                    title="Xem chi tiết dữ liệu thay đổi"
                    @click="viewLogDetail(l)"
                  >
                    <i class="bi bi-eye"></i>
                    <span>Xem</span>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Phân trang -->
      <div
        v-if="!isLoading && pagination.total > 0"
        class="card-footer bg-white border-top p-3 d-flex flex-wrap align-items-center justify-content-between gap-2"
      >
        <div class="small text-muted">
          Hiển thị <strong>{{ logs.length }}</strong> trong tổng số <strong>{{ pagination.total }}</strong> bản ghi nhật ký
          <span v-if="pagination.totalPages > 1">(Trang {{ pagination.page }} / {{ pagination.totalPages }})</span>
        </div>

        <AppPagination
          v-if="pagination.totalPages > 1"
          :current-page="pagination.page"
          :total-pages="pagination.totalPages"
          @change-page="onPageChange"
        />
      </div>
    </div>

    <!-- MODAL CHI TIẾT NHẬT KÝ -->
    <div
      id="auditDetailModal"
      class="modal fade"
      tabindex="-1"
      aria-labelledby="auditDetailModalLabel"
      aria-hidden="true"
    >
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content border-0 shadow">
          <div class="modal-header bg-light border-bottom">
            <div class="d-flex align-items-center gap-2">
              <div class="p-2 bg-primary-subtle text-primary rounded">
                <i class="bi bi-file-earmark-text-fill fs-5"></i>
              </div>
              <div>
                <h5 id="auditDetailModalLabel" class="modal-title fw-bold mb-0">
                  Chi tiết bản ghi nhật ký
                </h5>
                <div class="small text-muted font-monospace">Mã log: {{ selectedLog?._id }}</div>
              </div>
            </div>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button>
          </div>

          <div class="modal-body p-4">
            <!-- Thông tin tổng quan -->
            <div class="row g-3 mb-4">
              <div class="col-md-6">
                <div class="card bg-light border-0 p-3 h-100">
                  <div class="text-muted small">Thời điểm thực hiện:</div>
                  <div class="fw-bold">{{ formatDate(selectedLog?.createdAt, true) }}</div>

                  <div class="text-muted small mt-2">Địa chỉ IP:</div>
                  <div class="font-monospace small">{{ selectedLog?.IP || '—' }}</div>
                </div>
              </div>

              <div class="col-md-6">
                <div class="card bg-light border-0 p-3 h-100">
                  <div class="text-muted small">Tác nhân:</div>
                  <div class="fw-bold">
                    {{ selectedLog?.NhanVien?.HoTenNV || selectedLog?.DocGia?.HoLot + ' ' + selectedLog?.DocGia?.Ten || selectedLog?.MSNV }}
                    <span class="small text-muted font-monospace">({{ selectedLog?.MSNV }})</span>
                  </div>

                  <div class="text-muted small mt-2">Hành động:</div>
                  <div>
                    <span class="badge border px-2 py-1" :class="getActionBadgeClass(selectedLog?.HanhDong)">
                      {{ selectedLog?.HanhDong }}
                    </span>
                    trên bảng
                    <span class="badge bg-light text-dark border ms-1">{{ selectedLog?.DoiTuong }}</span>
                    <span v-if="selectedLog?.MaDoiTuong" class="font-monospace small text-primary ms-1">
                      ({{ selectedLog?.MaDoiTuong }})
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Dữ liệu chi tiết thay đổi (ChiTiet) -->
            <div>
              <h6 class="fw-bold text-dark mb-2 d-flex align-items-center gap-1">
                <i class="bi bi-braces text-primary"></i>
                <span>Dữ liệu chi tiết đính kèm:</span>
              </h6>
              <div class="bg-dark text-light p-3 rounded font-monospace small overflow-auto" style="max-height: 300px;">
                <pre class="mb-0 text-white">{{ JSON.stringify(selectedLog?.ChiTiet, null, 2) }}</pre>
              </div>
            </div>
          </div>

          <div class="modal-footer bg-light border-top">
            <button type="button" class="btn btn-secondary px-4" data-bs-dismiss="modal">
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.audit-logs-view {
  min-height: 100%;
}
</style>
