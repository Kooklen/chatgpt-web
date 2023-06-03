<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue'
import type { FormInst, FormItemInst, FormItemRule, FormRules } from 'naive-ui'
import { NButton, NForm, NFormItem, NInput, NInputGroup, useNotification } from 'naive-ui'
import { useRoute } from 'vue-router'
import axios from '@/utils/request/axios'
import { debounce } from '@/utils/functions/debounce'
const notification = useNotification()
const hasInvitationCode = ref(false)
const findPwd = ref(false)
const loginForm = reactive({
  phone: '',
  email: '',
  password: '',
  invitationCode: '',
  emailCode: '',
  phoneCode: '',
  account: '',
})
const route = useRoute()
const loginStatus = ref(true)
const isSubmitting = ref(false)
onMounted(() => {
  if (route.params.invitationCode) {
    // @ts-expect-error
    loginForm.invitationCode = route.params.invitationCode
    loginStatus.value = false
    hasInvitationCode.value = true
  }
})

localStorage.removeItem('token')

const isReadyLogin = computed(
  () => loginForm.account && loginForm.password.length >= 6,
)

const debouncedHandleLogin = debounce(handleLogin, 0)

function submitLogin() {
  if (loginStatus.value) {
    let loginPayload = {}
    if (/^\d{11}$/.test(loginForm.account)) { // 如果是手机号
      loginPayload = {
        phone: loginForm.account,
        password: loginForm.password,
      }
    }
    else { // 否则视为邮箱
      loginPayload = {
        email: loginForm.account,
        password: loginForm.password,
      }
    }
    axios.post('/login', {
      ...loginPayload,
    })
      .then((response) => {
        // 登录成功，保存 token
        if (response.data.status === 'success') {
          const token = response.data.token
          localStorage.setItem('token', token)
          window.location.href = '#/chat'
          newInfor()
        }
        else {
          notification.error({
            content: response.data.message === 'Invalid password' ? '无效的账号或者密码' : response.data.message,
            duration: 5000,
          })
          isSubmitting.value = false
        }
      })
      .catch((error) => {
        // 登录失败，提示错误信息
        console.error(error)
      })
  }
  else {
    axios.post('/register', {
      phone: loginForm.phone,
      password: loginForm.password,
      invitationCode: loginForm.invitationCode ? loginForm.invitationCode : undefined,
    	phoneCode: loginForm.phoneCode.trim(),
    })
      .then((response) => {
        if (response.data.status === 'success') {
          newInfor()
          const token = response.data.token
          localStorage.setItem('token', token)
          // 跳转到主页
          window.location.href = '#/chat'
        }
        else {
          notification.error({
            content: response.data.message === 'User already exists' ? '用户已经注册' : response.data.message,
            duration: 5000,
          })
          isSubmitting.value = false
        }
      })
      .catch((error) => {
        // 登录失败，提示错误信息
        console.error(error)
      })
  }
}

const countdown = ref(60)
const isLoading = ref(false) // 新的状态变量
let timerId: any = null

function startCountdown() {
  countdown.value = 60
  timerId = setInterval(() => {
    if (countdown.value > 0) {
      countdown.value--
    }
    else {
      isLoading.value = false
      clearInterval(timerId)
      countdown.value = 60
    }
  }, 1000)
}

function newInfor() {
  notification.success({
    content: loginStatus.value ? '登录成功' : '注册成功',
    duration: 3000,
  })
  notification.success({
    content: '六一儿童节快乐！AIworlds 1.0上线, 左侧邀请新用户就可以获得体验次数以及更多福利！详情请见左侧菜单栏',
    duration: 10000,
  })
}

