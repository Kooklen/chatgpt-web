<script setup lang='ts'>
import type { CSSProperties } from 'vue'
import { computed, ref, watch } from 'vue'
import { NButton, NLayoutSider, NModal, NPopover, useMessage } from 'naive-ui'
import List from './List.vue'
import Footer from './Footer.vue'
import { useAppStore, useChatStore } from '@/store'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { PromptStore } from '@/components/common'
import { fetchUserInfo } from '@/api'

const appStore = useAppStore()
const chatStore = useChatStore()
const message = useMessage()
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
const showModal = ref(false)
const token = ref(localStorage.getItem('token'))
const secretKey = token.value?.trim()
const userInfo = ref({
  email: '',
  invitation_code: '',
  membership_end: '',
  membership_times: 0,
})
const handleInvite = async () => {
  if (!secretKey)
    return

  showModal.value = true
  try {
    const { data } = await fetchUserInfo(secretKey)
    // @ts-expect-error
    userInfo.value.email = data.userInfo.email
    // @ts-expect-error

    userInfo.value.invitation_code = data.userInfo.invitation_code
    // @ts-expect-error

    userInfo.value.membership_end = data.userInfo.membership_end
    // @ts-expect-error

    userInfo.value.membership_times = data.userInfo.membership_times
  }
  catch (error: any) {
    console.error(error)
  }
}

const checkMembershipEnd = computed(() => {
  const now = new Date()
  if (userInfo.value && userInfo.value.membership_end) {
    const membershipEnd = new Date(userInfo.value.membership_end)
    return membershipEnd > now
  }
  return false
})

function formatDate(date: any) {
  const d = new Date(date)
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function copyToClipboard(text: any) {
  if (!navigator.clipboard) {
    message.warning(
      '浏览器不支持复制到您的剪贴板，请手动复制。',
    )
    console.error('Clipboard API not available')
    return
  }

  navigator.clipboard.writeText(text).then(() => {
    message.info(
      '已经成功完整复制到您的剪贴板啦！',
    )
  }, (err) => {
    console.error('Could not copy text: ', err)
  })
}

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
  <NModal v-model:show="showModal" preset="dialog" title="Dialog" class="modal">
    <template #header>
      <div>您的会员状态</div>
    </template>
    <div v-if="checkMembershipEnd" class="mt-5">
      您的GPT4会员截止日期是：{{ formatDate(userInfo.membership_end) }}
    </div>
    <div class="mt-5">
      您的GPT4剩余体验次数：{{ userInfo.membership_times }}次
    </div>
    <div class="mt-5" @click="copyToClipboard(userInfo.invitation_code)">
      <NPopover placement="right">
        <template #trigger>
          您的邀请码是：{{ userInfo.invitation_code }}
        </template>
        <span>点击可以直接复制！</span>
      </NPopover>
    </div>
    <div class="mt-5">
      <NPopover trigger="hover" placement="bottom">
        <template #trigger>
          <div class="mt-5" @click="copyToClipboard(`http://aiworlds.cc/#/login/${userInfo.invitation_code}`)">
            您的邀请链接是：http://aiworlds.cc/#/login/{{ userInfo.invitation_code }}
          </div>
        </template>
        <span>点击可以直接复制！</span>
      </NPopover>
    </div>
  </NModal>
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
          <NButton type="primary" block @click="handleInvite">
            {{ $t('store.invite') }}
          </NButton>
        </div>
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
.link-input {
	border: none;
	background: transparent;
	outline: none;
	width: 100%;
	cursor: pointer;
}

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

.link-input {
	word-wrap: break-word;
	overflow-wrap: break-word;
	white-space: pre-wrap; /* 添加这一行以确保在input中能换行 */
}

@media (max-width: 599px) {
	.modal {
		width: 90vw;
	}
}

@media (min-width: 600px) {
	.modal {
		width: 50vw;
	}
}
</style>
