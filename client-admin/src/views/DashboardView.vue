<script setup>
import ServerHealthCheck from '../components/ServerHealthCheck.vue';
</script>

<template>
  <div>
    <div class="d-flex align-items-center justify-content-between mb-4">
      <div>
        <h1 class="h3 fw-bold mb-1">Bảng điều khiển (Dashboard)</h1>
        <p class="text-muted mb-0 small">
          Tổng quan số liệu và trạng thái hoạt động của hệ thống thư viện.
        </p>
      </div>
    </div>

    <!-- Khoi kiem tra ket noi server backend (P0-5) -->
    <ServerHealthCheck />

    <div class="row g-3">
      <div class="col-sm-6 col-xl-3">
        <div class="card shadow-sm border-0 h-100">
          <div class="card-body d-flex align-items-center gap-3">
            <div class="p-3 bg-primary bg-opacity-10 text-primary rounded">
              <i class="bi bi-book fs-3"></i>
            </div>
            <div>
              <div class="text-muted small">Tổng đầu sách</div>
              <div class="fs-4 fw-bold">--</div>
            </div>
          </div>
        </div>
      </div>

      <div class="col-sm-6 col-xl-3">
        <div class="card shadow-sm border-0 h-100">
          <div class="card-body d-flex align-items-center gap-3">
            <div class="p-3 bg-success bg-opacity-10 text-success rounded">
              <i class="bi bi-people fs-3"></i>
            </div>
            <div>
              <div class="text-muted small">Độc giả đăng ký</div>
              <div class="fs-4 fw-bold">--</div>
            </div>
          </div>
        </div>
      </div>

      <div class="col-sm-6 col-xl-3">
        <div class="card shadow-sm border-0 h-100">
          <div class="card-body d-flex align-items-center gap-3">
            <div class="p-3 bg-warning bg-opacity-10 text-warning rounded">
              <i class="bi bi-hourglass-split fs-3"></i>
            </div>
            <div>
              <div class="text-muted small">Phiếu chờ duyệt</div>
              <div class="fs-4 fw-bold">--</div>
            </div>
          </div>
        </div>
      </div>

      <div class="col-sm-6 col-xl-3">
        <div class="card shadow-sm border-0 h-100">
          <div class="card-body d-flex align-items-center gap-3">
            <div class="p-3 bg-info bg-opacity-10 text-info rounded">
              <i class="bi bi-journal-bookmark fs-3"></i>
            </div>
            <div>
              <div class="text-muted small">Sách đang mượn</div>
              <div class="fs-4 fw-bold">--</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
