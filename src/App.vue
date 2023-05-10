<script setup lang="ts">
// import type { GlobalThemeOverrides } from 'naive-ui'
import type { GlobalThemeOverrides } from 'naive-ui'
import { NConfigProvider } from 'naive-ui'
import { NaiveProvider } from '@/components/common'
import { useLanguage } from '@/hooks/useLanguage'

const { language } = useLanguage()
const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: 'rgba(57,172,255,0.8)',
    primaryColorHover: '#39ACFF',
  },
  AutoComplete: {
  },
  Input: {
    borderFocus: '#eee',
  },
  Button: {
    borderHover: '#39ACFF',
  },
  Icon: {
    color: '#39ACFF',
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
