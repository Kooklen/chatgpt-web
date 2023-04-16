<script lang="ts" setup>
import { reactive } from 'vue'
import { NButton, NInput } from 'naive-ui'
const loginForm = reactive({
  username: '',
  password: '',
})

function submitLogin() {
  console.log('登录信息：', loginForm)
  // 在这里添加登录 API 调用以进行身份验证
}
</script>

<template>
	<div class="bgc">
  <div class="login-container">
    <div class="input-group">
      <label>用户名：</label>
      <NInput v-model="loginForm.username" type="text" style="width: 200px" />
    </div>
    <div class="input-group">
      <label>密码：</label>
      <NInput
        v-model="loginForm.password" type="password"
        show-password-on="mousedown"
        placeholder="密码"
        :maxlength="8" style="width: 200px"
      />
    </div>
    <NButton type="success">
      登录
    </NButton>
  </div>
	</div>
</template>

<style scoped lang="less">
.bgc{
	background-color: #4b9e5f;
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
	width: 300px;
	height: 300px;
	margin-left: -150px;
	margin-top: -150px;
;
}

.input-group {margin-bottom: 1rem; display: flex;height: 40px;line-height: 40px}

#input{
	width: 200px;
}

label {
display: inline-block;width: 80px;
}

button {cursor: pointer;}
</style>
