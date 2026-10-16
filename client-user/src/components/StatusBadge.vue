<script setup>
import { computed } from 'vue';
import { formatCurrency } from '../utils/format.js';

const props = defineProps({
  status: {
    type: String,
    required: true,
  },
  isOverdue: {
    type: Boolean,
    default: false,
  },
  soNgayTre: {
    type: Number,
    default: 0,
  },
  fineStatus: {
    type: String,
    default: '',
  },
  fineAmount: {
    type: Number,
    default: 0,
  },
  showIcon: {
    type: Boolean,
    default: true,
  },
});

/**
 * Cấu hình hiển thị theo quy ước CONVENTIONS.md §3:
 * ChoDuyet=warning, DaDuyet=info, DangMuon=primary, DaTra=success,
 * TuChoi=danger, DaHuy=secondary, QuaHan=danger (đậm).
 */
const statusConfig = computed(() => {
  switch (props.status) {
    case 'ChoDuyet':
      return {
        label: 'Chờ duyệt',
        badgeClass: 'bg-warning text-dark',
        icon: 'bi-clock-history',
        desc: 'Phiếu mượn vừa đăng ký, đang chờ thủ thư xét duyệt',
      };
    case 'DaDuyet':
      return {
        label: 'Đã duyệt',
        badgeClass: 'bg-info text-dark',
        icon: 'bi-check2-circle',
        desc: 'Sách đã được giữ, vui lòng đến thư viện nhận sách đúng hạn',
      };
    case 'DangMuon':
      return {
        label: 'Đang mượn',
        badgeClass: 'bg-primary text-white',
        icon: 'bi-book-half',
        desc: 'Sách đã được giao, độc giả đang mượn',
      };
    case 'DaTra':
      return {
        label: 'Đã trả',
        badgeClass: 'bg-success text-white',
        icon: 'bi-check-all',
        desc: 'Độc giả đã hoàn trả sách vào kho',
      };
    case 'TuChoi':
      return {
        label: 'Bị từ chối',
        badgeClass: 'bg-danger text-white',
        icon: 'bi-x-circle',
        desc: 'Thủ thư từ chối yêu cầu mượn sách',
      };
    case 'DaHuy':
      return {
        label: 'Đã hủy',
        badgeClass: 'bg-secondary text-white',
        icon: 'bi-slash-circle',
        desc: 'Phiếu mượn đã bị hủy hoặc hết hạn nhận sách',
      };
    default:
      return {
        label: props.status || 'Không rõ',
        badgeClass: 'bg-secondary text-white',
        icon: 'bi-question-circle',
        desc: '',
      };
  }
});
</script>

<template>
  <div class="d-inline-flex flex-wrap align-items-center gap-1 status-badge-wrapper">
    <!-- Huy hiệu trạng thái chính -->
    <span
      class="badge rounded-pill px-2 py-1 d-inline-flex align-items-center gap-1 shadow-sm"
      :class="statusConfig.badgeClass"
      :title="statusConfig.desc"
    >
      <i v-if="showIcon" class="bi" :class="statusConfig.icon"></i>
      <span>{{ statusConfig.label }}</span>
    </span>

    <!-- Huy hiệu cảnh báo quá hạn nếu có -->
    <span
      v-if="isOverdue"
      class="badge bg-danger text-white rounded-pill px-2 py-1 d-inline-flex align-items-center gap-1 shadow-sm border border-danger-subtle fw-bold animate-pulse"
      title="Sách đã quá hạn trả, vui lòng hoàn trả sách về thư viện sớm nhất có thể"
    >
      <i class="bi bi-exclamation-triangle-fill"></i>
      <span>Quá hạn {{ soNgayTre > 0 ? `${soNgayTre} ngày` : '' }}</span>
    </span>

    <!-- Huy hiệu trạng thái phạt nếu có khoản phạt -->
    <span
      v-if="fineStatus === 'ChuaThanhToan'"
      class="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill px-2 py-1 d-inline-flex align-items-center gap-1"
      :title="`Khoản tiền phạt chưa thanh toán: ${formatCurrency(fineAmount)}`"
    >
      <i class="bi bi-cash-coin"></i>
      <span>Phạt: {{ formatCurrency(fineAmount) }}</span>
    </span>

    <span
      v-else-if="fineStatus === 'DaThanhToan'"
      class="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2 py-1 d-inline-flex align-items-center gap-1"
      title="Khoản tiền phạt đã được thanh toán đầy đủ"
    >
      <i class="bi bi-check-circle"></i>
      <span>Đã nộp phạt</span>
    </span>
  </div>
</template>

<style scoped>
.status-badge-wrapper {
  vertical-align: middle;
}

@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.8;
  }
  100% {
    opacity: 1;
  }
}

.animate-pulse {
  animation: pulse 2s infinite ease-in-out;
}
</style>
