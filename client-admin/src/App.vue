<script setup>
import { computed } from 'vue';
import { useRoute, RouterView } from 'vue-router';
import AdminSidebar from './components/AdminSidebar.vue';
import AdminNavbar from './components/AdminNavbar.vue';

const route = useRoute();
const isAuthLayout = computed(() => route.meta.layout === 'auth');
</script>

<template>
  <div v-if="isAuthLayout" class="container">
    <RouterView />
  </div>

  <div v-else class="d-flex min-vh-100">
    <AdminSidebar />
    <div class="admin-content-wrapper">
      <AdminNavbar />
      <main class="admin-content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin-content-wrapper {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.admin-content {
  flex: 1;
  padding: 1.5rem;
}
</style>
