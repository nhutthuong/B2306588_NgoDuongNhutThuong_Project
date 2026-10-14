<script setup>
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { formatCurrency, getCoverUrl } from '../utils/format.js';

const props = defineProps({
  book: {
    type: Object,
    required: true,
  },
  layout: {
    type: String,
    default: 'grid', // 'grid' | 'list'
  },
});

const isImageError = ref(false);

const handleImageError = () => {
  isImageError.value = true;
};
</script>

<template>
  <!-- Chế độ hiển thị dạng Lưới (Grid Card) -->
  <div v-if="layout === 'grid'" class="card h-100 border-0 shadow-sm rounded-4 book-card overflow-hidden">
    <!-- Khung ảnh bìa -->
    <div class="position-relative book-card-cover-wrapper bg-light text-center">
      <RouterLink :to="`/books/${book.MaSach}`" class="d-block w-100 h-100">
        <img
          v-if="getCoverUrl(book.AnhBia) && !isImageError"
          :src="getCoverUrl(book.AnhBia)"
          :alt="'Bìa sách ' + book.TenSach"
          class="book-card-cover"
          loading="lazy"
          @error="handleImageError"
        />
        <div
          v-else
          class="book-card-placeholder d-flex flex-column align-items-center justify-content-center text-muted"
        >
          <i class="bi bi-book fs-1 mb-1 text-secondary opacity-50"></i>
          <span class="small" style="font-size: 0.75rem;">Không có ảnh bìa</span>
        </div>
      </RouterLink>

      <!-- Huy hiệu tình trạng kho (Còn / Hết) -->
      <span
        class="badge position-absolute top-0 end-0 m-2 shadow-sm rounded-pill px-2 py-1"
        :class="book.conSach ? 'bg-success text-white' : 'bg-danger text-white'"
      >
        <i class="bi" :class="book.conSach ? 'bi-check-circle-fill' : 'bi-x-circle-fill'"></i>
        <span class="ms-1">{{ book.conSach ? `Còn ${book.SoQuyenConLai} cuốn` : 'Hết sách' }}</span>
      </span>

      <!-- Huy hiệu thể loại nếu có -->
      <span
        v-if="book.TheLoai"
        class="badge bg-dark bg-opacity-75 text-white position-absolute bottom-0 start-0 m-2 rounded-pill px-2 py-1 small"
        style="font-size: 0.7rem;"
      >
        {{ book.TheLoai }}
      </span>
    </div>

    <!-- Nội dung thẻ sách -->
    <div class="card-body p-3 d-flex flex-column">
      <div class="small text-muted mb-1 text-truncate" :title="book.TenNXB || book.MaNXB">
        <i class="bi bi-building me-1"></i>{{ book.TenNXB || book.MaNXB }}
      </div>

      <h5 class="card-title fw-bold text-dark fs-6 mb-1 book-title-clamp" :title="book.TenSach">
        <RouterLink :to="`/books/${book.MaSach}`" class="text-dark text-decoration-none hover-primary">
          {{ book.TenSach }}
        </RouterLink>
      </h5>

      <p class="text-secondary small mb-2 text-truncate" :title="book.NguonGocTacGia">
        <i class="bi bi-person me-1"></i>{{ book.NguonGocTacGia }}
      </p>

      <div class="mt-auto pt-2 border-top d-flex align-items-center justify-content-between">
        <div class="fw-bold text-primary fs-6">
          {{ formatCurrency(book.DonGia) }}
        </div>
        <RouterLink
          :to="`/books/${book.MaSach}`"
          class="btn btn-outline-primary btn-sm px-3 rounded-pill"
        >
          <span>Chi tiết</span>
          <i class="bi bi-arrow-right ms-1"></i>
        </RouterLink>
      </div>
    </div>
  </div>

  <!-- Chế độ hiển thị dạng Hàng ngang (List Card) -->
  <div v-else class="card border-0 shadow-sm rounded-4 book-card overflow-hidden mb-3">
    <div class="row g-0 align-items-center">
      <div class="col-4 col-sm-3 col-md-2 bg-light text-center position-relative">
        <RouterLink :to="`/books/${book.MaSach}`" class="d-block w-100 book-list-cover-wrapper">
          <img
            v-if="getCoverUrl(book.AnhBia) && !isImageError"
            :src="getCoverUrl(book.AnhBia)"
            :alt="'Bìa sách ' + book.TenSach"
            class="book-list-cover"
            loading="lazy"
            @error="handleImageError"
          />
          <div
            v-else
            class="book-list-placeholder d-flex flex-column align-items-center justify-content-center text-muted h-100"
          >
            <i class="bi bi-book fs-2 text-secondary opacity-50"></i>
          </div>
        </RouterLink>
      </div>

      <div class="col-8 col-sm-9 col-md-10">
        <div class="card-body p-3 p-md-4">
          <div class="d-flex flex-wrap align-items-center gap-2 mb-1">
            <span class="badge bg-light text-dark border font-monospace" style="font-size: 0.75rem;">
              {{ book.MaSach }}
            </span>
            <span v-if="book.TheLoai" class="badge bg-secondary-subtle text-secondary rounded-pill">
              {{ book.TheLoai }}
            </span>
            <span
              class="badge rounded-pill"
              :class="book.conSach ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-danger-subtle text-danger border border-danger-subtle'"
            >
              {{ book.conSach ? `Còn ${book.SoQuyenConLai} cuốn` : 'Tạm hết' }}
            </span>
          </div>

          <h5 class="card-title fw-bold mb-1 fs-5">
            <RouterLink :to="`/books/${book.MaSach}`" class="text-dark text-decoration-none hover-primary">
              {{ book.TenSach }}
            </RouterLink>
          </h5>

          <div class="text-muted small mb-2 d-flex flex-wrap align-items-center gap-3">
            <span><i class="bi bi-person me-1"></i>{{ book.NguonGocTacGia }}</span>
            <span><i class="bi bi-building me-1"></i>{{ book.TenNXB || book.MaNXB }}</span>
            <span v-if="book.NamXuatBan"><i class="bi bi-calendar3 me-1"></i>Năm: {{ book.NamXuatBan }}</span>
          </div>

          <p v-if="book.MoTa" class="text-secondary small mb-3 text-truncate-2" style="white-space: pre-line;">
            {{ book.MoTa }}
          </p>

          <div class="d-flex align-items-center justify-content-between pt-2 border-top">
            <div class="fs-5 fw-bold text-primary">
              {{ formatCurrency(book.DonGia) }}
            </div>
            <RouterLink :to="`/books/${book.MaSach}`" class="btn btn-primary btn-sm px-3 rounded-pill shadow-sm">
              Xem chi tiết <i class="bi bi-arrow-right ms-1"></i>
            </RouterLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.book-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.book-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08) !important;
}

.book-card-cover-wrapper {
  height: 220px;
  overflow: hidden;
}

.book-card-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.book-card:hover .book-card-cover {
  transform: scale(1.04);
}

.book-card-placeholder {
  width: 100%;
  height: 100%;
}

.book-title-clamp {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  height: 2.5rem;
  line-height: 1.25rem;
}

.book-list-cover-wrapper {
  height: 160px;
}

.book-list-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.text-truncate-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.hover-primary:hover {
  color: #0d6efd !important;
}
</style>
