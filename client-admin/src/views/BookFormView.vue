<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter, RouterLink, onBeforeRouteLeave } from 'vue-router';
import bookApi from '../api/book.api.js';
import publisherApi from '../api/publisher.api.js';
import { getErrorMessage, getFieldErrors } from '../api/http.js';
import { getCoverUrl } from '../utils/format.js';
import LoadingSpinner from '../components/LoadingSpinner.vue';

/**
 * Ghi chú kiến trúc:
 * Nếu phiên làm việc hết hạn trong lúc người dùng đang nhập/chỉnh sửa form,
 * axios interceptor (src/api/http.js) đã tự động refresh token trong suốt (P1-4).
 * Nếu refresh thất bại và hệ thống buộc phải chuyển hướng về trang /login,
 * việc mất dữ liệu form chưa lưu là chấp nhận được theo đặc tả nghiệp vụ.
 */

const route = useRoute();
const router = useRouter();

const currentYear = new Date().getFullYear();

// Xác định chế độ: thêm mới hay chỉnh sửa
const isEditMode = computed(() => Boolean(route.params.maSach));
const paramMaSach = computed(() => (route.params.maSach ? String(route.params.maSach).trim().toUpperCase() : ''));

// Trạng thái nạp trang
const isLoading = ref(false);
const isSubmitting = ref(false);
const isSubmitted = ref(false);
const notFound = ref(false);
const notFoundMessage = ref('');
const isSoftDeleted = ref(false);

// Danh sách nhà xuất bản cho dropdown
const publishers = ref([]);
const isPublishersLoading = ref(false);

// Thông tin sách ban đầu khi ở chế độ chỉnh sửa (phục vụ dirty check và tính dangGiu)
const initialData = ref(null);
const initialSoQuyen = ref(0);
const currentSoQuyenConLai = ref(0);

// Dữ liệu form
const form = reactive({
  TenSach: '',
  DonGia: 0,
  SoQuyen: 1,
  NamXuatBan: currentYear,
  MaNXB: '',
  NguonGocTacGia: '',
  TheLoai: '',
  MoTa: '',
});

// Lỗi validation
const errors = reactive({
  TenSach: '',
  DonGia: '',
  SoQuyen: '',
  NamXuatBan: '',
  MaNXB: '',
  NguonGocTacGia: '',
  TheLoai: '',
  MoTa: '',
  AnhBia: '',
  general: '',
});

// Quản lý ảnh bìa
const fileInputRef = ref(null);
const selectedFile = ref(null);
const previewUrl = ref('');
const currentCoverPath = ref('');
const removeCover = ref(false);

// Số lượng sách đang được giữ hoặc đang mượn
// dangGiu = current.SoQuyen - current.SoQuyenConLai
const dangGiu = computed(() => {
  if (!isEditMode.value) return 0;
  return Math.max(0, initialSoQuyen.value - currentSoQuyenConLai.value);
});

// Kiểm tra xem form đã bị chỉnh sửa hay chưa (dirty check)
const isDirty = computed(() => {
  if (isSubmitted.value) return false;

  if (selectedFile.value || removeCover.value) return true;

  if (!isEditMode.value) {
    return Boolean(
      form.TenSach.trim() ||
      form.NguonGocTacGia.trim() ||
      form.MaNXB ||
      form.TheLoai.trim() ||
      form.MoTa.trim() ||
      form.DonGia > 0 ||
      form.SoQuyen !== 1
    );
  }

  if (!initialData.value) return false;

  return (
    form.TenSach !== (initialData.value.TenSach || '') ||
    Number(form.DonGia) !== Number(initialData.value.DonGia || 0) ||
    Number(form.SoQuyen) !== Number(initialData.value.SoQuyen || 0) ||
    Number(form.NamXuatBan || 0) !== Number(initialData.value.NamXuatBan || 0) ||
    form.MaNXB !== (initialData.value.MaNXB || '') ||
    form.NguonGocTacGia !== (initialData.value.NguonGocTacGia || '') ||
    form.TheLoai !== (initialData.value.TheLoai || '') ||
    form.MoTa !== (initialData.value.MoTa || '')
  );
});

