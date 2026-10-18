<script setup>
import { ref, reactive, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import statsApi from '../../api/stats.api.js';
import { getErrorMessage } from '../../api/http.js';
import { formatCurrency } from '../../utils/format.js';
import LoadingSpinner from '../LoadingSpinner.vue';

const router = useRouter();

// Bộ lọc thời gian
const activePreset = ref('all'); // 'all', '30days', 'year', 'custom'
const customDates = reactive({
  tuNgay: '',
  denNgay: '',
});

const topBooks = ref([]);
const topReaders = ref([]);
const isLoading = ref(true);
const errorMessage = ref('');

/**
 * Tính toán tham số ngày bắt đầu và kết thúc theo preset
 */
const getDateRangeParams = () => {
  const now = new Date();
  const formatYYYYMMDD = (d) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  if (activePreset.value === '30days') {
    const past = new Date();
    past.setDate(past.getDate() - 30);
    return {
      tuNgay: formatYYYYMMDD(past),
      denNgay: formatYYYYMMDD(now),
    };
  }

  if (activePreset.value === 'year') {
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    return {
      tuNgay: formatYYYYMMDD(startOfYear),
      denNgay: formatYYYYMMDD(now),
    };
  }

  if (activePreset.value === 'custom') {
    const params = {};
    if (customDates.tuNgay) params.tuNgay = customDates.tuNgay;
    if (customDates.denNgay) params.denNgay = customDates.denNgay;
    return params;
  }

  // 'all': không truyền tuNgay, denNgay
  return {};
};

/**
 * Tải cả Top sách và Top độc giả
 */
const fetchRankings = async () => {
  isLoading.value = true;
  errorMessage.value = '';

  const dateParams = getDateRangeParams();

  try {
    const [booksRes, readersRes] = await Promise.all([
      statsApi.getTopBooks({ limit: 8, ...dateParams }),
      statsApi.getTopReaders({ limit: 8, ...dateParams }),
    ]);

    topBooks.value = booksRes.data?.data || [];
    topReaders.value = readersRes.data?.data || [];
  } catch (err) {
    errorMessage.value = getErrorMessage(err);
  } finally {
    isLoading.value = false;
  }
};

const setPreset = (preset) => {
  activePreset.value = preset;
  if (preset !== 'custom') {
    fetchRankings();
  }
};

const applyCustomFilter = () => {
  if (customDates.tuNgay && customDates.denNgay && customDates.tuNgay > customDates.denNgay) {
    errorMessage.value = 'Ngày bắt đầu không được sau ngày kết thúc.';
    return;
  }
  fetchRankings();
};

const goToReaderDetail = (maDocGia) => {
  router.push(`/readers/${maDocGia}`);
};

onMounted(() => {
  fetchRankings();
});

defineExpose({
  refresh: fetchRankings,
});
</script>

<template>
  <div class="card shadow-sm border-0 rounded-4">
    <div class="card-header bg-transparent border-0 pt-4 px-4 pb-2">
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div>
          <h5 class="card-title fw-bold mb-1 text-dark d-flex align-items-center gap-2">
            <i class="bi bi-award-fill text-warning"></i>
            <span>Bảng Xếp Hạng Thư Viện</span>
          </h5>
          <p class="card-subtitle text-muted small mb-0">
            Top đầu sách và độc giả có nhiều lượt mượn nhất
          </p>
        </div>

        <!-- Bộ lọc thời gian presets -->
        <div class="d-flex flex-wrap align-items-center gap-1 bg-light p-1 rounded-3">
          <button
            type="button"
            class="btn btn-sm"
            :class="activePreset === 'all' ? 'btn-white shadow-sm fw-bold text-primary' : 'btn-light text-muted'"
            @click="setPreset('all')"
          >
            Toàn thời gian
          </button>
          <button
            type="button"
            class="btn btn-sm"
            :class="activePreset === '30days' ? 'btn-white shadow-sm fw-bold text-primary' : 'btn-light text-muted'"
            @click="setPreset('30days')"
          >
            30 ngày qua
          </button>
          <button
            type="button"
            class="btn btn-sm"
            :class="activePreset === 'year' ? 'btn-white shadow-sm fw-bold text-primary' : 'btn-light text-muted'"
            @click="setPreset('year')"
          >
            Năm nay
          </button>
          <button
            type="button"
            class="btn btn-sm"
            :class="activePreset === 'custom' ? 'btn-white shadow-sm fw-bold text-primary' : 'btn-light text-muted'"
            @click="setPreset('custom')"
          >
            Tùy chọn
          </button>
        </div>
      </div>

      <!-- Khối chọn ngày tùy biến khi activePreset === 'custom' -->
      <div v-if="activePreset === 'custom'" class="row g-2 align-items-end mt-2 pt-2 border-top">
        <div class="col-sm-5 col-md-4">
          <label class="form-label small text-muted mb-1">Từ ngày:</label>
          <input
            type="date"
            v-model="customDates.tuNgay"
            class="form-control form-control-sm"
          />
        </div>
        <div class="col-sm-5 col-md-4">
          <label class="form-label small text-muted mb-1">Đến ngày:</label>
          <input
            type="date"
            v-model="customDates.denNgay"
            class="form-control form-control-sm"
          />
        </div>
        <div class="col-sm-2 col-md-4">
          <button
            type="button"
            class="btn btn-sm btn-primary"
            :disabled="isLoading"
            @click="applyCustomFilter"
          >
            <i class="bi bi-funnel-fill me-1"></i>
            Lọc
          </button>
        </div>
      </div>
    </div>

    <div class="card-body p-4 pt-2">
      <!-- Loading -->
      <div v-if="isLoading" class="p-5 text-center">
        <LoadingSpinner message="Đang tải dữ liệu xếp hạng..." />
      </div>

      <!-- Error -->
      <div v-else-if="errorMessage" class="p-4 text-center">
        <div class="alert alert-danger d-inline-block py-2 px-3 small mb-2" role="alert">
          <i class="bi bi-exclamation-octagon me-1"></i>
          {{ errorMessage }}
        </div>
        <div>
          <button type="button" class="btn btn-sm btn-outline-danger" @click="fetchRankings">
            Thử lại
          </button>
        </div>
      </div>

      <!-- Hai cột xếp hạng -->
      <div v-else class="row g-4">
        <!-- Cột 1: Top Sách -->
        <div class="col-lg-6">
          <div class="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom">
            <h6 class="fw-bold mb-0 text-dark d-flex align-items-center gap-2">
              <i class="bi bi-book-fill text-primary"></i>
              <span>Top Sách Mượn Nhiều Nhất</span>
            </h6>
            <span class="badge bg-primary-subtle text-primary border border-primary-subtle">
              {{ topBooks.length }} đầu sách
            </span>
          </div>

          <div v-if="topBooks.length === 0" class="text-center py-4 text-muted small">
            Chưa có lượt mượn nào trong khoảng thời gian này.
          </div>

          <div v-else class="list-group list-group-flush">
            <div
              v-for="(book, index) in topBooks"
              :key="book.MaSach"
              class="list-group-item px-0 py-2 border-0 d-flex align-items-center justify-content-between gap-2"
            >
              <div class="d-flex align-items-center gap-3 text-truncate">
                <!-- Rank Badge -->
                <span
                  class="badge rounded-circle d-flex align-items-center justify-content-center fw-bold"
                  style="width: 28px; height: 28px; flex-shrink: 0;"
                  :class="{
                    'bg-warning text-dark': index === 0,
                    'bg-secondary-subtle text-dark': index === 1,
                    'bg-danger-subtle text-danger': index === 2,
                    'bg-light text-muted': index > 2,
                  }"
                >
                  {{ index + 1 }}
                </span>

                <div class="text-truncate">
                  <div class="fw-semibold text-dark text-truncate" :title="book.TenSach">
                    {{ book.TenSach }}
                    <span v-if="book.daXoa" class="badge bg-danger-subtle text-danger border border-danger-subtle ms-1 small">
                      Đã xóa
                    </span>
                  </div>
                  <div class="small text-muted text-truncate">
                    <span class="font-monospace me-2">{{ book.MaSach }}</span>
                    <span v-if="book.NguonGocTacGia">• {{ book.NguonGocTacGia }}</span>
                  </div>
                </div>
              </div>

              <!-- Lượt mượn -->
              <div class="text-end" style="flex-shrink: 0;">
                <span class="badge bg-primary rounded-pill px-2 py-1">
                  {{ book.soLuotMuon }} lượt
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Cột 2: Top Độc Giả -->
        <div class="col-lg-6">
          <div class="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom">
            <h6 class="fw-bold mb-0 text-dark d-flex align-items-center gap-2">
              <i class="bi bi-people-fill text-success"></i>
              <span>Top Độc Giả Mượn Nhiều Nhất</span>
            </h6>
            <span class="badge bg-success-subtle text-success border border-success-subtle">
              {{ topReaders.length }} độc giả
            </span>
          </div>

          <div v-if="topReaders.length === 0" class="text-center py-4 text-muted small">
            Chưa có độc giả nào mượn sách trong khoảng thời gian này.
          </div>

          <div v-else class="list-group list-group-flush">
            <div
              v-for="(reader, index) in topReaders"
              :key="reader.MaDocGia"
              class="list-group-item px-0 py-2 border-0 d-flex align-items-center justify-content-between gap-2"
            >
              <div class="d-flex align-items-center gap-3 text-truncate">
                <!-- Rank Badge -->
                <span
                  class="badge rounded-circle d-flex align-items-center justify-content-center fw-bold"
                  style="width: 28px; height: 28px; flex-shrink: 0;"
                  :class="{
                    'bg-warning text-dark': index === 0,
                    'bg-secondary-subtle text-dark': index === 1,
                    'bg-danger-subtle text-danger': index === 2,
                    'bg-light text-muted': index > 2,
                  }"
                >
                  {{ index + 1 }}
                </span>

                <div class="text-truncate">
                  <div class="fw-semibold text-dark text-truncate">
                    {{ reader.HoTen }}
                  </div>
                  <div class="small text-muted font-monospace">
                    {{ reader.MaDocGia }}
                    <span v-if="reader.tongPhat > 0" class="text-danger ms-2">
                      (Phạt: {{ formatCurrency(reader.tongPhat) }})
                    </span>
                  </div>
                </div>
              </div>

              <!-- Lượt mượn & nút xem -->
              <div class="d-flex align-items-center gap-2" style="flex-shrink: 0;">
                <span class="badge bg-success rounded-pill px-2 py-1">
                  {{ reader.soLuotMuon }} lượt
                </span>
                <button
                  type="button"
                  class="btn btn-sm btn-outline-secondary py-0 px-1"
                  title="Xem hồ sơ độc giả"
                  @click="goToReaderDetail(reader.MaDocGia)"
                >
                  <i class="bi bi-chevron-right small"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.btn-white {
  background-color: #fff;
  border-color: #dee2e6;
}
</style>