function getPhoneCode() {
  const phone = loginForm.phone
  const type = findPwd.value ? 'findPwd' : ''
  isLoading.value = true

  axios.post('/verify-phone', { phone, type })
    .then((response) => {
      if (response.data.status === 'success') {
        // 验证码短信发送成功，显示成功信息
        notification.success({
          content: response.data.message,
          duration: 5000,
        })
        startCountdown()
      }
      else {
        // 发生错误，显示错误信息
        notification.error({
          content: response.data.message,
          duration: 5000,
        })
        isLoading.value = false
        countdown.value = 60
        clearInterval(timerId) // 发生错误，清除计时器
      }
    })
    .catch((error) => {
      isLoading.value = false
      countdown.value = 60
      clearInterval(timerId) // 发生错误，清除计时器

      // 发生错误，显示错误信息
      notification.error({
        content: 'An error occurred while sending the verification message to the phone.',
        duration: 5000,
      })
    })
}

function resetPwd() {
  isLoading.value = true

  axios.post('/reset-password', {
    phone: loginForm.phone,
    password: loginForm.password,
    phoneCode: loginForm.phoneCode,
  })
    .then((response) => {
      if (response.data.status === 'success') {
        const token = response.data.token
        localStorage.setItem('token', token)
        window.location.href = '#/chat'
        newInfor()
      }
      else {
        notification.error({
          content: response.data.message,
          duration: 5000,
        })
        isLoading.value = false
      }
    })
    .catch((error) => {
      isLoading.value = false
      // 发生错误，显示错误信息
      notification.error({
        content: 'An error occurred while sending the verification email.',
        duration: 5000,
      })
    })
}

function handleLogin() {
  isSubmitting.value = true
  submitLogin()
}

interface ModelType {
  age: string | null
  password: string | null
  reenteredPassword: string | null
}
const formRef = ref<FormInst | null>(null)
const rPasswordFormItemRef = ref<FormItemInst | null>(null)
const modelRef = ref<ModelType>({
  age: null,
  password: null,
  reenteredPassword: null,
})
const rules: FormRules = {
  account: [
    {
      required: true,
      validator(rule: FormItemRule, value: string) {
        if (!value)
          return new Error('需要邮箱或电话号码')
        else if (!(/^\w+([-+.]\w+)*@\w+([-.]\w+)*\.\w+([-.]\w+)*$/.test(value)
					|| /^\d{11}$/.test(value)))
          return new Error('请输入有效的邮箱地址或11位电话号码')

        return true
      },
      trigger: ['input', 'blur'],
    },
  ],
  password: [
    {
      required: true,
      message: '请输入密码',
      trigger: ['input', 'blur'],
    },
    {
      validator(rule: FormItemRule, value: string) {
        if (value.length < 6)
          return new Error('密码至少需要6位')
				 else if (!(/[a-zA-Z]/.test(value) && /\d/.test(value)))
          return new Error('密码必须包含英文和数字的组合')

        return true
      },
      trigger: ['input', 'blur'],
    },
  ],
  invitationCode: [
    {
      validator(rule: FormItemRule, value: string) {
        if (value && value.length !== 8)
          return new Error('邀请码需要为8位')
				 // else if (value && !/^\d{6}$/.test(value))
        //  return new Error('邀请码必须是6位数字')

        return true
      },
      trigger: ['input', 'blur'],
    },
  ],
  phoneCode: [
    {
      required: true,
      validator(rule: FormItemRule, value: string) {
        if (value && value.length !== 6)
          return new Error('手机验证码需要为6位数字')
        else if (value && !/^\d{6}$/.test(value))
          return new Error('手机验证码必须是6位数字')

        return true
      },
      trigger: ['input', 'blur'],
    },
  ],

}
function handlePasswordInput() {
  if (modelRef.value.reenteredPassword)
    rPasswordFormItemRef.value?.validate({ trigger: 'password-input' })
}
</script>

