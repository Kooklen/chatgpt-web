<script setup lang="ts">
// import type { GlobalThemeOverrides } from 'naive-ui'
import type { GlobalThemeOverrides } from 'naive-ui'
import { NConfigProvider } from 'naive-ui'
import { NaiveProvider } from '@/components/common'
import { useLanguage } from '@/hooks/useLanguage'

const { language } = useLanguage()
const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#39ACFF',
  },
  AutoComplete: {
    // colorHover: '#eee',
    // borderFocus: '#eee',
  },
  Input: {
    // colorHover: '#eee',
    borderFocus: '#eee',
  },
}
</script>

<template>
  <NConfigProvider
    class="h-full"
    :theme-overrides="themeOverrides"
    :locale="language"
  >
    <NaiveProvider>
      <RouterView />
    </NaiveProvider>
  </NConfigProvider>
</template>
