<script setup>
defineProps({
  title: {
    type: String,
    default: 'Không có dữ liệu',
  },
  message: {
    type: String,
    default: 'Hiện tại chưa có bản ghi nào hoặc không tìm thấy kết quả phù hợp.',
  },
  icon: {
    type: String,
    default: 'bi-inbox',
  },
  actionText: {
    type: String,
    default: '',
  },
});

defineEmits(['action']);
</script>

<template>
  <div class="text-center py-5 px-3">
    <div class="mb-3 text-secondary opacity-50">
      <i :class="icon" style="font-size: 3.5rem;"></i>
    </div>
    <h5 class="fw-bold mb-1 text-dark">{{ title }}</h5>
    <p class="text-muted small mb-3" style="white-space: pre-line; max-width: 480px; margin: 0 auto;">
      {{ message }}
    </p>
    <button
      v-if="actionText"
      type="button"
      class="btn btn-primary btn-sm"
      @click="$emit('action')"
    >
      {{ actionText }}
    </button>
  </div>
</template>