<template>
  <div class="bgc">
    <div class="login-bgc">
      <div class="play-gpt" />
      <div class="bgc-container" />
    </div>
    <div class="login-container">
      <div class="small-bgc" />
      <div class="logo">
        <div class="logo-pic" />
        <div class="logo-word" />
      </div>
      <div class="small-logo">
        <div class="logo-pic" />
        <div class="logo-word">
          登录到ChatGPT Bolt
        </div>
      </div>

      <div class="input-group">
        <NForm ref="formRef" :model="loginForm" :rules="rules">
          <NFormItem v-if="loginStatus && !findPwd" path="account" label="邮箱/手机号">
            <NInput v-model:value="loginForm.account" size="large" @keydown.enter.prevent />
          </NFormItem>

          <NFormItem v-else path="phone" label="手机号">
            <NInput v-model:value="loginForm.phone" size="large" @keydown.enter.prevent />
          </NFormItem>
          <NFormItem path="password" label="密码">
            <NInput
              v-model:value="loginForm.password"
              type="password"
              show-password-on="mousedown"
              size="large"
              @input="handlePasswordInput"
              @keydown.enter.prevent
            />
          </NFormItem>
					<NFormItem v-if="!loginStatus || findPwd" path="phoneCode" label="手机验证码">
						<NInputGroup>
							<NInput
								v-model:value="loginForm.phoneCode"
								size="large"
								max-length="6"
								@keydown.enter.prevent
							/>
							<NButton
								v-if="!loginStatus || findPwd"
								class="get-code"
								:disabled="isLoading"
								style="height: 40px;border-left: none"
								@click="getPhoneCode"
							>
								{{ countdown < 60 ? `${countdown}秒后重新获取` : '获取验证码' }}
							</NButton>
						</NInputGroup>
					</NFormItem>
          <NFormItem v-if="!loginStatus && !findPwd" path="invitationCode" label="邀请码">
            <NInput
              v-model:value="loginForm.invitationCode"
              placeholder="邀请码（可选）"
              size="large"
              :disabled="hasInvitationCode"
              @keydown.enter.prevent
            />
          </NFormItem>
        </NForm>
      </div>

      <div class="btn">
        <NButton
          v-if="loginStatus && !findPwd" :disabled="isSubmitting || !isReadyLogin" :loading="isSubmitting"
          class="submit" :class="{ 'submit-disabed': isSubmitting }" @click="debouncedHandleLogin"
        >
          登录
        </NButton>

        <NButton
          v-if="findPwd"
          class="submit"
          @click="resetPwd"
        >
          重设密码并登录
        </NButton>

        <NButton
          v-if="!loginStatus && !findPwd"
          class="submit"
          :loading="isSubmitting"
          :class="{ 'submit-disabed': isSubmitting }"
          @click="debouncedHandleLogin"
        >
          注册
        </NButton>

        <div v-if="loginStatus && !findPwd" class="register">
          <span class="no-account">还没有账号？</span>
          <span class="go-to-r" @click="loginStatus = false">马上注册</span>
        </div>

        <div v-if="!loginStatus && !findPwd" class="register">
          <span class="no-account">已经有账号？</span>
          <span class="go-to-r" @click="loginStatus = true">马上登录</span>
        </div>
        <div v-if="!findPwd" class="register find-pwd" @click="findPwd = true">
          找回密码
        </div>
        <div v-else class="find-pwd" @click="findPwd = false">
          返回登录
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.bgc{
	display: flex;
	background: white;
	opacity: 1;
	width: 100%;
	height: 100%;
}
.login-bgc{
	position: relative;
	width: 683px;
	.play-gpt{
		position: absolute;
		bottom: 20%;
		left: 50%;
		margin-left: -163.25px;
		margin-top: -30px;
		width: 326.49px;
		height: 65.5px;
		background: no-repeat center center /100% url("../../assets/playgpt.png");
	}
	.bgc-container{
		position: absolute;
		top: 45%;
		left: 50%;
		margin-top: -210px;
		margin-left: -341.5px;
		min-width: 683px;
		height: 420px;
		background: no-repeat center center /100% url("../../assets/bg-pic.png");
	}
	width: 70vw;
	height: 100%;
	background: linear-gradient(246deg, #D7ECFF 0%, rgba(255,255,255,0.94) 100%);
	opacity: 1;
}
.login-container {
	width: 30vw;
	min-width: 335px;
	height: 100%;
	overflow-y: auto;
	background-color: #fff;
	.logo{
		margin-top: 8vh;
		.logo-pic{
			z-index: 20;
			width: 8vw;
			height: 18vh;
			margin: 0 auto;
			background: no-repeat center center /100% url("../../assets/logo.png");
		}
		.logo-word{
			margin: 0 auto;
			margin-top: 14px;
			width: 250px;
			height: 48px;
			background: no-repeat center center /100% url("../../assets/logo-word.png");
			white-space: nowrap;
			border-right: 2px solid transparent;
			animation: typing 1s steps(15, end), blink-caret .75s step-end infinite;
			overflow: hidden;
			@keyframes typing {
				from { width: 0; }
				to { width: 250px; }
			}
			/* 光标闪啊闪 */
			@keyframes blink-caret {
				from, to { box-shadow: 1px 0 0 0 transparent; }
				50% { box-shadow: 1px 0 0 0 transparent; }
			}
		}
	}
	.small-logo{
		display: none;
	}
	.input-group{
		width: 70%;
		margin: 0 auto;
		margin-top: 49px;
		NInput{
			height: 60px;
		}
	}

	.btn{
		width: 70%;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		margin-top: 10px;
		.submit{
			width: 100%;
			background: linear-gradient(43deg, #51A2FF 0%, #3D86FF 100%);
			box-shadow: 0px 4px 4px 0px rgba(67,142,255,0.25);
			color: #FEFEFE;;
			&:hover{
				color: white;
			}
		}
		.get-code{
			background: linear-gradient(180deg, #FFFFFF 0%, #F6F6F6 100%);
			//margin-bottom: 20px;
		}
		.register{
			margin-top: 22px;
			height: 26px;
			width: 100%;
			text-align: center;
			.no-account{
				width: 185px;
				height: 26px;
				font-weight: 400;
				color: #737373;
				line-height: 25px;
			}
			.go-to-r{
				cursor: pointer;
				color: rgb(66, 173, 255);
			}
		}
		.find-pwd{
			width: 100%;
			text-align: center;
			margin-top: 10px;
			cursor: pointer;
			font-size: 12px;
			color: #737373;
		}
	}
}

@media (max-width: 1024px) {
	.login-bgc{
		width: 0;
		overflow: hidden;
}
	.login-container{
		position: relative;
		width: 100%;
		.small-bgc{
			position: absolute;
			top: 20px;
			right: 20px;
			background: no-repeat center center /100% url("../../assets/small-bgc.png");
			width: 40vw;
			height: 125px;
		}
	}

	.logo{
		display: none;
	}

	.small-logo{
		display: block!important;
		width: 70%;
		margin: 0 auto;
		margin-top: 80px;
		height: 180px;
		.logo-pic{
			margin: 0 auto;
			width: 80px;
			height: 80px;
			background: no-repeat center center /100% url("../../assets/small-logo.png");
		}
		.logo-word{
			margin: 0 auto;
			margin-top: 14px;
			height: 40px;
			line-height: 40px;
			width: 250px;
			font-size: 26px;
			font-weight: 400;
			background: linear-gradient(180deg, #6EBBFF 0%, #0A64FF 100%);
			-webkit-background-clip: text;
			-webkit-text-fill-color: transparent;
			white-space: nowrap;
			border-right: 2px solid transparent;
			animation: typing 1.5s steps(15, end), blink-caret .75s step-end infinite;
			overflow: hidden;
			/* 打印效果 */
			@keyframes typing {
				from { width: 0; }
				to { width: 250px; }
			}
			/* 光标闪啊闪 */
			@keyframes blink-caret {
				from, to { box-shadow: 1px 0 0 0 transparent; }
				50% { box-shadow: 1px 0 0 0 transparent; }
			}
		}
	}
	.input-group{
		margin-top: 0!important;
	}
}
//.submit-disabed{
//	background-color: white!important;
//}
</style>
