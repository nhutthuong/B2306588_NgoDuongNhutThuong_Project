<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import statsApi from '../../api/stats.api.js';
import { getErrorMessage } from '../../api/http.js';
import { formatCurrency, formatDate } from '../../utils/format.js';
import AppPagination from '../AppPagination.vue';
import LoadingSpinner from '../LoadingSpinner.vue';

const router = useRouter();

const overdueList = ref([]);
const meta = ref({
  page: 1,
  limit: 10,
  total: 0,
  totalPages: 1,
  soQuaHan: 0,
});

const isLoading = ref(true);
const errorMessage = ref('');

/**
 * Lấy danh sách phiếu mượn quá hạn từ backend API
 * @param {number} [page=1]
 */
const fetchOverdue = async (page = 1) => {
  isLoading.value = true;
  errorMessage.value = '';

  try {
    const res = await statsApi.getOverdue({
      page,
      limit: meta.value.limit,
    });

    const data = res.data?.data || [];
    const resMeta = res.data?.meta || {};

    overdueList.value = data;
    meta.value = {
      page: resMeta.page || page,
      limit: resMeta.limit || 10,
      total: resMeta.total || 0,
      totalPages: resMeta.totalPages || 1,
      soQuaHan: resMeta.soQuaHan ?? resMeta.total ?? 0,
    };
  } catch (err) {
    errorMessage.value = getErrorMessage(err);
  } finally {
    isLoading.value = false;
  }
};

const onPageChange = (newPage) => {
  if (newPage !== meta.value.page) {
    fetchOverdue(newPage);
  }
};

const goToBorrowingsWithFilter = () => {
  router.push({
    path: '/borrowings',
    query: {
      trangThai: 'DangMuon',
      quaHan: 'true',
    },
  });
};

const viewBorrowingDetail = (item) => {
  router.push({
    path: '/borrowings',
    query: {
      maDocGia: item.MaDocGia,
      trangThai: 'DangMuon',
    },
  });
};

onMounted(() => {
  fetchOverdue(1);
});

defineExpose({
  refresh: () => fetchOverdue(meta.value.page),
});
</script>

