<script setup>
import { computed } from 'vue';

const props = defineProps({
  currentPage: {
    type: Number,
    required: true,
    default: 1,
  },
  totalPages: {
    type: Number,
    required: true,
    default: 1,
  },
});

const emit = defineEmits(['change-page']);

const visiblePages = computed(() => {
  const current = props.currentPage;
  const total = props.totalPages;

  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  if (current <= 4) {
    return [1, 2, 3, 4, 5, '...', total];
  }

  if (current >= total - 3) {
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  }

  return [1, '...', current - 1, current, current + 1, '...', total];
});

const goToPage = (page) => {
  if (page === '...' || page === props.currentPage) return;
  if (page >= 1 && page <= props.totalPages) {
    emit('change-page', page);
  }
};
</script>

<template>
  <nav v-if="totalPages > 1" aria-label="Điều hướng phân trang">
    <ul class="pagination pagination-sm mb-0 justify-content-center justify-content-md-end flex-wrap">
      <!-- Trang đầu -->
      <li class="page-item" :class="{ disabled: currentPage === 1 }">
        <button
          type="button"
          class="page-link"
          :disabled="currentPage === 1"
          aria-label="Trang đầu"
          @click="goToPage(1)"
        >
          <i class="bi bi-chevron-double-left"></i>
        </button>
      </li>

      <!-- Trang trước -->
      <li class="page-item" :class="{ disabled: currentPage === 1 }">
        <button
          type="button"
          class="page-link"
          :disabled="currentPage === 1"
          aria-label="Trang trước"
          @click="goToPage(currentPage - 1)"
        >
          <i class="bi bi-chevron-left"></i>
        </button>
      </li>

      <!-- Danh sách số trang kèm rút gọn (...) -->
      <template v-for="(item, idx) in visiblePages" :key="idx">
        <li v-if="item === '...'" class="page-item disabled">
          <span class="page-link">…</span>
        </li>
        <li v-else class="page-item" :class="{ active: item === currentPage }">
          <button
            type="button"
            class="page-link"
            :aria-current="item === currentPage ? 'page' : undefined"
            @click="goToPage(item)"
          >
            {{ item }}
          </button>
        </li>
      </template>

      <!-- Trang kế tiếp -->
      <li class="page-item" :class="{ disabled: currentPage === props.totalPages }">
        <button
          type="button"
          class="page-link"
          :disabled="currentPage === props.totalPages"
          aria-label="Trang kế tiếp"
          @click="goToPage(currentPage + 1)"
        >
          <i class="bi bi-chevron-right"></i>
        </button>
      </li>

      <!-- Trang cuối -->
      <li class="page-item" :class="{ disabled: currentPage === props.totalPages }">
        <button
          type="button"
          class="page-link"
          :disabled="currentPage === props.totalPages"
          aria-label="Trang cuối"
          @click="goToPage(props.totalPages)"
        >
          <i class="bi bi-chevron-double-right"></i>
        </button>
      </li>
    </ul>
  </nav>
</template>
