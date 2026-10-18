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
import { formatCurrency } from '../../utils/format.js';
import LoadingSpinner from '../LoadingSpinner.vue';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

const currentYear = new Date().getFullYear();
const selectedYear = ref(currentYear);
const isLoading = ref(true);
const errorMessage = ref('');

const availableYears = computed(() => {
  const years = [];
  for (let y = currentYear + 1; y >= 2022; y--) {
    years.push(y);
  }
  return years;
});

const chartDataRaw = ref(null);
const summary = ref({
  phatPhatSinh: 0,
  daThu: 0,
  soSachRach: 0,
  soSachMat: 0,
  chuaThuHienTai: 0,
});

/**
 * Gọi API lấy dữ liệu thống kê tiền phạt theo tháng
 */
const fetchFinesStats = async () => {
  isLoading.value = true;
  errorMessage.value = '';

  try {
    const res = await statsApi.getFines(selectedYear.value);
    const data = res.data?.data;

    if (data && Array.isArray(data.thang)) {
      chartDataRaw.value = data.thang;
      summary.value = {
        phatPhatSinh: data.tongCaNam?.phatPhatSinh || 0,
        daThu: data.tongCaNam?.daThu || 0,
        soSachRach: data.tongCaNam?.soSachRach || 0,
        soSachMat: data.tongCaNam?.soSachMat || 0,
        chuaThuHienTai: data.chuaThuHienTai || 0,
      };
    }
  } catch (err) {
    errorMessage.value = getErrorMessage(err);
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  fetchFinesStats();
});

watch(selectedYear, () => {
  fetchFinesStats();
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

  const phatPhatSinhValues = chartDataRaw.value.map((item) => item.phatPhatSinh || 0);
  const daThuValues = chartDataRaw.value.map((item) => item.daThu || 0);

  return {
    labels,
    datasets: [
      {
        label: 'Phạt phát sinh (Theo ngày trả)',
        data: phatPhatSinhValues,
        backgroundColor: '#dc3545',
        borderColor: '#bb2d3b',
        borderWidth: 1,
        borderRadius: 4,
      },
      {
        label: 'Đã thu thực tế (Tại quầy)',
        data: daThuValues,
        backgroundColor: '#198754',
        borderColor: '#157347',
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
      callbacks: {
        label: (context) => {
          const label = context.dataset.label || '';
          const value = context.parsed.y || 0;
          return `${label}: ${formatCurrency(value)}`;
        },
      },
    },
  },
  scales: {
    y: {
      beginAtZero: true,
      ticks: {
        font: { family: 'inherit', size: 11 },
        callback: (value) => {
          if (value >= 1000000) return `${(value / 1000000).toFixed(1)} tr`;
          if (value >= 1000) return `${(value / 1000).toFixed(0)} k`;
          return value;
        },
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
  refresh: fetchFinesStats,
});
</script>

<template>
  <div class="card shadow-sm border-0 rounded-4 h-100">
    <div class="card-header bg-transparent border-0 pt-4 px-4 pb-2 d-flex flex-wrap align-items-center justify-content-between gap-2">
      <div>
        <h5 class="card-title fw-bold mb-1 text-dark d-flex align-items-center gap-2">
          <i class="bi bi-cash-coin text-success"></i>
          <span>Thống kê Tiền Phạt Theo Tháng</span>
        </h5>
        <p class="card-subtitle text-muted small mb-0">
          Theo dõi tiền phạt phát sinh từ trả trễ/hư hại và số tiền phạt thực tế đã thu tại quầy
        </p>
      </div>

      <!-- Chọn năm -->
      <div class="d-flex align-items-center gap-2">
        <label for="finesYearSelect" class="form-label small text-muted mb-0 fw-medium">Năm:</label>
        <select
          id="finesYearSelect"
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
          title="Tải lại biểu đồ tiền phạt"
          :disabled="isLoading"
          @click="fetchFinesStats"
        >
          <i class="bi bi-arrow-clockwise" :class="{ 'spin-anim': isLoading }"></i>
        </button>
      </div>
    </div>

    <div class="card-body px-4 pt-2 pb-4 d-flex flex-column">
      <!-- Badge tóm tắt -->
      <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3 p-3 bg-light rounded-3 small">
        <div class="d-flex flex-wrap align-items-center gap-3">
          <div class="d-flex align-items-center gap-2">
            <span class="badge bg-danger-subtle text-danger border border-danger-subtle px-2 py-1">Phát sinh năm {{ selectedYear }}</span>
            <span class="fw-bold text-danger">{{ formatCurrency(summary.phatPhatSinh) }}</span>
          </div>
          <div class="vr d-none d-sm-block"></div>
          <div class="d-flex align-items-center gap-2">
            <span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1">Đã thu năm {{ selectedYear }}</span>
            <span class="fw-bold text-success">{{ formatCurrency(summary.daThu) }}</span>
          </div>
          <div class="vr d-none d-sm-block"></div>
          <div class="d-flex align-items-center gap-2 text-muted">
            <span>Sách hỏng/mất:</span>
            <span class="fw-semibold text-dark">{{ summary.soSachRach }} rách / {{ summary.soSachMat }} mất</span>
          </div>
        </div>

        <div class="d-flex align-items-center gap-2">
          <span class="badge bg-warning text-dark px-2 py-1">Chưa thu toàn cục</span>
          <span class="fw-bold text-dark">{{ formatCurrency(summary.chuaThuHienTai) }}</span>
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
          <button type="button" class="btn btn-sm btn-outline-danger" @click="fetchFinesStats">
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