/**
 * Tải danh mục NXB cho ô chọn
 */
const loadPublishers = async () => {
  isPublishersLoading.value = true;
  try {
    const res = await publisherApi.list({ limit: 100, sort: 'TenNXB' });
    publishers.value = res.data?.data || [];
  } catch {
    // Không chặn nếu lỗi
  } finally {
    isPublishersLoading.value = false;
  }
};

/**
 * Nạp thông tin sách khi ở chế độ chỉnh sửa
 */
const loadBookDetail = async () => {
  // Kiểm tra định dạng mã sách regex ^S\d{4,}$
  if (!/^S\d{4,}$/.test(paramMaSach.value)) {
    notFound.value = true;
    notFoundMessage.value = `Mã sách "${paramMaSach.value}" không đúng định dạng chuẩn (ví dụ: S0001).`;
    return;
  }

  isLoading.value = true;
  notFound.value = false;

  try {
    const response = await bookApi.get(paramMaSach.value);
    const book = response.data?.data;

    if (!book) {
      notFound.value = true;
      notFoundMessage.value = 'Không tìm thấy sách yêu cầu.';
      return;
    }

    initialData.value = { ...book };
    initialSoQuyen.value = Number(book.SoQuyen || 0);
    currentSoQuyenConLai.value = Number(book.SoQuyenConLai || 0);
    isSoftDeleted.value = Boolean(book.DaXoa);

    form.TenSach = book.TenSach || '';
    form.DonGia = book.DonGia || 0;
    form.SoQuyen = book.SoQuyen || 0;
    form.NamXuatBan = book.NamXuatBan || currentYear;
    form.MaNXB = book.MaNXB || '';
    form.NguonGocTacGia = book.NguonGocTacGia || '';
    form.TheLoai = book.TheLoai || '';
    form.MoTa = book.MoTa || '';
    currentCoverPath.value = book.AnhBia || '';
  } catch (error) {
    notFound.value = true;
    notFoundMessage.value = getErrorMessage(error);
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  loadPublishers();
  if (isEditMode.value) {
    loadBookDetail();
  }
  window.addEventListener('beforeunload', handleBeforeUnload);
});

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload);
  // Dọn dẹp object URL giải phóng bộ nhớ
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = '';
  }
});

const handleBeforeUnload = (e) => {
  if (isDirty.value && !isSubmitted.value) {
    e.preventDefault();
    e.returnValue = '';
  }
};

// Cảnh báo người dùng khi cố gắng rời trang nếu form đã bị chỉnh sửa
onBeforeRouteLeave((to, from, next) => {
  if (isDirty.value && !isSubmitted.value) {
    const confirmLeave = window.confirm(
      'Dữ liệu biểu mẫu đã được chỉnh sửa nhưng chưa lưu. Bạn có chắc chắn muốn rời khỏi trang không?'
    );
    if (confirmLeave) {
      next();
    } else {
      next(false);
    }
  } else {
    next();
  }
});

/**
 * Xử lý chọn tệp ảnh bìa
 */
const handleFileChange = (e) => {
  errors.AnhBia = '';
  const file = e.target.files?.[0];
  if (!file) return;

  // Kiểm tra định dạng (JPEG, PNG, WebP)
  const allowedMime = ['image/jpeg', 'image/png', 'image/webp'];
  const extMatch = /\.(jpe?g|png|webp)$/i.test(file.name);
  if (!allowedMime.includes(file.type) && !extMatch) {
    errors.AnhBia = 'Định dạng ảnh không hợp lệ. Chỉ chấp nhận tệp ảnh JPEG (.jpg), PNG (.png) hoặc WebP (.webp).';
    if (fileInputRef.value) fileInputRef.value.value = '';
    return;
  }

  // Kiểm tra kích thước tối đa 2MB
  if (file.size > 2 * 1024 * 1024) {
    errors.AnhBia = 'Dung lượng ảnh vượt quá giới hạn 2MB. Vui lòng chọn tệp ảnh nhỏ hơn.';
    if (fileInputRef.value) fileInputRef.value.value = '';
    return;
  }

  // Giải phóng URL cũ nếu có
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
  }

  selectedFile.value = file;
  previewUrl.value = URL.createObjectURL(file);
  // Khi chọn file mới, ưu tiên ảnh mới và bỏ chọn/vô hiệu hộp chọn gỡ ảnh
  removeCover.value = false;
};

