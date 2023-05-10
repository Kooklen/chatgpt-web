<script setup lang='ts'>
import type { CSSProperties } from 'vue'
import { computed, ref, watch } from 'vue'
import { NButton, NLayoutSider, NPopover } from 'naive-ui'
import List from './List.vue'
import Footer from './Footer.vue'
import { useAppStore, useChatStore } from '@/store'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { PromptStore } from '@/components/common'

const appStore = useAppStore()
const chatStore = useChatStore()

const { isMobile } = useBasicLayout()
const show = ref(false)
const collapsed = computed(() => appStore.siderCollapsed)

function handleAdd() {
  chatStore.addHistory({ title: 'New Chat', uuid: Date.now(), isEdit: false })
  if (isMobile.value)
    appStore.setSiderCollapsed(true)
}

function handleUpdateCollapsed() {
  appStore.setSiderCollapsed(!collapsed.value)
}

const getMobileClass = computed<CSSProperties>(() => {
  if (isMobile.value) {
    return {
      position: 'fixed',
      zIndex: 50,
    }
  }
  return {}
})

const mobileSafeArea = computed(() => {
  if (isMobile.value) {
    return {
      paddingBottom: 'env(safe-area-inset-bottom)',
    }
  }
  return {}
})

watch(
  isMobile,
  (val) => {
    appStore.setSiderCollapsed(val)
  },
  {
    immediate: true,
    flush: 'post',
  },
)
</script>

<template>
  <NLayoutSider
    :collapsed="collapsed"
    :collapsed-width="0"
    :width="260"
    :show-trigger="isMobile ? false : 'arrow-circle'"
    collapse-mode="transform"
    position="absolute"
    bordered
    :style="getMobileClass"
    @update-collapsed="handleUpdateCollapsed"
  >
    <div class="flex flex-col h-full" :style="mobileSafeArea">
      <main class="flex flex-col flex-1 min-h-0">
        <div class="mb-4">
          <button block class="new-btn" @click="handleAdd">
            {{ $t('chat.newChatButton') }}
          </button>
        </div>
        <div class="flex-1 min-h-0 pb-4 overflow-hidden">
          <List />
        </div>
        <div class="p-4 pb-0">
          <NPopover trigger="click" :delay="1500" :duration="1500">
            <template #trigger>
              <NButton type="primary" block>
                {{ $t('store.feedbackBug') }}
              </NButton>
            </template>
            <div>
              <img src="https://i.328888.xyz/2023/04/22/i58CjJ.jpeg" style="width: 220px;height: 190px;">
            </div>
          </NPopover>
        </div>
        <div class="p-4 pb-0 mb-2">
          <NPopover trigger="click" :delay="1500" :duration="1500">
            <template #trigger>
              <NButton type="primary" block>
                {{ $t('store.supportMe') }}
              </NButton>
            </template>
            <div>
              <img src="https://i.328888.xyz/2023/03/30/i0pdaF.png" style="width: 200px;height: 220px;">
            </div>
          </NPopover>
        </div>
        <!--        <div class="p-4"> -->
        <!--          <NButton block @click="show = true"> -->
        <!--            {{ $t('store.siderButton') }} -->
        <!--          </NButton> -->
        <!--        </div> -->
      </main>
      <Footer />
    </div>
  </NLayoutSider>
  <template v-if="isMobile">
    <div v-show="!collapsed" class="fixed inset-0 z-40 bg-black/40" @click="handleUpdateCollapsed" />
  </template>
  <PromptStore v-model:visible="show" />
</template>

<style scoped>
  .new-btn{
		color: #438EFF;
		width: 100%;
		height: 75px;
		margin-left: 0;
		margin-right: 0;
		background: #FBFBFB;
	}
	.new-btn:hover {
		background: #e9e9e9;
		/*color: #438EFF;*/
	}
</style>
