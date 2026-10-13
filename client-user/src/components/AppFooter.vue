<script setup>
const currentYear = new Date().getFullYear();
</script>

<template>
  <footer class="footer mt-auto py-3 bg-white border-top">
    <div class="container text-center text-muted small">
      <div class="row align-items-center">
        <div class="col-md-6 text-md-start mb-2 mb-md-0">
          <span>Hệ thống Quản lý Thư viện — Cổng thông tin độc giả</span>
        </div>
        <div class="col-md-6 text-md-end">
          <span>&copy; {{ currentYear }} Tất cả các quyền được bảo lưu.</span>
        </div>
      </div>
    </div>
  </footer>
</template>
