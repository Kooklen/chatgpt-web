<script setup lang='ts'>
import type { CSSProperties } from 'vue'
import { computed, ref, watch } from 'vue'
import { NButton, NCard, NImage, NLayoutSider, NModal, NPopover, NTabPane, NTable, NTabs, NTbody, NTd, NTh, NThead, NTr, useMessage } from 'naive-ui'
import { TinyEmitter } from 'tiny-emitter'
import Clipboard from 'clipboard'
import List from './List.vue'
import Footer from './Footer.vue'
import { useAppStore, useChatStore } from '@/store'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { PromptStore } from '@/components/common'
import { clickBuyBtn, fetchPackageInfo, fetchQrCode, fetchUserInfo } from '@/api'
import { router } from '@/router'
const emitter = new TinyEmitter()
const appStore = useAppStore()
const chatStore = useChatStore()
const Nmessage = useMessage()
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
const showUpgradeModal = ref(false)
const token = ref(localStorage.getItem('token'))
const secretKey = token.value?.trim()
const userInfo: any = ref({
  invitation_code: '',
  invitation_score: [{ gpt_times: 0, balance: 0 }],
  invitation_user: [],
})

const packageInfo: any = ref({
  gpt3_times: '',
  gpt4_times: '',
  gpt3_vip_end: '',
  gpt4_vip_end: '',
  balance: '0',
})

const selectCard = ref(0)

const packages: any = ref({})

const showPayModal = ref(false)

const getUserInfo = async () => {
  try {
    if (secretKey) {
      const { data } = await fetchUserInfo(secretKey)
      // @ts-expect-error
      userInfo.value = data.userInfo
    }
  }
  catch (error: any) {
    console.error(error)
  }
}

const currentTab = ref('accountStatus')

const pollingInterval = 3000 // 轮询间隔，单位为毫秒
let pollingIntervalId: any

const stopPolling = () => {
  clearInterval(pollingIntervalId)
}

let invitePollingInterval: any

const startinvitePolling = () => {
  invitePollingInterval = setInterval(getUserInfo, pollingInterval)
}

const stopinvitePolling = () => {
  clearInterval(invitePollingInterval)
}

const handleInvite = async () => {
  if (!secretKey) {
    router.push('/login')
    return
  }
  getUserInfo()
  startinvitePolling()
  showModal.value = true
}

const isPaying = ref(false)
const payDetail = ref({
  qrcode: '',
  packageName: '',
  packagePrice: '',
})
const getPayQrCode = async () => {
  if (secretKey) {
    isPaying.value = true
    const { data, message } = await fetchQrCode({ selectPackage: selectCard.value })
    if (message === '支付成功，已从余额扣款') {
      Nmessage.success(message)
      currentTab.value = 'accountStatus'
      isPaying.value = false
      return
    }
    showPayModal.value = true
    // @ts-expect-error
    payDetail.value = data
  }
}

const selectCardItem = (index: any) => {
  selectCard.value = index
  const ele = document.getElementById('page_item')
  window.scrollTo({
    top: ele!.offsetTop,
    behavior: 'smooth',
  })
  // ele!.scrollTop = ele!.scrollHeight
}

const clearQrCode = () => {
  payDetail.value.qrcode = ''
  isPaying.value = false
  stopPolling()
}

const paySuccess = () => {
  payDetail.value.qrcode = ''
  isPaying.value = false
  showPayModal.value = false
  currentTab.value = 'accountStatus'
  Nmessage.success(
    '请检查账户状态。',
  )
}

const getPackageInfo = async () => {
  try {
    if (secretKey) {
      const { data } = await fetchPackageInfo(secretKey)
      if (
        packageInfo.value.gpt3_times !== ''
				&& packageInfo.value.gpt4_times !== ''
				&& packageInfo.value.gpt3_vip_end !== ''
				&& packageInfo.value.gpt4_vip_end !== ''
				&& packageInfo.value.balance !== '0') {
        // @ts-expect-error
        if (packageInfo.value && (JSON.stringify(data.userInfo) !== JSON.stringify(packageInfo.value))) {
        }
      }
      // @ts-expect-error
      packageInfo.value = data.userInfo
      // @ts-expect-error
      packages.value = data.packages
    }
  }
  catch (error: any) {
    console.error(error)
  }
}