/**
 * Xóa file ảnh vừa chọn
 */
const clearSelectedFile = () => {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = '';
  }
  selectedFile.value = null;
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }
};

/**
 * Kiểm tra form phía client (UX)
 */
const validateClient = () => {
  let isValid = true;
  Object.keys(errors).forEach((key) => {
    errors[key] = '';
  });

  const trimmedTen = form.TenSach.trim();
  if (!trimmedTen) {
    errors.TenSach = 'Tên sách là bắt buộc';
    isValid = false;
  } else if (trimmedTen.length > 200) {
    errors.TenSach = 'Tên sách không được vượt quá 200 ký tự';
    isValid = false;
  }

  if (form.DonGia === '' || form.DonGia === null || isNaN(form.DonGia)) {
    errors.DonGia = 'Đơn giá là bắt buộc';
    isValid = false;
  } else if (Number(form.DonGia) < 0) {
    errors.DonGia = 'Đơn giá không được nhỏ hơn 0';
    isValid = false;
  } else if (Number(form.DonGia) > 100000000) {
    errors.DonGia = 'Đơn giá không được vượt quá 100.000.000 VND';
    isValid = false;
  }

  if (form.SoQuyen === '' || form.SoQuyen === null || isNaN(form.SoQuyen)) {
    errors.SoQuyen = 'Số quyển là bắt buộc';
    isValid = false;
  } else if (Number(form.SoQuyen) < 0) {
    errors.SoQuyen = 'Số quyển không được nhỏ hơn 0';
    isValid = false;
  } else if (Number(form.SoQuyen) > 10000) {
    errors.SoQuyen = 'Số quyển không được vượt quá 10.000 quyển';
    isValid = false;
  } else if (isEditMode.value && Number(form.SoQuyen) < dangGiu.value) {
    errors.SoQuyen = `Số quyển không được nhỏ hơn ${dangGiu.value} (số quyển đang được giữ hoặc đang mượn)`;
    isValid = false;
  }

  if (form.NamXuatBan !== '' && form.NamXuatBan !== null && form.NamXuatBan !== undefined) {
    const year = Number(form.NamXuatBan);
    if (isNaN(year) || year < 1000 || year > currentYear) {
      errors.NamXuatBan = `Năm xuất bản phải là số nguyên từ 1000 đến năm hiện tại (${currentYear})`;
      isValid = false;
    }
  }

  if (!form.MaNXB) {
    errors.MaNXB = 'Vui lòng chọn một nhà xuất bản';
    isValid = false;
  }

  const trimmedTacGia = form.NguonGocTacGia.trim();
  if (!trimmedTacGia) {
    errors.NguonGocTacGia = 'Nguồn gốc/Tác giả là bắt buộc';
    isValid = false;
  } else if (trimmedTacGia.length > 150) {
    errors.NguonGocTacGia = 'Nguồn gốc/Tác giả không được vượt quá 150 ký tự';
    isValid = false;
  }

  if (form.TheLoai && form.TheLoai.trim().length > 60) {
    errors.TheLoai = 'Thể loại không được vượt quá 60 ký tự';
    isValid = false;
  }

  if (form.MoTa && form.MoTa.trim().length > 2000) {
    errors.MoTa = 'Mô tả không được vượt quá 2000 ký tự';
    isValid = false;
  }

  return isValid;
};

/**
 * Gửi form lên server
 */
