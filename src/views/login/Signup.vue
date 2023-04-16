<script lang="ts" setup>
import { reactive, ref } from 'vue'
import type {
  FormItemRule,
  FormRules,
} from 'naive-ui'
const loginForm = reactive({
  username: '',
  password: '',
})

const readySignUp = ref(false)

const modelRef = ref({
  age: null,
  password: null,
  reenteredPassword: null,
})
function validatePasswordStartWith(
  rule: FormItemRule,
  value: string,
): boolean {
  return (
    !!modelRef.value.password
		&& modelRef.value.password.startsWith(value)
		&& modelRef.value.password.length >= value.length
  )
}
function validatePasswordSame(rule: FormItemRule, value: string): boolean {
  return value === modelRef.value.password
}
const rules: FormRules = {
  age: [
    {
      required: true,
      validator(rule: FormItemRule, value: string) {
        if (!value)
          return new Error('需要年龄')
				 else if (!/^\d*$/.test(value))
          return new Error('年龄应该为整数')
				 else if (Number(value) < 18)
          return new Error('年龄应该超过十八岁')

        return true
      },
      trigger: ['input', 'blur'],
    },
  ],
  password: [
    {
      required: true,
      message: '请输入密码',
    },
  ],
  reenteredPassword: [
    {
      required: true,
      message: '请再次输入密码',
      trigger: ['input', 'blur'],
    },
    {
      validator: validatePasswordStartWith,
      message: '两次密码输入不一致',
      trigger: 'input',
    },
    {
      validator: validatePasswordSame,
      message: '两次密码输入不一致',
      trigger: ['blur', 'password-input'],
    },
  ],
}

function submitLogin() {
  console.log('登录信息：', loginForm)
  // 在这里添加登录 API 调用以进行身份验证
}
</script>

<template>
  <div class="bgc">
    <div class="login-container">
      <n-form ref="formRef" :model="model" :rules="rules">
        <n-form-item path="age" label="年龄">
          <n-input v-model:value="model.age" @keydown.enter.prevent />
        </n-form-item>
        <n-form-item path="password" label="密码">
          <n-input
            v-model:value="model.password"
            type="password"
            @input="handlePasswordInput"
            @keydown.enter.prevent
          />
        </n-form-item>
        <n-form-item
          ref="rPasswordFormItemRef"
          first
          path="reenteredPassword"
          label="重复密码"
        >
          <n-input
            v-model:value="model.reenteredPassword"
            :disabled="!model.password"
            type="password"
            @keydown.enter.prevent
          />
        </n-form-item>
        <n-row :gutter="[0, 24]">
          <n-col :span="24">
            <div style="display: flex; justify-content: flex-end">
              <n-button
                :disabled="model.age === null"
                round
                type="primary"
                @click="handleValidateButtonClick"
              >
                验证
              </n-button>
            </div>
          </n-col>
        </n-row>
      </n-form>
      <!--      <div class="input-group"> -->
      <!--        <label>邮箱：</label> -->
      <!--        <NInput v-model="loginForm.username" type="text" style="width: 200px" /> -->
      <!--      </div> -->
      <!--      <div class="input-group"> -->
      <!--        <label>手机号：</label> -->
      <!--        <NInput v-model="loginForm.username" type="text" style="width: 200px" /> -->
      <!--      </div> -->
      <!--      <div class="input-group"> -->
      <!--        <label>密码：</label> -->
      <!--        <NInput -->
      <!--          v-model="loginForm.password" type="password" -->
      <!--          show-password-on="mousedown" -->
      <!--          placeholder="密码" -->
      <!--          :maxlength="8" style="width: 200px" -->
      <!--        /> -->
      <!--      </div> -->
      <!--      <div class="input-group"> -->
      <!--        <label>邀请码：</label> -->
      <!--        <NInput v-model="loginForm.username" type="text" style="width: 200px" /> -->
      <!--      </div> -->
      <!--      <NButton type="success" :disabled="readySignUp"> -->
      <!--        注册账号 -->
      <!--      </NButton> -->
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
