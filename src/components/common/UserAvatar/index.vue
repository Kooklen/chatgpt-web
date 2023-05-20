<script setup lang='ts'>
import { computed } from 'vue'
import { NAvatar, useMessage } from 'naive-ui'
import { useUserStore } from '@/store'
import defaultAvatar from '@/assets/avatar.jpg'
import { isString } from '@/utils/is'
const message = useMessage()

const userStore = useUserStore()
const userInfo = computed(() => userStore.userInfo)
const handleUpdateShow = () => {
  message.success(
    '点击 邀请新好友 获得您的专属邀请链接，每邀请一位新的用户，您可以获得10次使用GPT4模型的机会',
    { duration: 10000 },
  )
}
</script>

<template>
  <div class="flex items-center overflow-hidden">
    <div class="w-10 h-10 overflow-hidden rounded-full shrink-0">
      <template v-if="isString(userInfo.avatar) && userInfo.avatar.length > 0">
        <NAvatar
          size="large"
          round
          :src="userInfo.avatar"
          :fallback-src="defaultAvatar"
        />
      </template>
      <template v-else>
        <NAvatar size="large" round :src="defaultAvatar" />
      </template>
    </div>
    <div class="flex-1 min-w-0 ml-2">
      <h2 class="overflow-hidden font-bold text-md text-ellipsis whitespace-nowrap">
        {{ 'OpenAI' }}
      </h2>
      <p class="overflow-hidden text-xs text-gray-500 text-ellipsis whitespace-nowrap">
        <span @click="handleUpdateShow">免费使用GPT4！</span>
      </p>
    </div>
  </div>
</template>
