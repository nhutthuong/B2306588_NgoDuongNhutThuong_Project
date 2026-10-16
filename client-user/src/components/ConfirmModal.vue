<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { Modal } from 'bootstrap';

const props = defineProps({
  title: {
    type: String,
    default: 'Xác nhận thao tác',
  },
  message: {
    type: String,
    default: 'Bạn có chắc chắn muốn thực hiện thao tác này không?',
  },
  confirmText: {
    type: String,
    default: 'Đồng ý',
  },
  cancelText: {
    type: String,
    default: 'Hủy bỏ',
  },
  confirmBtnClass: {
    type: String,
    default: 'btn-danger',
  },
  isProcessing: {
    type: Boolean,
    default: false,
  },
  icon: {
    type: String,
    default: 'bi-exclamation-triangle-fill text-warning',
  },
});

const emit = defineEmits(['confirm', 'cancel']);

const modalRef = ref(null);
let modalInstance = null;

onMounted(() => {
  if (modalRef.value) {
    modalInstance = new Modal(modalRef.value, {
      backdrop: 'static',
      keyboard: true,
    });

    modalRef.value.addEventListener('hidden.bs.modal', onModalHidden);
  }
});

onUnmounted(() => {
  if (modalRef.value) {
    modalRef.value.removeEventListener('hidden.bs.modal', onModalHidden);
  }
  if (modalInstance) {
    modalInstance.dispose();
    modalInstance = null;
  }
});

const onModalHidden = () => {
  emit('cancel');
};

const show = () => {
  if (modalInstance) {
    modalInstance.show();
  }
};

const hide = () => {
  if (modalInstance) {
    modalInstance.hide();
  }
};

const handleConfirm = () => {
  emit('confirm');
};

defineExpose({
  show,
  hide,
});
</script>

<template>
  <div
    ref="modalRef"
    class="modal fade"
    tabindex="-1"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content border-0 shadow-lg rounded-4">
        <div class="modal-header border-0 pb-0">
          <h5 class="modal-title fw-bold d-flex align-items-center gap-2 fs-5">
            <i class="bi" :class="icon"></i>
            <span>{{ title }}</span>
          </h5>
          <button
            type="button"
            class="btn-close"
            :disabled="isProcessing"
            @click="hide"
            aria-label="Đóng"
          ></button>
        </div>

        <div class="modal-body py-3 text-secondary">
          <slot>
            <p class="mb-0">{{ message }}</p>
          </slot>
        </div>

        <div class="modal-footer border-0 pt-0">
          <button
            type="button"
            class="btn btn-light rounded-pill px-3"
            :disabled="isProcessing"
            @click="hide"
          >
            {{ cancelText }}
          </button>
          <button
            type="button"
            class="btn rounded-pill px-4 shadow-sm d-flex align-items-center gap-2"
            :class="confirmBtnClass"
            :disabled="isProcessing"
            @click="handleConfirm"
          >
            <span
              v-if="isProcessing"
              class="spinner-border spinner-border-sm"
              role="status"
              aria-hidden="true"
            ></span>
            <span>{{ confirmText }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
