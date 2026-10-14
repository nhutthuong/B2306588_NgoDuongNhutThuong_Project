<script setup>
defineProps({
  type: {
    type: String,
    default: 'info', // 'success' | 'danger' | 'warning' | 'info'
  },
  message: {
    type: String,
    default: '',
  },
  dismissible: {
    type: Boolean,
    default: true,
  },
});

defineEmits(['close']);

const getIcon = (type) => {
  switch (type) {
    case 'success':
      return 'bi-check-circle-fill';
    case 'danger':
      return 'bi-exclamation-octagon-fill';
    case 'warning':
      return 'bi-exclamation-triangle-fill';
    default:
      return 'bi-info-circle-fill';
  }
};
</script>

<template>
  <div
    v-if="message"
    class="alert d-flex align-items-center justify-content-between py-2 px-3 mb-3 border-0 shadow-sm"
    :class="[`alert-${type}`, dismissible ? 'alert-dismissible' : '']"
    role="alert"
  >
    <div class="d-flex align-items-center gap-2 flex-grow-1">
      <i class="bi fs-5 flex-shrink-0" :class="getIcon(type)"></i>
      <div style="white-space: pre-line;">{{ message }}</div>
    </div>
    <button
      v-if="dismissible"
      type="button"
      class="btn-close ms-2"
      aria-label="Đóng"
      @click="$emit('close')"
    ></button>
  </div>
</template>
