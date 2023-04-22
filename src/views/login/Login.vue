<script lang="ts" setup>
import { reactive, ref } from 'vue'
import { NButton, NInput } from 'naive-ui'
// import {regi}
import axios from '@/utils/request/axios'
import { router } from '@/router'
const loginForm = reactive({
  email: '',
  password: '',
  invitationCode: '',
})

const loginStatus = ref(true)

function submitLogin() {
  console.log('登录信息：', loginForm)
  if (loginStatus.value) {
    axios.post('/login', {
      email: loginForm.email,
      password: loginForm.password,
    })
      .then((response) => {
        // 登录成功，保存 token
        if (response.data.status === 'success') {
          console.log(response.data.status)
          const token = response.data.token
          localStorage.setItem('token', token)
          // 跳转到主页
          console.log(222)
          router.push('/chat')
        }
        else {
          alert(response.data.message)
        }
      })
      .catch((error) => {
        // 登录失败，提示错误信息
        console.error(error)
      })
  }
  else {
    axios.post('/register', {
      email: loginForm.email,
      password: loginForm.password,
      invitationCode: loginForm.invitationCode ? loginForm.invitationCode : undefined,
    })
      .then((response) => {
        if (response.data.status === 'success') {
          // 登录成功，保存 token
          const token = response.data.token
          localStorage.setItem('token', token)
          // 跳转到主页
          router.push('/chat')
        }
        else {
          alert(response.data.message)
        }
      })
      .catch((error) => {
        // 登录失败，提示错误信息
        console.error(error)
      })
  }
}

function validateEmail(email: string) {
  const emailRegex = /^\w+([-+.]\w+)*@\w+([-.]\w+)*\.\w+([-.]\w+)*$/
  return emailRegex.test(email)
}

function handleLogin() {
  if (!validateEmail(loginForm.email)) {
    console.log(loginForm.email)
    alert('请输入有效的邮箱地址')
    return
  }
  submitLogin()
}
</script>

<template>
  <div class="bgc">
    <div class="login-container">
      <div class="title">
        OpenAI-chatgpt
      </div>
      <div class="input-group">
        <label>邮箱：</label>
        <NInput v-model:value="loginForm.email" type="text" style="width: 200px" />
      </div>
      <div class="input-group">
        <label>密码：</label>
        <NInput
          v-model:value="loginForm.password"
          type="password"
          show-password-on="mousedown"
          placeholder="密码"
          :maxlength="8"
          style="width: 200px"
        />
      </div>
      <div v-show="!loginStatus" class="input-group">
        <label>邀请码：</label>
        <NInput
          v-model:value="loginForm.invitationCode"
          type="password"
          show-password-on="mousedown"
          placeholder="如果有的话"
          :maxlength="8"
          style="width: 200px"
        />
      </div>
      <div class="btn">
        <NButton v-if="loginStatus" type="success" :disabled="!loginForm.email && !loginForm.password" @click="handleLogin">
          登录
        </NButton>
        <NButton
          v-else
          type="success"
          :disabled="!loginForm.email && !loginForm.password"
          @click="handleLogin"
        >
          注册
        </NButton>
        <NButton v-if="loginStatus" style="margin-left: auto;color: white" @click="loginStatus = false">
          我要去注册
        </NButton>
        <NButton v-else style="margin-left: auto;color: white" @click="loginStatus = true">
          我要去登录
        </NButton>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.bgc{
	background: no-repeat center center /100% url("../../assets/bg.png");
	background-size: cover;
	opacity: 1;
	width: 100%;
	height: 100%;
}
.login-container {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	position: absolute;
	top: 50%;
	left: 50%;
	width: 400px;
	height: 400px;
	margin-left: -200px;
	margin-top: -200px;
	padding: 10px;
	border-radius: 50px;
	background-color: #4b9e5f;
.title{
	color: white;
	font-size: 22px;
	margin-bottom: 25px;
}
}

.input-group {
	margin-bottom: 1rem; display: flex;height: 40px;line-height: 40px;
label{color: white}
}
.btn{
	width: 100%;
	display: flex;
	align-content: space-between;
	margin-top: 20px;
}

#input{
	width: 200px;
}

label {
display: inline-block;width: 80px;
}

button {cursor: pointer;}

@media (max-width: 500px) {
	.bgc {
		background: no-repeat center/100% url("../../assets/bg_mobile.png");
		.login-container {
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			position: absolute;
			top: 50%;
			left: 50%;
			width: 350px;
			height: 350px;
			margin-left: -175px;
			margin-top: -175px;
			padding: 10px;
			border-radius: 50px;
			background-color: #4b9e5f;
			.title{
				color: white;
				font-size: 22px;
				margin-bottom: 25px;
			}
		}
	}
}
</style>
