<script setup>
import { ref, onMounted } from 'vue';
import http from '../api/http.js';

// Khoi kiem tra ket noi backend cho client-admin (task P0-5)
const loading = ref(false);
const connected = ref(false);
const serverData = ref(null);
const errorMessage = ref('');

const checkHealth = async () => {
  loading.value = true;
  connected.value = false;
  errorMessage.value = '';
  serverData.value = null;

  try {
    const res = await http.get('/health');
    if (res.data?.success) {
      connected.value = true;
      serverData.value = res.data.data;
    } else {
      connected.value = false;
      errorMessage.value = res.data?.message || 'Phản hồi không hợp lệ từ máy chủ';
    }
  } catch (err) {
    connected.value = false;
    errorMessage.value =
      err.response?.data?.error?.message ||
      err.message ||
      'Không thể kết nối đến máy chủ backend (http://localhost:5000)';
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  checkHealth();
});
</script>

<template>
  <div class="card shadow-sm border-0 mb-4">
    <div class="card-header bg-white border-bottom d-flex align-items-center justify-content-between py-3">
      <div class="d-flex align-items-center gap-2">
        <i class="bi bi-hdd-network text-primary fs-5"></i>
        <h5 class="mb-0 fs-6 fw-bold">Trạng thái kết nối Máy chủ Backend</h5>
      </div>
      <button
        class="btn btn-sm btn-outline-primary"
        :disabled="loading"
        @click="checkHealth"
      >
        <i class="bi bi-arrow-clockwise me-1" :class="{ 'spin-icon': loading }"></i>
        Thử lại
      </button>
    </div>
    <div class="card-body">
      <!-- Đang kiểm tra -->
      <div v-if="loading" class="d-flex align-items-center gap-3 py-2 text-muted">
        <div class="spinner-border spinner-border-sm text-primary" role="status">
          <span class="visually-hidden">Đang tải...</span>
        </div>
        <span>Đang kiểm tra kết nối tới {{ http.defaults.baseURL }}/health...</span>
      </div>

      <!-- Kết nối thành công -->
      <div v-else-if="connected" class="alert alert-success d-flex align-items-start gap-3 mb-0" role="alert">
        <i class="bi bi-check-circle-fill fs-4 flex-shrink-0"></i>
        <div class="flex-grow-1">
          <div class="fw-bold">Máy chủ API đang hoạt động bình thường!</div>
          <div class="small mt-1 text-muted">
            URL: <code>{{ http.defaults.baseURL }}/health</code>
          </div>
          <div class="mt-2 small bg-light p-2 rounded border" v-if="serverData">
            <div><strong>Trạng thái hệ thống:</strong> {{ serverData.status }}</div>
            <div><strong>Cơ sở dữ liệu MongoDB:</strong> {{ serverData.database }}</div>
            <div><strong>Thời gian hoạt động (uptime):</strong> {{ serverData.uptime }} giây</div>
            <div><strong>Thời gian máy chủ:</strong> {{ serverData.timestamp }}</div>
          </div>
        </div>
      </div>

      <!-- Lỗi kết nối -->
      <div v-else class="alert alert-danger d-flex align-items-start gap-3 mb-0" role="alert">
        <i class="bi bi-exclamation-triangle-fill fs-4 flex-shrink-0"></i>
        <div class="flex-grow-1">
          <div class="fw-bold">Lỗi kết nối tới máy chủ backend</div>
          <div class="small mt-1 text-break">{{ errorMessage }}</div>
          <div class="small mt-2 text-muted">
            Gợi ý: Kiểm tra xem server Node.js đã được bật chưa (<code>cd server && npm run dev</code>).
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