const startPolling = () => {
  pollingIntervalId = setInterval(getPackageInfo, pollingInterval)
}

const handleUpdateGpt4 = async () => {
  await clickBuyBtn()
  if (!secretKey) {
    router.push('/login')
    return
  }
  getPackageInfo()
  startPolling()
  showUpgradeModal.value = true
}
emitter.on('openHandleUpdateGpt4', handleUpdateGpt4)

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

function calculateRemainingDays(date: any) {
  const now = new Date()
  const targetDate = new Date(date)

  // 如果目标日期在现在之后
  if (targetDate > now) {
    // 计算时间差（以毫秒为单位），然后转换为天数
    const differenceInMilliseconds = targetDate.getTime() - now.getTime()
    const differenceInDays = Math.ceil(differenceInMilliseconds / (1000 * 60 * 60 * 24))

    return differenceInDays
  }
  else {
    // 如果目标日期在现在之前或就是现在，返回0
    return 0
  }
}

function copyToClipboard(text: string) {
  if (!navigator.clipboard) {
    return
  }

  navigator.clipboard.writeText(text).then(() => {
    Nmessage.info(
      '已经成功完整复制到您的剪贴板啦！',
    )
  }, (err) => {
    console.error('Could not copy text: ', err)
    const clipboard = new Clipboard('.copy-button', {
      text() {
        return text
      },
    })

    clipboard.on('success', (e) => {
      Nmessage.info('已经成功完整复制到您的剪贴板啦！')
      e.clearSelection()
    })

    clipboard.on('error', (e) => {
      Nmessage.warning('浏览器不支持复制到您的剪贴板，请手动复制。')
    })
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
  <NModal id="page_item" v-model:show="showUpgradeModal" preset="dialog" title="Dialog" class="modal" :on-after-leave="clearQrCode">
    <template #header>
      <div>会员状态</div>
    </template>
    <NTabs v-model:value="currentTab" type="line" animated>
      <NTabPane name="accountStatus" tab="账户情况">
        <div>
          您的账户余额为{{ (Number(packageInfo.balance) || 0).toFixed(2) }}元
          <span style="color: #999;font-size: 12px">(可以抵扣任意套餐)</span>
        </div>
        <div>
          <div class="package" style="font-size: 14px">
            <NCard
              v-show="calculateRemainingDays(packageInfo.gpt3_vip_end) > 0"
              class="package_item package_item_focus mb-10"
              size="small"
            >
              <div class="title">
                <span class="font-bold"> GPT-3.5会员剩余天数是：</span>{{ calculateRemainingDays(packageInfo.gpt3_vip_end) }}天
              </div>
            </NCard>
            <NCard
              v-show="calculateRemainingDays(packageInfo.gpt4_vip_end) > 0"
              class="package_item package_item_focus mb-10"
              size="small"
            >
              <div class="title">
                <span class="font-bold">GPT-4会员剩余天数是：</span>{{ calculateRemainingDays(packageInfo.gpt4_vip_end) }}天
              </div>
            </NCard>
            <NCard
              class="package_item package_item_focus mb-10"
              size="small"
            >
              <div class="title">
                <span class="font-bold">GPT-3.5剩余使用次数：</span>{{ packageInfo.gpt3_times }}次
              </div>
            </NCard>
            <NCard
              class="package_item package_item_focus mb-10"
              size="small"
            >
              <div class="title">
                <span class="font-bold">GPT-4剩余使用次数：</span>{{ packageInfo.gpt4_times }}次
              </div>
            </NCard>
          </div>
        </div>
      </NTabPane>
      <NTabPane name="buyPackage" tab="购买套餐">
        <div class="packages">
          <div class="mb-3">
            <span class="font-bold">
              您的账户余额为{{ (Number(packageInfo.balance) || 0).toFixed(2) }}元
            </span>
            <span style="color: #999;font-size: 12px">(可以抵扣任意套餐)</span>
          </div>
          <NCard
            v-for="(item, index) in packages"
            :key="index"
            class="package_item mt-3"
            size="small" :class="{ package_item_focus: item.id === selectCard }" @click="selectCardItem(item.id)"
          >
            <div class="discount">
              优惠{{ (item.origin_price - item.price).toFixed(2) }}元
            </div>
            <div class="title">
              {{ item.package_name }}
            </div>
            <div class="font-bold price">
              价格：{{ item.price }}
            </div>
            <div class="origin_price">
              原价：{{ item.origin_price }}
            </div>
            <div class="">
              {{ item.description }}
            </div>
          </NCard>
          <div class="mt-5" style="width: 100%;text-align: center">
            <NButton :disabled="isPaying" type="success" block @click="getPayQrCode">
              微信支付
            </NButton>
          </div>
        </div>
      </NTabPane>
    </NTabs>
  </NModal>
  <NModal v-model:show="showModal" preset="dialog" title="Dialog" class="modal" :on-after-leave="stopinvitePolling">
    <template #header>
      <div>您的邀请状态</div>
    </template>
    <NTabs type="line" animated>
      <NTabPane name="oasis" tab="邀请一下">
        <div @click="copyToClipboard(userInfo.invitation_code)">
          <NPopover placement="right">
            <template #trigger>
              您的邀请码是：{{ userInfo.invitation_code }}
            </template>
            <span>点击可以直接复制！【微信请手动复制】</span>
          </NPopover>
        </div>
        <div class="mt-5">
          <NPopover trigger="hover" placement="bottom">
            <template #trigger>
              <div class="mt-5" @click="copyToClipboard(`http://aiworlds.cc/#/login/${userInfo.invitation_code}`)">
                您的邀请链接是：http://aiworlds.cc/#/login/{{ userInfo.invitation_code }}
              </div>
            </template>
            <span>点击可以直接复制！【微信请手动复制】</span>
          </NPopover>
        </div>
        <div class="mt-3">
          您通过邀请已经累积获得
          <span style="color: #68bdff">{{ userInfo.invitation_score.gpt4_times || 0 }}</span>
          次GPT4使用机会以及
          <span style="color: #68bdff">{{ userInfo.invitation_score.balance || 0 }}
          </span>元奖励！
          <div class="mt-3" style="font-size: 14px;color: #333">
            邀请新用户可享多重福利：
            <br>① 每成功邀请一位新用户注册，将获得<span class="font-bold">5次免费向GPT-4提问</span>的机会。
            <br>② 可终身享有受邀用户消费金额<span class="font-bold">20%的返利</span>。
          </div>
        </div>
      </NTabPane>
      <NTabPane name="邀请列表">
        <NTable :bordered="true" :single-line="false">
          <NThead>
            <NTr>
              <NTh>被邀请用户</NTh>
              <NTh>邀请时间</NTh>
              <NTh>奖励</NTh>
            </NTr>
          </NThead>
          <NTbody>
            <NTr v-for="(item, index) in userInfo.invitation_user" :key="index">
              <NTd>{{ item.emailOrPhone }}</NTd>
              <NTd>{{ formatDate(item.invitationTime) }}</NTd>
              <NTd>{{ item.reward }}</NTd>
            </NTr>
          </NTbody>
        </NTable>
      </NTabPane>
    </NTabs>
  </NModal>
  <NModal v-model:show="showPayModal" preset="dialog" title="Dialog" class="modal" :on-after-leave="clearQrCode">
    <template #header>
      <div>请尽快支付</div>
    </template>
    <div v-if="payDetail.qrcode" class="text-center">
      <div>你选购的套餐为<span class="font-bold">{{ payDetail.packageName }}</span>，实际需要支付金额为<span class="font-bold">{{ Number(payDetail.packagePrice).toFixed(2) }}</span>元，请用<span style="color:#07c160">微信扫码</span></div>
      <NImage
        :src="payDetail.qrcode"
        preview-disabled
        class="qrCodeUrl"
      >
        <div class="qrcode-word mt5">
          支付成功后，请重新打开窗口
        </div>
      </nimage>
      <div class="flex ml-10 mr-10" style="justify-content: space-between">
        <NButton type="primary" size="small" @click="getPayQrCode">
          刷新二维码
        </NButton>
        <NButton type="primary" size="small" @click="paySuccess">
          支付成功
        </NButton>
      </div>
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
              <img src="@/views/chat/layout/sider/vx.jpg" style="width: 220px;height: auto;">
            </div>
          </NPopover>
        </div>
        <div class="p-4 pb-0">
          <NButton type="primary" block @click="handleInvite">
            {{ $t('store.invite') }}
          </NButton>
        </div>
        <div class="p-4 pb-0 mb-2">
          <NButton type="primary" block @click="handleUpdateGpt4">
            升级会员
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

<style lang="less" scoped>
.link-input {
	border: none;
	background: transparent;
	outline: none;
	width: 100%;
	cursor: pointer;
}

.new-btn{
	color: #68bdff;
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

.qrCodeUrl{
	width: 300px;
	height: 300px;
	margin: 0 auto;
}

.qrcode-word{
	width: 100%;
	text-align: center;
	font-size: 14px;
}

.package{
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	padding: 5px;
	margin-top: 5px;
	font-size: 18px;
	.package_item{
		cursor: none;
		margin-bottom: 10px;
		width:46%;
		height: 100px;
		.title{
			font-size: 14px;
		}
	}
	.package_item_focus{
		border: 1px solid #42adff;
		background-color: rgba(66, 173, 255,.1);
	}
}

.packages{
	display: flex;
	flex-wrap: wrap;
	justify-content: space-between;
	padding: 5px;
	margin-top: 5px;
	position: relative;

	.discount{
		text-align: center;
		color: white;
		width: 40%;
		height: 15%;
		background-color: #42adff;
		position: absolute;
		top: -10px;
		left: -4px;
		border-radius: 5px;
		z-index: 1000;
	}
	.package_item{
		cursor: pointer;
		text-align: center;
		div{
			font-size: 12px;
		}
		&:hover{
			border: 1px solid #68bdff;
		}
		.price{
			font-size: 1.3em;
			white-space: nowrap;
		}
		.origin_price{
			color: #999;
			text-decoration: line-through;
		}
		margin-bottom: 5px;
		width:46%;
		//height: 120px;
		.title{
			font-size: 14px;
		}
	}
	.package_item_focus{
		border: 1px solid #42adff;
		background-color: rgba(66, 173, 255,.1);
	}
}

@media (max-width: 599px) {
	.modal {
		width: 90vw;
	}

	.packages{
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		padding: 5px;
		margin-top: 5px;
		position: relative;

		.discount{
			text-align: center;
			color: white;
			width: 40%;
			height: 15%;
			background-color: #42adff;
			position: absolute;
			top: -10px;
			left: -4px;
			border-radius: 5px;
			z-index: 1000;
		}
		.package_item{
			cursor: pointer;
			text-align: center;
			div{
				font-size: 12px;
			}
			&:hover{
				border: 1px solid #68bdff;
			}
			.title{
				font-size: 12px;
			}
			.price{
				font-size: 1em;
				white-space: nowrap;
			}
			.origin_price{
				color: #999;
				text-decoration: line-through;
			}
			margin-bottom: 5px;
			width:46%;
		}
		.package_item_focus{
			border: 1px solid #42adff;
			background-color: rgba(66, 173, 255,.1);
		}
	}

}

@media (min-width: 600px) {
	.modal {
		width: 50vw;
	}
}
</style>
