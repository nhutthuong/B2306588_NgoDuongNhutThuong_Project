<script setup>
defineProps({
  text: {
    type: String,
    default: 'Đang tải dữ liệu...',
  },
  minHeight: {
    type: String,
    default: '260px',
  },
});
</script>

<template>
  <div
    class="d-flex flex-column align-items-center justify-content-center text-center p-4"
    :style="{ minHeight }"
  >
    <div
      class="spinner-border text-primary mb-2"
      style="width: 2.25rem; height: 2.25rem;"
      role="status"
    >
      <span class="visually-hidden">Đang tải...</span>
    </div>
    <div class="text-secondary small fw-medium">{{ text }}</div>
  </div>
</template>
