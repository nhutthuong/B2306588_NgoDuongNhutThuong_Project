<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  CategoryScale,
  LinearScale,
} from 'chart.js';
import { Bar } from 'vue-chartjs';
import statsApi from '../../api/stats.api.js';
import { getErrorMessage } from '../../api/http.js';
import LoadingSpinner from '../LoadingSpinner.vue';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const currentYear = new Date().getFullYear();
const selectedYear = ref(currentYear);
const isLoading = ref(true);
const errorMessage = ref('');

// Danh sách các năm để chọn (từ 2022 đến năm hiện tại + 1)
const availableYears = computed(() => {
  const years = [];
  for (let y = currentYear + 1; y >= 2022; y--) {
    years.push(y);
  }
  return years;
});

const chartDataRaw = ref(null);
const summary = ref({
  luotMuon: 0,
  soDangKy: 0,
});

/**
 * Gọi API lấy dữ liệu thống kê mượn sách theo 12 tháng
 */
const fetchBorrowStats = async () => {
  isLoading.value = true;
  errorMessage.value = '';

  try {
    const res = await statsApi.getBorrowByMonth(selectedYear.value);
    const data = res.data?.data;

    if (data && Array.isArray(data.thang)) {
      chartDataRaw.value = data.thang;
      summary.value = {
        luotMuon: data.tongCaNam?.luotMuon || 0,
        soDangKy: data.tongCaNam?.soDangKy || 0,
      };
    }
  } catch (err) {
    errorMessage.value = getErrorMessage(err);
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  fetchBorrowStats();
});

watch(selectedYear, () => {
  fetchBorrowStats();
});

// Cấu hình dữ liệu cho Chart.js
const chartData = computed(() => {
  const labels = [
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4',
    'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8',
    'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
  ];

  if (!chartDataRaw.value) {
    return {
      labels,
      datasets: [],
    };
  }

  const luotMuonValues = chartDataRaw.value.map((item) => item.luotMuon || 0);
  const soDangKyValues = chartDataRaw.value.map((item) => item.soDangKy || 0);

  return {
    labels,
    datasets: [
      {
        label: 'Lượt mượn thực tế (Đã giao)',
        data: luotMuonValues,
        backgroundColor: '#0d6efd',
        borderColor: '#0b5ed7',
        borderWidth: 1,
        borderRadius: 4,
      },
      {
        label: 'Số đăng ký mượn (Mọi trạng thái)',
        data: soDangKyValues,
        backgroundColor: '#ffc107',
        borderColor: '#e0a800',
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  };
});

// Cấu hình tùy chọn biểu đồ
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top',
      labels: {
        font: { family: 'inherit', size: 12 },
        boxWidth: 14,
        padding: 16,
      },
    },
    tooltip: {
      mode: 'index',
      intersect: false,
      padding: 10,
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        precision: 0,
        font: { family: 'inherit', size: 11 },
      },
      grid: {
        color: '#f0f0f0',
      },
    },
    x: {
      grid: {
        display: false,
      },
      ticks: {
        font: { family: 'inherit', size: 11 },
      },
    },
  },
};

defineExpose({
  refresh: fetchBorrowStats,
});
</script>

<template>
  <div class="card shadow-sm border-0 rounded-4 h-100">
    <div class="card-header bg-transparent border-0 pt-4 px-4 pb-2 d-flex flex-wrap align-items-center justify-content-between gap-2">
      <div>
        <h5 class="card-title fw-bold mb-1 text-dark d-flex align-items-center gap-2">
          <i class="bi bi-bar-chart-line-fill text-primary"></i>
          <span>Thống kê Mượn Sách Theo Tháng</span>
        </h5>
        <p class="card-subtitle text-muted small mb-0">
          So sánh giữa số lượt đăng ký ban đầu và số lượt thực tế đã nhận sách
        </p>
      </div>

      <!-- Chọn năm -->
      <div class="d-flex align-items-center gap-2">
        <label for="borrowYearSelect" class="form-label small text-muted mb-0 fw-medium">Năm:</label>
        <select
          id="borrowYearSelect"
          v-model="selectedYear"
          class="form-select form-select-sm fw-semibold shadow-none border-secondary-subtle"
          style="width: 105px;"
          :disabled="isLoading"
        >
          <option v-for="y in availableYears" :key="y" :value="y">
            {{ y }}
          </option>
        </select>
        <button
          type="button"
          class="btn btn-sm btn-outline-secondary"
          title="Tải lại biểu đồ mượn sách"
          :disabled="isLoading"
          @click="fetchBorrowStats"
        >
          <i class="bi bi-arrow-clockwise" :class="{ 'spin-anim': isLoading }"></i>
        </button>
      </div>
    </div>

    <div class="card-body px-4 pt-2 pb-4 d-flex flex-column">
      <!-- Badge tóm tắt tổng cả năm -->
      <div class="d-flex flex-wrap align-items-center gap-3 mb-3 p-3 bg-light rounded-3">
        <div class="d-flex align-items-center gap-2">
          <span class="badge bg-primary px-2 py-1">Lượt mượn năm {{ selectedYear }}</span>
          <span class="fw-bold fs-6 text-primary">{{ summary.luotMuon.toLocaleString('vi-VN') }}</span>
        </div>
        <div class="vr d-none d-sm-block"></div>
        <div class="d-flex align-items-center gap-2">
          <span class="badge bg-warning text-dark px-2 py-1">Số đăng ký năm {{ selectedYear }}</span>
          <span class="fw-bold fs-6 text-dark">{{ summary.soDangKy.toLocaleString('vi-VN') }}</span>
        </div>
      </div>

      <!-- Vùng hiển thị biểu đồ hoặc trạng thái tải -->
      <div class="flex-grow-1 position-relative" style="min-height: 280px;">
        <div v-if="isLoading" class="position-absolute top-50 start-50 translate-middle text-center">
          <LoadingSpinner message="Đang tải dữ liệu biểu đồ..." />
        </div>

        <div v-else-if="errorMessage" class="position-absolute top-50 start-50 translate-middle text-center w-75">
          <div class="alert alert-danger py-2 px-3 small mb-2" role="alert">
            <i class="bi bi-exclamation-octagon me-1"></i>
            {{ errorMessage }}
          </div>
          <button type="button" class="btn btn-sm btn-outline-danger" @click="fetchBorrowStats">
            Thử lại
          </button>
        </div>

        <div v-else class="h-100 w-100" style="min-height: 280px;">
          <Bar :data="chartData" :options="chartOptions" />
        </div>
      </div>
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
