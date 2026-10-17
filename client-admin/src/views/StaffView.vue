<script setup>
import { ref, computed, watch, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import staffApi from '../api/staff.api.js';
import { useAuthStore } from '../stores/auth.js';
import { formatDate } from '../utils/format.js';
import { getErrorMessage } from '../api/http.js';
import AppPagination from '../components/AppPagination.vue';
import EmptyState from '../components/EmptyState.vue';
import LoadingSpinner from '../components/LoadingSpinner.vue';
import AppAlert from '../components/AppAlert.vue';
import ConfirmModal from '../components/ConfirmModal.vue';
import StaffCreateModal from '../components/StaffCreateModal.vue';
import StaffEditModal from '../components/StaffEditModal.vue';
import StaffRoleModal from '../components/StaffRoleModal.vue';
import StaffResetPasswordModal from '../components/StaffResetPasswordModal.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

// Nhân viên hiện đang đăng nhập
const currentAdminMsnv = computed(() => authStore.currentUser?.MSNV || '');

// Dữ liệu danh sách nhân viên & phân trang
const staffList = ref([]);
const pagination = ref({
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 1,
});

const isLoading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

// Từ khóa tìm kiếm cục bộ (chờ debounce 400ms)
const searchInput = ref('');
let searchDebounceTimer = null;
let activeAbortController = null;

// Whitelist các lựa chọn sắp xếp
const SORT_OPTIONS = [
  { value: '-createdAt', label: 'Mới tạo nhất' },
  { value: 'createdAt', label: 'Cũ nhất' },
  { value: 'HoTenNV', label: 'Họ tên A → Z' },
  { value: '-HoTenNV', label: 'Họ tên Z → A' },
  { value: 'MSNV', label: 'Mã nhân viên A → Z' },
  { value: '-MSNV', label: 'Mã nhân viên Z → A' },
  { value: '-LanDangNhapCuoi', label: 'Đăng nhập gần nhất' },
];

const ALLOWED_SORTS = SORT_OPTIONS.map((opt) => opt.value);

// Đọc giá trị bộ lọc từ URL (route.query)
const querySearch = computed(() => (route.query.search ? String(route.query.search).trim() : ''));
const queryVaiTro = computed(() => {
  const role = route.query.vaiTro;
  return role === 'admin' || role === 'thuthu' ? role : '';
});
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
  return Boolean(
    querySearch.value ||
    queryVaiTro.value ||
    queryTrangThai.value ||
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
 * Nạp danh sách nhân viên từ backend
 */
const fetchStaffList = async () => {
  if (activeAbortController) {
    activeAbortController.abort();
  }
  activeAbortController = new AbortController();

  isLoading.value = true;
  errorMessage.value = '';

  try {
    const params = {
      search: querySearch.value || undefined,
      vaiTro: queryVaiTro.value || undefined,
      trangThai: queryTrangThai.value || undefined,
      sort: querySort.value,
      page: queryPage.value,
      limit: 10,
    };

    const res = await staffApi.list(params, activeAbortController.signal);
    const data = res.data;

    staffList.value = data?.data || [];
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
    staffList.value = [];
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

const onRoleChange = (event) => {
  const val = event.target.value;
  updateQuery({ vaiTro: val || undefined, page: undefined });
};

const onStatusChange = (event) => {
  const val = event.target.value;
  updateQuery({ trangThai: val || undefined, page: undefined });
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
  router.push({ path: '/staff', query: {} });
};

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

  router.push({ path: '/staff', query: merged });
};

// Theo dõi thay đổi của route.query để tự động fetch
watch(
  () => route.query,
  () => {
    fetchStaffList();
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
// MODALS VÀ CÁC THAO TÁC XỬ LÝ
// =============================================================================
const createModalRef = ref(null);
const editModalRef = ref(null);
const roleModalRef = ref(null);
const resetPwdModalRef = ref(null);
const lockModalRef = ref(null);
const unlockModalRef = ref(null);
const deleteModalRef = ref(null);

const activeTargetStaff = ref(null);
const lockReason = ref('');
const isLocking = ref(false);
const isUnlocking = ref(false);
const isDeleting = ref(false);

const openCreateModal = () => {
  if (createModalRef.value) {
    createModalRef.value.open();
  }
};

const openEditModal = (staff) => {
  if (editModalRef.value) {
    editModalRef.value.open(staff);
  }
};

const openRoleModal = (staff) => {
  if (roleModalRef.value) {
    roleModalRef.value.open(staff);
  }
};

const openResetPasswordModal = (staff) => {
  if (resetPwdModalRef.value) {
    resetPwdModalRef.value.open(staff);
  }
};

const openLockModal = (staff) => {
  activeTargetStaff.value = staff;
  lockReason.value = '';
  if (lockModalRef.value) {
    lockModalRef.value.show();
  }
};

const openUnlockModal = (staff) => {
  activeTargetStaff.value = staff;
  if (unlockModalRef.value) {
    unlockModalRef.value.show();
  }
};

const openDeleteModal = (staff) => {
  activeTargetStaff.value = staff;
  if (deleteModalRef.value) {
    deleteModalRef.value.show();
  }
};

// Sự kiện lưu thành công từ các modal
const onStaffCreated = (newStaff) => {
  successMessage.value = `Thêm nhân viên "${newStaff.HoTenNV}" (${newStaff.MSNV}) thành công.`;
  fetchStaffList();
};

const onStaffUpdated = (updated) => {
  successMessage.value = `Cập nhật thông tin nhân viên "${updated.HoTenNV}" (${updated.MSNV}) thành công.`;
  fetchStaffList();
};

const onRoleUpdated = (updated) => {
  const roleName = updated.VaiTro === 'admin' ? 'Quản trị viên' : 'Thủ thư';
  successMessage.value = `Đã đổi vai trò của nhân viên "${updated.HoTenNV}" (${updated.MSNV}) sang "${roleName}".`;
  fetchStaffList();
};

const onPasswordReset = (staff) => {
  successMessage.value = `Đã cấp lại mật khẩu tạm thời cho nhân viên "${staff.HoTenNV}" (${staff.MSNV}). Nhân viên sẽ phải đổi mật khẩu khi đăng nhập.`;
  fetchStaffList();
};

// Thao tác Khóa tài khoản
const handleConfirmLock = async () => {
  if (!activeTargetStaff.value) return;

  isLocking.value = true;
  errorMessage.value = '';

  try {
    await staffApi.updateStatus(activeTargetStaff.value.MSNV, {
      TrangThai: 'BiKhoa',
      LyDo: lockReason.value.trim() || undefined,
    });

    if (lockModalRef.value) {
      lockModalRef.value.hide();
    }
    successMessage.value = `Đã khóa tài khoản nhân viên "${activeTargetStaff.value.HoTenNV}" (${activeTargetStaff.value.MSNV}). Toàn bộ phiên làm việc của nhân viên này đã bị thu hồi.`;
    activeTargetStaff.value = null;
    lockReason.value = '';
    fetchStaffList();
  } catch (err) {
    errorMessage.value = getErrorMessage(err);
  } finally {
    isLocking.value = false;
  }
};

// Thao tác Mở khóa tài khoản
const handleConfirmUnlock = async () => {
  if (!activeTargetStaff.value) return;

  isUnlocking.value = true;
  errorMessage.value = '';

  try {
    await staffApi.updateStatus(activeTargetStaff.value.MSNV, {
      TrangThai: 'HoatDong',
    });

    if (unlockModalRef.value) {
      unlockModalRef.value.hide();
    }
    successMessage.value = `Đã mở khóa tài khoản nhân viên "${activeTargetStaff.value.HoTenNV}" (${activeTargetStaff.value.MSNV}).`;
    activeTargetStaff.value = null;
    fetchStaffList();
  } catch (err) {
    errorMessage.value = getErrorMessage(err);
  } finally {
    isUnlocking.value = false;
  }
};

// Thao tác Xóa nhân viên
const handleConfirmDelete = async () => {
  if (!activeTargetStaff.value) return;

  isDeleting.value = true;
  errorMessage.value = '';

  try {
    await staffApi.remove(activeTargetStaff.value.MSNV);

    if (deleteModalRef.value) {
      deleteModalRef.value.hide();
    }
    successMessage.value = `Đã xóa tài khoản nhân viên "${activeTargetStaff.value.HoTenNV}" (${activeTargetStaff.value.MSNV}) khỏi hệ thống.`;
    activeTargetStaff.value = null;
    fetchStaffList();
  } catch (err) {
    // Nếu lỗi do nhân viên đã từng mượn/trả sách (HAS_BORROWING_ACTIONS) hoặc admin duy nhất (LAST_ADMIN)
    const errCode = err?.response?.data?.error?.code;
    if (errCode === 'HAS_BORROWING_ACTIONS') {
      errorMessage.value = `Không thể xóa nhân viên "${activeTargetStaff.value?.HoTenNV}" vì đã có lịch sử tham gia xử lý phiếu mượn sách. Bạn có thể chọn "Khóa tài khoản" nếu muốn dừng quyền truy cập của nhân viên này.`;
    } else if (errCode === 'LAST_ADMIN') {
      errorMessage.value = 'Không thể xóa vì đây là quản trị viên đang hoạt động duy nhất trong hệ thống.';
    } else {
      errorMessage.value = getErrorMessage(err);
    }
    if (deleteModalRef.value) {
      deleteModalRef.value.hide();
    }
  } finally {
    isDeleting.value = false;
  }
};
</script>

<template>
  <div class="staff-view">
    <!-- Tiêu đề trang & Nút thêm nhân viên -->
    <div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4">
      <div>
        <div class="d-flex align-items-center gap-2">
          <div class="p-2 bg-primary-subtle text-primary rounded-3">
            <i class="bi bi-people-fill fs-4"></i>
          </div>
          <div>
            <h1 class="h3 fw-bold mb-0 text-dark">Quản lý Nhân viên</h1>
            <p class="text-muted small mb-0">
              Quản lý tài khoản cán bộ thư viện, phân quyền Quản trị viên / Thủ thư và cấp mật khẩu tạm.
            </p>
          </div>
        </div>
      </div>

      <div>
        <button
          type="button"
          class="btn btn-primary d-flex align-items-center gap-2 shadow-sm px-3 py-2"
          @click="openCreateModal"
        >
          <i class="bi bi-person-plus-fill"></i>
          <span>Thêm nhân viên mới</span>
        </button>
      </div>
    </div>

    <!-- Thông báo thành công -->
    <AppAlert
      v-if="successMessage"
      type="success"
      :message="successMessage"
      dismissible
      class="mb-3"
      @dismiss="successMessage = ''"
    />

    <!-- Thông báo lỗi chung -->
    <AppAlert
      v-if="errorMessage"
      type="danger"
      :message="errorMessage"
      dismissible
      class="mb-3"
      @dismiss="errorMessage = ''"
    />

    <!-- Khối thẻ chính chứa Bộ lọc và Bảng dữ liệu -->
    <div class="card border-0 shadow-sm">
      <!-- Thanh công cụ & Bộ lọc -->
      <div class="card-header bg-white border-bottom p-3">
        <div class="row g-2 align-items-center">
          <!-- Ô tìm kiếm -->
          <div class="col-lg-4 col-md-6">
            <div class="input-group input-group-sm">
              <span class="input-group-text bg-light text-muted border-end-0">
                <i class="bi bi-search"></i>
              </span>
              <input
                v-model="searchInput"
                type="text"
                class="form-control border-start-0 ps-0"
                placeholder="Tìm theo MSNV, họ tên, chức vụ, SĐT..."
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

          <!-- Lọc vai trò -->
          <div class="col-lg-2 col-md-3 col-sm-6">
            <select
              class="form-select form-select-sm"
              :value="queryVaiTro"
              aria-label="Lọc theo vai trò"
              @change="onRoleChange"
            >
              <option value="">Tất cả vai trò</option>
              <option value="admin">Quản trị viên (admin)</option>
              <option value="thuthu">Thủ thư (thuthu)</option>
            </select>
          </div>

          <!-- Lọc trạng thái -->
          <div class="col-lg-2 col-md-3 col-sm-6">
            <select
              class="form-select form-select-sm"
              :value="queryTrangThai"
              aria-label="Lọc theo trạng thái"
              @change="onStatusChange"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="HoatDong">Đang hoạt động</option>
              <option value="BiKhoa">Bị khóa</option>
            </select>
          </div>

          <!-- Sắp xếp -->
          <div class="col-lg-2 col-md-4 col-sm-6">
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
          <div class="col-lg-2 col-md-2 col-sm-6 text-end">
            <button
              v-if="isFiltered"
              type="button"
              class="btn btn-outline-secondary btn-sm w-100 d-flex align-items-center justify-content-center gap-1"
              title="Đặt lại toàn bộ bộ lọc"
              @click="resetAllFilters"
            >
              <i class="bi bi-arrow-counterclockwise"></i>
              <span>Xóa bộ lọc</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Bảng dữ liệu hoặc Trạng thái trống / Đang tải -->
      <div class="card-body p-0">
        <!-- Đang tải -->
        <div v-if="isLoading" class="p-5 text-center">
          <LoadingSpinner text="Đang nạp danh sách nhân viên..." />
        </div>

        <!-- Trống dữ liệu -->
        <div v-else-if="staffList.length === 0" class="p-4">
          <EmptyState
            icon="bi-people"
            title="Không tìm thấy nhân viên nào"
            :message="isFiltered ? 'Không có nhân viên nào phù hợp với các tiêu chí tìm kiếm hoặc bộ lọc hiện tại.' : 'Hệ thống chưa có nhân viên nào khác.'"
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

        <!-- Danh sách nhân viên -->
        <div v-else class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead class="table-light text-muted small text-uppercase">
              <tr>
                <th scope="col" class="ps-3" style="width: 130px;">Mã NV</th>
                <th scope="col">Họ và tên / Chức vụ</th>
                <th scope="col" style="width: 160px;">Vai trò</th>
                <th scope="col">Liên hệ</th>
                <th scope="col" style="width: 140px;">Trạng thái</th>
                <th scope="col" style="width: 140px;">Đổi mật khẩu</th>
                <th scope="col" style="width: 160px;">Đăng nhập cuối</th>
                <th scope="col" class="text-end pe-3" style="width: 190px;">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="s in staffList"
                :key="s.MSNV"
                :class="{ 'table-active': s.MSNV === currentAdminMsnv }"
              >
                <!-- Mã NV -->
                <td class="ps-3">
                  <div class="d-flex align-items-center gap-1">
                    <span class="font-monospace fw-bold text-dark">{{ s.MSNV }}</span>
                    <span
                      v-if="s.MSNV === currentAdminMsnv"
                      class="badge bg-primary-subtle text-primary border border-primary-subtle small ms-1"
                      title="Tài khoản đang đăng nhập hiện tại"
                    >
                      Bạn
                    </span>
                  </div>
                </td>

                <!-- Họ tên & Chức vụ -->
                <td>
                  <div class="fw-bold text-dark">{{ s.HoTenNV }}</div>
                  <div class="small text-muted">
                    {{ s.ChucVu || '—' }}
                  </div>
                </td>

                <!-- Vai trò -->
                <td>
                  <span
                    v-if="s.VaiTro === 'admin'"
                    class="badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1"
                  >
                    <i class="bi bi-shield-lock-fill me-1"></i>Quản trị viên
                  </span>
                  <span
                    v-else
                    class="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-2 py-1"
                  >
                    <i class="bi bi-book-half me-1"></i>Thủ thư
                  </span>
                </td>

                <!-- Liên hệ (SĐT & Địa chỉ) -->
                <td>
                  <div v-if="s.SoDienThoai" class="small text-dark font-monospace">
                    <i class="bi bi-telephone text-muted me-1"></i>{{ s.SoDienThoai }}
                  </div>
                  <div v-else class="small text-muted">—</div>
                  <div v-if="s.DiaChi" class="small text-muted text-truncate" style="max-width: 200px;" :title="s.DiaChi">
                    <i class="bi bi-geo-alt text-muted me-1"></i>{{ s.DiaChi }}
                  </div>
                </td>

                <!-- Trạng thái -->
                <td>
                  <span
                    v-if="s.TrangThai === 'HoatDong'"
                    class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1"
                  >
                    <i class="bi bi-check-circle-fill me-1"></i>Hoạt động
                  </span>
                  <span
                    v-else
                    class="badge bg-danger-subtle text-danger border border-danger-subtle px-2 py-1"
                  >
                    <i class="bi bi-lock-fill me-1"></i>Bị khóa
                  </span>
                </td>

                <!-- Cờ đổi mật khẩu -->
                <td>
                  <span
                    v-if="s.BatBuocDoiMatKhau"
                    class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle px-2 py-1"
                    title="Nhân viên phải đổi mật khẩu ở lần đăng nhập tiếp theo"
                  >
                    <i class="bi bi-key-fill me-1"></i>Chờ đổi
                  </span>
                  <span v-else class="badge bg-light text-muted border px-2 py-1">
                    Bình thường
                  </span>
                </td>

                <!-- Đăng nhập cuối -->
                <td class="small text-muted">
                  {{ formatDate(s.LanDangNhapCuoi, true) }}
                </td>

                <!-- Thao tác hành động -->
                <td class="text-end pe-3">
                  <div class="btn-group btn-group-sm" role="group" aria-label="Thao tác nhân viên">
                    <!-- Sửa thông tin -->
                    <button
                      type="button"
                      class="btn btn-outline-secondary"
                      title="Chỉnh sửa thông tin"
                      @click="openEditModal(s)"
                    >
                      <i class="bi bi-pencil"></i>
                    </button>

                    <!-- Đổi vai trò -->
                    <button
                      type="button"
                      class="btn btn-outline-warning"
                      :disabled="s.MSNV === currentAdminMsnv"
                      :title="s.MSNV === currentAdminMsnv ? 'Bạn không thể tự thay đổi vai trò của chính mình' : 'Thay đổi vai trò'"
                      @click="openRoleModal(s)"
                    >
                      <i class="bi bi-arrow-left-right"></i>
                    </button>

                    <!-- Cấp lại mật khẩu tạm -->
                    <button
                      type="button"
                      class="btn btn-outline-info"
                      title="Cấp mật khẩu tạm thời mới"
                      @click="openResetPasswordModal(s)"
                    >
                      <i class="bi bi-key"></i>
                    </button>

                    <!-- Khóa / Mở khóa -->
                    <button
                      v-if="s.TrangThai === 'HoatDong'"
                      type="button"
                      class="btn btn-outline-danger"
                      :disabled="s.MSNV === currentAdminMsnv"
                      :title="s.MSNV === currentAdminMsnv ? 'Bạn không thể tự khóa tài khoản của chính mình' : 'Khóa tài khoản'"
                      @click="openLockModal(s)"
                    >
                      <i class="bi bi-lock"></i>
                    </button>
                    <button
                      v-else
                      type="button"
                      class="btn btn-outline-success"
                      title="Mở khóa tài khoản"
                      @click="openUnlockModal(s)"
                    >
                      <i class="bi bi-unlock"></i>
                    </button>

                    <!-- Xóa nhân viên -->
                    <button
                      type="button"
                      class="btn btn-outline-danger"
                      :disabled="s.MSNV === currentAdminMsnv"
                      :title="s.MSNV === currentAdminMsnv ? 'Bạn không thể tự xóa tài khoản của chính mình' : 'Xóa tài khoản nhân viên'"
                      @click="openDeleteModal(s)"
                    >
                      <i class="bi bi-trash"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Chân trang & Phân trang -->
      <div
        v-if="!isLoading && pagination.total > 0"
        class="card-footer bg-white border-top p-3 d-flex flex-wrap align-items-center justify-content-between gap-2"
      >
        <div class="small text-muted">
          Hiển thị <strong>{{ staffList.length }}</strong> trong tổng số <strong>{{ pagination.total }}</strong> nhân viên
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

    <!-- MODAL THÊM NHÂN VIÊN MỚI -->
    <StaffCreateModal
      ref="createModalRef"
      @created="onStaffCreated"
    />

    <!-- MODAL SỬA THÔNG TIN NHÂN VIÊN -->
    <StaffEditModal
      ref="editModalRef"
      @updated="onStaffUpdated"
    />

    <!-- MODAL THAY ĐỔI VAI TRÒ -->
    <StaffRoleModal
      ref="roleModalRef"
      @updated="onRoleUpdated"
    />

    <!-- MODAL CẤP MẬT KHẨU TẠM THỜI -->
    <StaffResetPasswordModal
      ref="resetPwdModalRef"
      @updated="onPasswordReset"
    />

    <!-- MODAL KHÓA TÀI KHOẢN -->
    <ConfirmModal
      ref="lockModalRef"
      title="Khóa tài khoản nhân viên"
      :message="`Bạn có chắc chắn muốn khóa tài khoản nhân viên &quot;${activeTargetStaff?.HoTenNV}&quot; (${activeTargetStaff?.MSNV}) không? Khi bị khóa, nhân viên sẽ không thể đăng nhập và mọi phiên làm việc hiện tại sẽ bị thu hồi ngay lập tức.`"
      confirm-text="Khóa tài khoản"
      confirm-btn-class="btn-danger"
      :is-processing="isLocking"
      icon="bi-lock-fill text-danger"
      @confirm="handleConfirmLock"
      @cancel="lockReason = ''"
    >
      <template #extra>
        <div class="mt-3">
          <label for="staffLockReasonInput" class="form-label small fw-medium text-dark">
            Lý do khóa tài khoản (tùy chọn, tối đa 300 ký tự):
          </label>
          <textarea
            id="staffLockReasonInput"
            v-model="lockReason"
            class="form-control form-control-sm"
            rows="2"
            maxlength="300"
            placeholder="Ví dụ: Tạm đình chỉ công tác, nghỉ phép dài hạn..."
          ></textarea>
        </div>
      </template>
    </ConfirmModal>

    <!-- MODAL MỞ KHÓA TÀI KHOẢN -->
    <ConfirmModal
      ref="unlockModalRef"
      title="Mở khóa tài khoản nhân viên"
      :message="`Bạn có chắc chắn muốn mở khóa cho tài khoản nhân viên &quot;${activeTargetStaff?.HoTenNV}&quot; (${activeTargetStaff?.MSNV}) không? Nhân viên sẽ có thể đăng nhập lại và số lần sai mật khẩu sẽ được đặt lại về 0.`"
      confirm-text="Mở khóa tài khoản"
      confirm-btn-class="btn-success"
      :is-processing="isUnlocking"
      icon="bi-unlock-fill text-success"
      @confirm="handleConfirmUnlock"
    />

    <!-- MODAL XÓA TÀI KHOẢN -->
    <ConfirmModal
      ref="deleteModalRef"
      title="Xác nhận xóa tài khoản nhân viên"
      :message="`Bạn có chắc chắn muốn xóa tài khoản nhân viên &quot;${activeTargetStaff?.HoTenNV}&quot; (${activeTargetStaff?.MSNV}) khỏi hệ thống không? Hành động này sẽ xóa vĩnh viễn và không thể hoàn tác.`"
      confirm-text="Xóa nhân viên"
      confirm-btn-class="btn-danger"
      :is-processing="isDeleting"
      icon="bi-trash-fill text-danger"
      @confirm="handleConfirmDelete"
    />
  </div>
</template>

<style scoped>
.staff-view {
  min-height: 100%;
}
</style>