const handleSubmit = async () => {
  if (isSoftDeleted.value) return;
  if (!validateClient()) return;

  isSubmitting.value = true;
  errors.general = '';

  // Xây dựng FormData đúng các trường backend cho phép, KHÔNG gửi MaSach, SoQuyenConLai, DaXoa
  const formData = new FormData();
  formData.append('TenSach', form.TenSach.trim());
  formData.append('DonGia', String(Math.floor(Number(form.DonGia))));
  formData.append('SoQuyen', String(Math.floor(Number(form.SoQuyen))));
  if (form.NamXuatBan !== '' && form.NamXuatBan !== null && form.NamXuatBan !== undefined) {
    formData.append('NamXuatBan', String(Math.floor(Number(form.NamXuatBan))));
  }
  formData.append('MaNXB', form.MaNXB.trim());
  formData.append('NguonGocTacGia', form.NguonGocTacGia.trim());

  if (form.TheLoai.trim()) {
    formData.append('TheLoai', form.TheLoai.trim());
  }

  if (form.MoTa.trim()) {
    formData.append('MoTa', form.MoTa.trim());
  }

  // Tệp ảnh bìa nếu có chọn
  if (selectedFile.value) {
    formData.append('AnhBia', selectedFile.value);
  } else if (isEditMode.value && removeCover.value) {
    formData.append('XoaAnhBia', 'true');
  }

  try {
    if (isEditMode.value) {
      await bookApi.update(paramMaSach.value, formData);
      isSubmitted.value = true;
      router.push({
        path: '/books',
        query: { notice: `Cập nhật sách "${form.TenSach}" thành công.` },
      });
    } else {
      const res = await bookApi.create(formData);
      isSubmitted.value = true;
      const createdBook = res.data?.data;
      router.push({
        path: '/books',
        query: { notice: `Thêm mới sách "${createdBook?.TenSach || form.TenSach}" thành công.` },
      });
    }
  } catch (error) {
    const status = error.response?.status;
    const errorCode = error.response?.data?.error?.code;

    // Lỗi 400 validation: gắn lỗi vào từng trường
    if (status === 400) {
      const fieldErrors = getFieldErrors(error);
      Object.keys(fieldErrors).forEach((field) => {
        if (field in errors) {
          errors[field] = fieldErrors[field];
        }
      });
      if (Object.keys(fieldErrors).length === 0) {
        errors.general = getErrorMessage(error);
      }
    }
    // Lỗi 409 INVALID_STATE: hiển thị nguyên văn thông điệp của server ở ô Số quyển
    else if (status === 409 && errorCode === 'INVALID_STATE') {
      errors.SoQuyen = error.response?.data?.error?.message || 'Số quyển cập nhật không hợp lệ với số lượng đang mượn.';
    } else {
      errors.general = getErrorMessage(error);
    }
  } finally {
    isSubmitting.value = false;
  }
};
</script>