<template>
  <div class="card shadow-sm border-0 rounded-4">
    <div class="card-header bg-transparent border-0 pt-4 px-4 pb-2 d-flex flex-wrap align-items-center justify-content-between gap-2">
      <div>
        <div class="d-flex align-items-center gap-2">
          <h5 class="card-title fw-bold mb-0 text-dark d-flex align-items-center gap-2">
            <i class="bi bi-exclamation-triangle-fill text-danger"></i>
            <span>Phiếu Mượn Quá Hạn Cần Thu Hồi</span>
          </h5>
          <span
            class="badge rounded-pill"
            :class="meta.total > 0 ? 'bg-danger text-white' : 'bg-success text-white'"
          >
            {{ meta.total }} phiếu
          </span>
        </div>
        <p class="card-subtitle text-muted small mt-1 mb-0">
          Các phiếu đang mượn có hạn trả trước thời điểm hiện tại, sắp xếp theo trễ lâu nhất lên đầu
        </p>
      </div>

      <div class="d-flex align-items-center gap-2">
        <button
          type="button"
          class="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1"
          @click="goToBorrowingsWithFilter"
        >
          <i class="bi bi-box-arrow-up-right"></i>
          <span>Mở danh sách mượn</span>
        </button>
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary"
          title="Tải lại danh sách quá hạn"
          :disabled="isLoading"
          @click="fetchOverdue(meta.page)"
        >
          <i class="bi bi-arrow-clockwise" :class="{ 'spin-anim': isLoading }"></i>
        </button>
      </div>
    </div>

    <div class="card-body p-0">
      <!-- Trạng thái loading -->
      <div v-if="isLoading" class="p-5 text-center">
        <LoadingSpinner message="Đang tải danh sách quá hạn..." />
      </div>

      <!-- Trạng thái lỗi -->
      <div v-else-if="errorMessage" class="p-4 text-center">
        <div class="alert alert-danger d-inline-block py-2 px-3 small mb-2" role="alert">
          <i class="bi bi-exclamation-octagon me-1"></i>
          {{ errorMessage }}
        </div>
        <div>
          <button type="button" class="btn btn-sm btn-outline-danger" @click="fetchOverdue(meta.page)">
            Thử lại
          </button>
        </div>
      </div>

      <!-- Trạng thái rỗng: Không có phiếu quá hạn -->
      <div v-else-if="overdueList.length === 0" class="p-5 text-center text-muted">
        <div class="mb-3">
          <i class="bi bi-shield-check text-success" style="font-size: 3rem;"></i>
        </div>
        <h6 class="fw-bold text-dark mb-1">Hiện không có phiếu mượn nào bị quá hạn</h6>
        <p class="small text-muted mb-0">Tất cả độc giả đều đang trả sách đúng hạn hoặc chưa tới hạn trả.</p>
      </div>

      <!-- Bảng dữ liệu quá hạn -->
      <div v-else class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead class="table-light text-muted small text-uppercase">
            <tr>
              <th scope="col" class="ps-4">Sách</th>
              <th scope="col">Độc giả</th>
              <th scope="col">Liên hệ</th>
              <th scope="col">Mượn / Hạn trả</th>
              <th scope="col" class="text-center">Số ngày trễ</th>
              <th scope="col" class="text-end">Phí trễ tạm tính</th>
              <th scope="col" class="text-end pe-4">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in overdueList" :key="item._id">
              <!-- Sách -->
              <td class="ps-4">
                <div class="fw-semibold text-dark">{{ item.TenSach }}</div>
                <div class="small text-muted font-monospace">Mã sách: {{ item.MaSach }}</div>
              </td>

              <!-- Độc giả -->
              <td>
                <div class="fw-semibold text-dark">{{ item.HoTen }}</div>
                <div class="small text-muted font-monospace">{{ item.MaDocGia }}</div>
              </td>

              <!-- Liên hệ -->
              <td>
                <div v-if="item.DienThoai" class="small">
                  <a :href="`tel:${item.DienThoai}`" class="text-decoration-none text-primary d-inline-flex align-items-center gap-1">
                    <i class="bi bi-telephone-fill"></i>
                    <span>{{ item.DienThoai }}</span>
                  </a>
                </div>
                <div v-if="item.Email" class="small">
                  <a :href="`mailto:${item.Email}`" class="text-decoration-none text-muted text-truncate d-inline-block" style="max-width: 170px;">
                    <i class="bi bi-envelope"></i>
                    {{ item.Email }}
                  </a>
                </div>
                <div v-if="!item.DienThoai && !item.Email" class="text-muted small">
                  —
                </div>
              </td>

              <!-- Mượn / Hạn trả -->
              <td class="small">
                <div>Mượn: <span class="text-dark">{{ formatDate(item.NgayMuon) }}</span></div>
                <div>Hạn: <span class="text-danger fw-semibold">{{ formatDate(item.HanTra) }}</span></div>
              </td>

              <!-- Số ngày trễ -->
              <td class="text-center">
                <span class="badge bg-danger rounded-pill px-2 py-1">
                  Trễ {{ item.soNgayTre }} ngày
                </span>
              </td>

              <!-- Phí trễ dự kiến -->
              <td class="text-end fw-bold text-danger">
                {{ formatCurrency(item.phiTreDuKien) }}
              </td>

              <!-- Thao tác -->
              <td class="text-end pe-4">
                <button
                  type="button"
                  class="btn btn-sm btn-outline-primary py-1 px-2"
                  title="Xem lịch sử phiếu của độc giả"
                  @click="viewBorrowingDetail(item)"
                >
                  <i class="bi bi-arrow-right-short fs-6"></i>
                  <span class="d-none d-md-inline">Xem</span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Phân trang -->
    <div
      v-if="!isLoading && !errorMessage && meta.totalPages > 1"
      class="card-footer bg-transparent border-0 px-4 py-3 d-flex flex-wrap align-items-center justify-content-between gap-2"
    >
      <div class="small text-muted">
        Hiển thị trang {{ meta.page }} / {{ meta.totalPages }} (Tổng cộng {{ meta.total }} phiếu quá hạn)
      </div>
      <AppPagination
        :current-page="meta.page"
        :total-pages="meta.totalPages"
        @change-page="onPageChange"
      />
    </div>
  </div>
</template>

<style scoped>
.spin-anim {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  100% {
    transform: rotate(360deg);
  }
}
</style>
