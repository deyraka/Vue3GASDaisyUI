<script setup>
import { computed, ref, watchEffect } from 'vue'

import { clearStoredProfile, getStoredProfile, cleanupTokenFromUrl } from '../services/ssoClient'

const profile = ref(getStoredProfile())

watchEffect(() => {
  profile.value = getStoredProfile()
})

const fullName = computed(() => {
  if (!profile.value) return ''
  const username = profile.value.username || ''
  const nip = profile.value.nip ? ` (${profile.value.nip})` : ''
  return `${username}${nip}`.trim()
})

function logout() {
  clearStoredProfile()
  cleanupTokenFromUrl()
  // Hard reload so App.vue re-triggers redirectToSSO
  window.location.href = window.location.origin + window.location.pathname
}
</script>

<template>
  <main class="homeview">
    <div class="panel">
      <h1 class="title">
        SSO Session
      </h1>

      <div v-if="profile" class="card">
        <p class="muted">
          <strong>Login:</strong> {{ fullName }}
        </p>
        <p v-if="profile.phone" class="muted">
          <strong>Phone:</strong> {{ profile.phone }}
        </p>
        <p v-if="profile.email" class="muted">
          <strong>Email:</strong> {{ profile.email }}
        </p>

        <button class="btn" style="margin-top: 12px;" @click="logout">
          Logout
        </button>
      </div>

      <div v-else class="card">
        <p class="muted">
          Menunggu bootstrap SSO... Jika belum, lakukan reload halaman.
        </p>
      </div>
    </div>
  </main>
</template>

<style scoped>
.homeview {
  padding: 1rem 0;
}

.panel {
  max-width: 720px;
  margin: 0 auto;
}

.title {
  font-size: 2rem;
  font-weight: 800;
  text-decoration: underline;
  margin: 0 0 1rem;
}

.muted {
  margin-top: 1rem;
  color: var(--color-text);
  opacity: 0.9;
}

.card {
  border: 1px solid rgba(17, 24, 39, .14);
  border-radius: 14px;
  padding: 16px;
  background: #fff;
}

@media (min-width: 1024px) {
  .homeview {
    min-height: 100vh;
    display: flex;
    align-items: center;
  }
}
</style>
