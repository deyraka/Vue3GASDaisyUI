<script setup>
import { onMounted, ref } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import HelloWorld from './components/HelloWorld.vue'

import { cleanupTokenFromUrl, getAuthTokenFromQuery, getStoredProfile, redirectToSSO, setStoredProfile, verifyTokenWithSSO } from './services/ssoClient'

const bootError = ref('')
const profile = ref(getStoredProfile())

onMounted(async () => {
  bootError.value = ''

  // If already have profile (e.g., page refresh after login), keep it.
  if (profile.value) return

  const token = getAuthTokenFromQuery()
  if (!token) {
    // No token => redirect to central SSO with app_id
    try {
      redirectToSSO()
    } catch (e) {
      bootError.value = e?.message || String(e)
    }
    return
  }

  try {
    const p = await verifyTokenWithSSO(token)
    setStoredProfile(p)
    profile.value = p
    cleanupTokenFromUrl()
  } catch (e) {
    bootError.value = e?.message || String(e)
    cleanupTokenFromUrl()
  }
})
</script>

<template>
  <header>
    <img alt="Vue logo" class="logo" src="@/assets/logo.svg" width="125" height="125" />

    <div class="wrapper">
      <HelloWorld msg="You did it!" />

      <nav>
        <RouterLink to="/">Home</RouterLink>
        <RouterLink to="/about">About</RouterLink>
      </nav>
    </div>
  </header>

  <div v-if="bootError" style="max-width: 720px; margin: 0 auto; padding: 0 1rem;">
    <p style="color: #8a0f0f; background: #ffecec; border: 1px solid #ffbdbd; border-radius: 10px; padding: 10px 12px; margin-top: 12px;">
      SSO bootstrap error: {{ bootError }}
    </p>
  </div>

  <RouterView />
</template>

<style scoped>
header {
  line-height: 1.5;
  max-height: 100vh;
}

.logo {
  display: block;
  margin: 0 auto 2rem;
}

nav {
  width: 100%;
  font-size: 12px;
  text-align: center;
  margin-top: 2rem;
}

nav a.router-link-exact-active {
  color: var(--color-text);
}

nav a.router-link-exact-active:hover {
  background-color: transparent;
}

nav a {
  display: inline-block;
  padding: 0 1rem;
  border-left: 1px solid var(--color-border);
}

nav a:first-of-type {
  border: 0;
}

@media (min-width: 1024px) {
  header {
    display: flex;
    place-items: center;
    padding-right: calc(var(--section-gap) / 2);
  }

  .logo {
    margin: 0 2rem 0 0;
  }

  header .wrapper {
    display: flex;
    place-items: flex-start;
    flex-wrap: wrap;
  }

  nav {
    text-align: left;
    margin-left: -1rem;
    font-size: 1rem;

    padding: 1rem 0;
    margin-top: 1rem;
  }
}
</style>
