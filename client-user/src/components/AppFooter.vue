<script setup>
import { RouterLink } from 'vue-router';
import { useAuthStore } from '../stores/auth.js';

const authStore = useAuthStore();
const currentYear = new Date().getFullYear();

const scrollToTop = () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
</script>

<template>
  <footer class="app-footer mt-auto text-light">
    <!-- Phần nội dung chính của footer -->
    <div class="footer-main py-5">
      <div class="container">
        <div class="row g-4">
          <!-- Cột 1: Thương hiệu và Giới thiệu -->
          <div class="col-lg-4 col-md-6">
            <div class="d-flex align-items-center gap-2 mb-3">
              <div class="brand-icon d-flex align-items-center justify-content-center rounded-3 bg-primary text-white shadow-sm">
                <i class="bi bi-book-half fs-4"></i>
              </div>
              <h5 class="fw-bold mb-0 text-white">Thư viện điện tử</h5>
            </div>
            <p class="text-secondary small mb-3 lh-base">
              Cổng thông tin tra cứu tài liệu và đăng ký mượn sách trực tuyến. Kết nối độc giả với kho tri thức phong phú, quản lý vị trí kệ sách trực quan, tiện lợi và hiện đại.
            </p>
            <div class="d-flex flex-wrap gap-2">
              <span class="badge bg-secondary bg-opacity-25 text-light border border-secondary border-opacity-25 rounded-pill px-3 py-1 small">
                <i class="bi bi-clock-history me-1 text-primary"></i>Phục vụ trực tuyến 24/7
              </span>
              <span class="badge bg-secondary bg-opacity-25 text-light border border-secondary border-opacity-25 rounded-pill px-3 py-1 small">
                <i class="bi bi-geo-alt-fill me-1 text-danger"></i>Định vị kệ sách
              </span>
            </div>
          </div>

          <!-- Cột 2: Điều hướng nhanh -->
          <div class="col-lg-2 col-md-6 col-6">
            <h6 class="fw-bold text-white text-uppercase tracking-wider mb-3 small">Điều hướng</h6>
            <ul class="list-unstyled mb-0 small">
              <li class="mb-2">
                <RouterLink to="/" class="footer-link">
                  <i class="bi bi-chevron-right me-1 small"></i>Trang chủ
                </RouterLink>
              </li>
              <li v-if="authStore.isAuthenticated" class="mb-2">
                <RouterLink to="/my-borrowings" class="footer-link">
                  <i class="bi bi-chevron-right me-1 small"></i>Lịch sử mượn
                </RouterLink>
              </li>
              <li v-if="authStore.isAuthenticated" class="mb-2">
                <RouterLink to="/profile" class="footer-link">
                  <i class="bi bi-chevron-right me-1 small"></i>Hồ sơ cá nhân
                </RouterLink>
              </li>
              <li v-if="!authStore.isAuthenticated" class="mb-2">
                <RouterLink to="/login" class="footer-link">
                  <i class="bi bi-chevron-right me-1 small"></i>Đăng nhập
                </RouterLink>
              </li>
              <li v-if="!authStore.isAuthenticated" class="mb-2">
                <RouterLink to="/register" class="footer-link">
                  <i class="bi bi-chevron-right me-1 small"></i>Đăng ký độc giả
                </RouterLink>
              </li>
            </ul>
          </div>

          <!-- Cột 3: Quy định mượn sách -->
          <div class="col-lg-3 col-md-6 col-6">
            <h6 class="fw-bold text-white text-uppercase tracking-wider mb-3 small">Quy định mượn</h6>
            <ul class="list-unstyled mb-0 text-secondary small">
              <li class="mb-2 d-flex align-items-start gap-2">
                <i class="bi bi-check2-circle text-success mt-1 flex-shrink-0"></i>
                <span>Tối đa <strong>5 cuốn sách</strong> đang mượn</span>
              </li>
              <li class="mb-2 d-flex align-items-start gap-2">
                <i class="bi bi-calendar-check text-info mt-1 flex-shrink-0"></i>
                <span>Thời hạn mượn sách: <strong>14 ngày</strong></span>
              </li>
              <li class="mb-2 d-flex align-items-start gap-2">
                <i class="bi bi-shield-check text-warning mt-1 flex-shrink-0"></i>
                <span>Bảo quản sách cẩn thận, không làm hỏng</span>
              </li>
              <li class="d-flex align-items-start gap-2">
                <i class="bi bi-exclamation-triangle text-danger mt-1 flex-shrink-0"></i>
                <span>Phạt trễ hạn theo quy chế thư viện</span>
              </li>
            </ul>
          </div>

          <!-- Cột 4: Thông tin liên hệ & Giờ mở cửa -->
          <div class="col-lg-3 col-md-6">
            <h6 class="fw-bold text-white text-uppercase tracking-wider mb-3 small">Liên hệ & Hỗ trợ</h6>
            <ul class="list-unstyled mb-0 text-secondary small">
              <li class="mb-2 d-flex align-items-start gap-2">
                <i class="bi bi-geo-alt text-primary mt-1 flex-shrink-0"></i>
                <span>Khu II, Đ. 3 Tháng 2, P. Xuân Khánh, Q. Ninh Kiều, TP. Cần Thơ</span>
              </li>
              <li class="mb-2 d-flex align-items-center gap-2">
                <i class="bi bi-telephone text-primary flex-shrink-0"></i>
                <span>(0292) 3832 663</span>
              </li>
              <li class="mb-2 d-flex align-items-center gap-2">
                <i class="bi bi-envelope text-primary flex-shrink-0"></i>
                <span>thuvien@ctu.edu.vn</span>
              </li>
              <li class="d-flex align-items-start gap-2">
                <i class="bi bi-door-open text-primary mt-1 flex-shrink-0"></i>
                <span>T2 – T6: 07:00 – 21:00<br />T7 – CN: 07:30 – 17:00</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- Dòng bản quyền dưới cùng (Bottom Bar) -->
    <div class="footer-bottom py-3 border-top border-secondary border-opacity-25">
      <div class="container">
        <div class="d-flex flex-column flex-md-row align-items-center justify-content-between gap-2 small text-secondary">
          <div>
            <span>&copy; {{ currentYear }} <strong>Thư viện điện tử</strong>. Tất cả các quyền được bảo lưu.</span>
            <span class="d-none d-sm-inline mx-2">|</span>
            <span class="d-block d-sm-inline text-secondary opacity-75">Dự án Phát triển Ứng dụng Web</span>
          </div>

          <div class="d-flex align-items-center gap-3">
            <button
              type="button"
              class="btn btn-link btn-sm text-secondary text-decoration-none p-0 d-flex align-items-center gap-1 hover-white"
              @click="scrollToTop"
            >
              <span>Lên đầu trang</span>
              <i class="bi bi-arrow-up-circle fs-6"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
}

.brand-icon {
  width: 38px;
  height: 38px;
}

.tracking-wider {
  letter-spacing: 0.08em;
}

.footer-link {
  color: #94a3b8;
  text-decoration: none;
  transition: all 0.2s ease;
  display: inline-block;
}

.footer-link:hover {
  color: #ffffff;
  transform: translateX(3px);
}

.hover-white {
  transition: color 0.2s ease;
}

.hover-white:hover {
  color: #ffffff !important;
}
</style>