<template>
  <div class="book-form-view">
    <!-- Trường hợp đang tải chi tiết sách ở chế độ sửa -->
    <LoadingSpinner v-if="isLoading" text="Đang tải thông tin sách..." />

    <!-- Trường hợp 404 Không tìm thấy sách -->
    <div v-else-if="notFound" class="card shadow-sm border-0 py-5 text-center">
      <div class="card-body">
        <div class="display-3 text-secondary mb-3">
          <i class="bi bi-file-earmark-x"></i>
        </div>
        <h4 class="fw-bold mb-2">Không tìm thấy sách</h4>
        <p class="text-secondary small mb-4" style="white-space: pre-line;">
          {{ notFoundMessage || 'Cuốn sách yêu cầu không tồn tại hoặc đã bị xóa.' }}
        </p>
        <RouterLink to="/books" class="btn btn-primary btn-sm">
          <i class="bi bi-arrow-left me-1"></i> Quay lại danh sách sách
        </RouterLink>
      </div>
    </div>

    <!-- Biểu mẫu chính (Thêm mới hoặc Chỉnh sửa) -->
    <div v-else>
      <!-- Tiêu đề trang -->
      <div class="d-flex align-items-center justify-content-between mb-4">
        <div>
          <nav aria-label="breadcrumb">
            <ol class="breadcrumb mb-1 small">
              <li class="breadcrumb-item"><RouterLink to="/books">Quản lý Sách</RouterLink></li>
              <li class="breadcrumb-item active" aria-current="page">
                {{ isEditMode ? 'Chỉnh sửa sách' : 'Thêm sách mới' }}
              </li>
            </ol>
          </nav>
          <h1 class="h3 fw-bold mb-0 d-flex align-items-center gap-2">
            <i class="bi" :class="isEditMode ? 'bi-pencil-square text-primary' : 'bi-plus-circle text-primary'"></i>
            <span>{{ isEditMode ? 'Chỉnh sửa Sách: ' + (form.TenSach || paramMaSach) : 'Thêm Sách mới' }}</span>
          </h1>
        </div>
        <RouterLink to="/books" class="btn btn-outline-secondary btn-sm">
          <i class="bi bi-arrow-left me-1"></i> Quay lại danh sách
        </RouterLink>
      </div>

      <!-- Cảnh báo nếu sách đã xóa mềm: khóa toàn bộ form (chỉ xem) -->
      <div v-if="isSoftDeleted" class="alert alert-warning border-0 shadow-sm d-flex align-items-center gap-3 mb-4">
        <i class="bi bi-exclamation-triangle-fill fs-3 text-warning"></i>
        <div>
          <div class="fw-bold">Cuốn sách này đã bị xóa mềm</div>
          <div class="small">
            Sách đã xóa mềm không thể lưu thay đổi hoặc mở lại để mượn. Toàn bộ biểu mẫu hiện ở chế độ chỉ đọc.
          </div>
        </div>
      </div>

      <!-- Thông báo lỗi chung từ server -->
      <div
        v-if="errors.general"
        class="alert alert-danger border-0 shadow-sm d-flex align-items-center gap-2 mb-4"
      >
        <i class="bi bi-exclamation-octagon-fill fs-5"></i>
        <div style="white-space: pre-line;">{{ errors.general }}</div>
      </div>

      <form @submit.prevent="handleSubmit" novalidate>
        <div class="row g-4">
          <!-- Cột bên trái: Thông tin chính của sách -->
          <div class="col-12 col-lg-8">
            <div class="card shadow-sm border-0 mb-4">
              <div class="card-header bg-white py-3 border-bottom">
                <h5 class="card-title mb-0 fw-bold small text-uppercase text-secondary">
                  Thông tin cơ bản
                </h5>
              </div>
              <div class="card-body p-4">
                <!-- Mã sách (chỉ đọc ở chế độ sửa) -->
                <div v-if="isEditMode" class="mb-3">
                  <label class="form-label small fw-bold text-muted">Mã sách</label>
                  <div>
                    <span class="badge bg-light text-dark border font-monospace px-3 py-2 fs-6">
                      {{ paramMaSach }}
                    </span>
                  </div>
                </div>

                <!-- Tên sách -->
                <div class="mb-3">
                  <label for="bookTenSach" class="form-label small fw-bold">
                    Tên sách <span class="text-danger">*</span>
                  </label>
                  <input
                    id="bookTenSach"
                    v-model="form.TenSach"
                    type="text"
                    class="form-control"
                    :class="{ 'is-invalid': errors.TenSach }"
                    placeholder="Nhập tên sách (tối đa 200 ký tự)"
                    maxlength="200"
                    :disabled="isSubmitting || isSoftDeleted"
                    required
                  />
                  <div v-if="errors.TenSach" class="invalid-feedback">
                    {{ errors.TenSach }}
                  </div>
                </div>

                <!-- Tác giả / Nguồn gốc & Thể loại -->
                <div class="row g-3 mb-3">
                  <div class="col-12 col-md-7">
                    <label for="bookTacGia" class="form-label small fw-bold">
                      Nguồn gốc / Tác giả <span class="text-danger">*</span>
                    </label>
                    <input
                      id="bookTacGia"
                      v-model="form.NguonGocTacGia"
                      type="text"
                      class="form-control"
                      :class="{ 'is-invalid': errors.NguonGocTacGia }"
                      placeholder="Nhập tên tác giả hoặc cơ quan ban hành (tối đa 150 ký tự)"
                      maxlength="150"
                      :disabled="isSubmitting || isSoftDeleted"
                      required
                    />
                    <div v-if="errors.NguonGocTacGia" class="invalid-feedback">
                      {{ errors.NguonGocTacGia }}
                    </div>
                  </div>

                  <div class="col-12 col-md-5">
                    <label for="bookTheLoai" class="form-label small fw-bold">
                      Thể loại
                    </label>
                    <input
                      id="bookTheLoai"
                      v-model="form.TheLoai"
                      type="text"
                      class="form-control"
                      :class="{ 'is-invalid': errors.TheLoai }"
                      placeholder="Ví dụ: Giáo trình, Công nghệ..."
                      maxlength="60"
                      :disabled="isSubmitting || isSoftDeleted"
                    />
                    <div v-if="errors.TheLoai" class="invalid-feedback">
                      {{ errors.TheLoai }}
                    </div>
                  </div>
                </div>

                <!-- Nhà xuất bản & Năm xuất bản -->
                <div class="row g-3 mb-3">
                  <div class="col-12 col-md-7">
                    <label for="bookMaNXB" class="form-label small fw-bold">
                      Nhà xuất bản <span class="text-danger">*</span>
                    </label>
                    <select
                      id="bookMaNXB"
                      v-model="form.MaNXB"
                      class="form-select"
                      :class="{ 'is-invalid': errors.MaNXB }"
                      :disabled="isSubmitting || isSoftDeleted || isPublishersLoading"
                      required
                    >
                      <option value="" disabled>-- Chọn nhà xuất bản --</option>
                      <option v-for="pub in publishers" :key="pub.MaNXB" :value="pub.MaNXB">
                        {{ pub.TenNXB }} ({{ pub.MaNXB }})
                      </option>
                    </select>
                    <div v-if="errors.MaNXB" class="invalid-feedback">
                      {{ errors.MaNXB }}
                    </div>
                  </div>

                  <div class="col-12 col-md-5">
                    <label for="bookNamXuatBan" class="form-label small fw-bold">
                      Năm xuất bản
                    </label>
                    <input
                      id="bookNamXuatBan"
                      v-model.number="form.NamXuatBan"
                      type="number"
                      class="form-control"
                      :class="{ 'is-invalid': errors.NamXuatBan }"
                      :min="1000"
                      :max="currentYear"
                      placeholder="Ví dụ: 2024"
                      :disabled="isSubmitting || isSoftDeleted"
                    />
                    <div v-if="errors.NamXuatBan" class="invalid-feedback">
                      {{ errors.NamXuatBan }}
                    </div>
                  </div>
                </div>

                <!-- Mô tả nội dung -->
                <div class="mb-0">
                  <div class="d-flex justify-content-between align-items-center mb-1">
                    <label for="bookMoTa" class="form-label small fw-bold mb-0">Mô tả sách</label>
                    <span class="text-muted small" style="font-size: 0.75rem;">
                      {{ form.MoTa ? form.MoTa.length : 0 }} / 2000 ký tự
                    </span>
                  </div>
                  <textarea
                    id="bookMoTa"
                    v-model="form.MoTa"
                    rows="4"
                    class="form-control"
                    :class="{ 'is-invalid': errors.MoTa }"
                    placeholder="Tóm tắt nội dung sách, mục lục hoặc ghi chú đặc biệt..."
                    maxlength="2000"
                    :disabled="isSubmitting || isSoftDeleted"
                    style="white-space: pre-line;"
                  ></textarea>
                  <div v-if="errors.MoTa" class="invalid-feedback">
                    {{ errors.MoTa }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Khối Kho & Đơn giá -->
            <div class="card shadow-sm border-0 mb-4">
              <div class="card-header bg-white py-3 border-bottom">
                <h5 class="card-title mb-0 fw-bold small text-uppercase text-secondary">
                  Đơn giá & Số lượng kho
                </h5>
              </div>
              <div class="card-body p-4">
                <div class="row g-3">
                  <!-- Đơn giá -->
                  <div class="col-12 col-md-6">
                    <label for="bookDonGia" class="form-label small fw-bold">
                      Đơn giá (VND) <span class="text-danger">*</span>
                    </label>
                    <div class="input-group">
                      <input
                        id="bookDonGia"
                        v-model.number="form.DonGia"
                        type="number"
                        class="form-control"
                        :class="{ 'is-invalid': errors.DonGia }"
                        min="0"
                        max="100000000"
                        step="1000"
                        placeholder="0"
                        :disabled="isSubmitting || isSoftDeleted"
                        required
                      />
                      <span class="input-group-text bg-light text-muted">₫</span>
                      <div v-if="errors.DonGia" class="invalid-feedback">
                        {{ errors.DonGia }}
                      </div>
                    </div>
                    <div class="form-text small">
                      Đơn giá làm căn cứ tính bồi thường khi sách bị mất hoặc rách.
                    </div>
                  </div>

                  <!-- Số quyển -->
                  <div class="col-12 col-md-6">
                    <label for="bookSoQuyen" class="form-label small fw-bold">
                      Số quyển (Tổng số trong kho) <span class="text-danger">*</span>
                    </label>
                    <input
                      id="bookSoQuyen"
                      v-model.number="form.SoQuyen"
                      type="number"
                      class="form-control"
                      :class="{ 'is-invalid': errors.SoQuyen }"
                      :min="isEditMode ? dangGiu : 0"
                      max="10000"
                      :disabled="isSubmitting || isSoftDeleted"
                      required
                    />
                    <div v-if="errors.SoQuyen" class="invalid-feedback">
                      {{ errors.SoQuyen }}
                    </div>

                    <!-- Chú thích chế độ sửa: đang có X quyển được giữ hoặc đang mượn -->
                    <div v-if="isEditMode" class="form-text small mt-1">
                      <span v-if="dangGiu > 0" class="text-primary fw-medium">
                        <i class="bi bi-info-circle me-1"></i>
                        Đang có <strong>{{ dangGiu }}</strong> quyển được giữ hoặc đang mượn, số quyển không được nhỏ hơn {{ dangGiu }}.
                      </span>
                      <span v-else class="text-muted">
                        Số lượng còn lại hiện tại: <strong>{{ currentSoQuyenConLai }}</strong> / {{ form.SoQuyen }} quyển.
                      </span>
                    </div>

                    <!-- Chú thích chế độ thêm mới -->
                    <div v-else class="form-text small text-muted mt-1">
                      <i class="bi bi-info-circle me-1"></i>
                      Khi thêm mới, số quyển còn lại ban đầu sẽ bằng tổng số quyển.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Cột bên phải: Tải ảnh bìa & Thao tác lưu -->
          <div class="col-12 col-lg-4">
            <!-- Khối tải ảnh bìa -->
            <div class="card shadow-sm border-0 mb-4">
              <div class="card-header bg-white py-3 border-bottom">
                <h5 class="card-title mb-0 fw-bold small text-uppercase text-secondary">
                  Ảnh bìa sách
                </h5>
              </div>
              <div class="card-body p-4 text-center">
                <!-- Khu vực xem trước ảnh -->
                <div class="cover-preview-box mx-auto mb-3 border rounded p-2 bg-light d-flex align-items-center justify-content-center">
                  <!-- Xem trước ảnh mới chọn -->
                  <div v-if="previewUrl" class="w-100 h-100 position-relative">
                    <img
                      :src="previewUrl"
                      alt="Xem trước ảnh bìa mới"
                      class="img-fluid rounded h-100 w-100 object-fit-contain"
                    />
                    <span class="badge bg-success position-absolute top-0 start-0 m-1">
                      Ảnh mới
                    </span>
                  </div>

                  <!-- Xem trước ảnh hiện tại (chế độ sửa) -->
                  <div v-else-if="isEditMode && currentCoverPath && !removeCover" class="w-100 h-100 position-relative">
                    <img
                      :src="getCoverUrl(currentCoverPath)"
                      :alt="'Bìa hiện tại: ' + form.TenSach"
                      class="img-fluid rounded h-100 w-100 object-fit-contain"
                    />
                    <span class="badge bg-secondary position-absolute top-0 start-0 m-1">
                      Ảnh hiện tại
                    </span>
                  </div>

                  <!-- Placeholder ảnh khi không có ảnh -->
                  <div v-else class="text-muted py-4">
                    <i class="bi bi-image fs-1 d-block mb-2 opacity-50"></i>
                    <span class="small">Chưa có ảnh bìa</span>
                  </div>
                </div>

                <!-- Input chọn file -->
                <div class="mb-3">
                  <input
                    id="bookAnhBia"
                    ref="fileInputRef"
                    type="file"
                    class="form-control form-control-sm"
                    :class="{ 'is-invalid': errors.AnhBia }"
                    accept="image/jpeg,image/png,image/webp"
                    :disabled="isSubmitting || isSoftDeleted"
                    @change="handleFileChange"
                  />
                  <div v-if="errors.AnhBia" class="invalid-feedback text-start">
                    {{ errors.AnhBia }}
                  </div>
                  <div class="form-text small text-start">
                    Định dạng: JPEG, PNG, WebP. Tối đa 2MB.
                  </div>
                </div>

                <!-- Nút bỏ chọn file ảnh mới -->
                <div v-if="selectedFile" class="mb-3 text-start">
                  <button
                    type="button"
                    class="btn btn-outline-secondary btn-sm w-100"
                    @click="clearSelectedFile"
                  >
                    <i class="bi bi-x-circle me-1"></i> Bỏ chọn ảnh mới
                  </button>
                </div>

                <!-- Hộp chọn gỡ ảnh bìa hiện tại (chế độ sửa) -->
                <div
                  v-if="isEditMode && currentCoverPath"
                  class="form-check text-start p-2 border rounded bg-light"
                >
                  <input
                    id="checkboxRemoveCover"
                    v-model="removeCover"
                    class="form-check-input"
                    type="checkbox"
                    :disabled="Boolean(selectedFile) || isSubmitting || isSoftDeleted"
                  />
                  <label class="form-check-label small" for="checkboxRemoveCover">
                    Gỡ ảnh bìa hiện tại
                  </label>
                  <div v-if="selectedFile" class="text-muted" style="font-size: 0.7rem;">
                    (Đang ưu tiên sử dụng tệp ảnh mới chọn)
                  </div>
                </div>
              </div>
            </div>

            <!-- Khối nút Lưu / Hủy -->
            <div class="card shadow-sm border-0">
              <div class="card-body p-3">
                <div class="d-grid gap-2">
                  <button
                    type="submit"
                    class="btn btn-primary d-flex align-items-center justify-content-center gap-2"
                    :disabled="isSubmitting || isSoftDeleted"
                  >
                    <span
                      v-if="isSubmitting"
                      class="spinner-border spinner-border-sm"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    <i v-else class="bi bi-check-lg"></i>
                    <span>{{ isEditMode ? 'Lưu thay đổi' : 'Thêm sách' }}</span>
                  </button>

                  <RouterLink to="/books" class="btn btn-outline-secondary btn-sm">
                    Hủy bỏ
                  </RouterLink>
                </div>

                <div v-if="isDirty" class="text-center text-muted small mt-2">
                  <i class="bi bi-pencil-fill me-1 text-warning"></i>
                  Có thay đổi chưa lưu
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.cover-preview-box {
  width: 160px;
  height: 220px;
  overflow: hidden;
}
</style>
