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
  if (!props.isProcessing) {
    emit('cancel');
  }
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
  if (!props.isProcessing) {
    emit('confirm');
  }
};

const handleCancel = () => {
  if (!props.isProcessing) {
    hide();
    emit('cancel');
  }
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
    aria-labelledby="confirmModalLabel"
    aria-hidden="true"
  >
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content border-0 shadow">
        <div class="modal-header border-bottom-0 pb-0">
          <h5 class="modal-title d-flex align-items-center gap-2 fw-bold" id="confirmModalLabel">
            <i :class="icon" class="fs-4"></i>
            <span>{{ title }}</span>
          </h5>
          <button
            type="button"
            class="btn-close"
            :disabled="isProcessing"
            aria-label="Đóng"
            @click="handleCancel"
          ></button>
        </div>

        <div class="modal-body py-3">
          <p class="mb-0 text-secondary" style="white-space: pre-line;">
            {{ message }}
          </p>
          <slot name="extra"></slot>
        </div>

        <div class="modal-footer border-top-0 pt-0">
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            :disabled="isProcessing"
            @click="handleCancel"
          >
            {{ cancelText }}
          </button>
          <button
            type="button"
            class="btn btn-sm d-flex align-items-center gap-1"
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
