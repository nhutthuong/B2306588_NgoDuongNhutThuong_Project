<script setup>
import { RouterView } from 'vue-router';
import AppNavbar from './components/AppNavbar.vue';
import AppFooter from './components/AppFooter.vue';
</script>

<template>
  <div class="d-flex flex-column min-vh-100">
    <AppNavbar />
    <main class="main-content container py-4">
      <RouterView />
    </main>
    <AppFooter />
  </div>
</template>

<style scoped>
.main-content {
  flex: 1 0 auto;
}
</style>
