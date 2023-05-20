import express from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import axios from 'axios'
import type { RequestProps } from './types'
import type { ChatMessage } from './chatgpt'
import { chatConfig, chatReplyProcess, currentModel } from './chatgpt'
import { auth } from './middleware/auth'
import { limiter } from './middleware/limiter'
import { isNotEmptyString } from './utils/is'
import { client } from './redis'
const crypto = require('crypto')
const FormData = require('form-data')
const { executeQuery } = require('./models/database')

const app = express()
const router = express.Router()

app.use(express.static('public'))
app.use(express.json())

app.all('*', (_, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'authorization, Content-Type')
  res.header('Access-Control-Allow-Methods', '*')
  next()
})

const privateKey = 'your_private_key_here'

async function getIpLocation(ip) {
  try {
    const response = await axios.get(`http://ip-api.com/json/${ip}`)
    return `${response.data.country}, ${response.data.city}`
  }
  catch (error) {
    return null
  }
}

function validateEmail(email) {
  const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
  return re.test(String(email).toLowerCase())
}

// Updated sendEmail function to accept access token as parameter
const sendEmail = async (email, code, accessToken) => {
  const sendEmailURL = 'https://qyapi.weixin.qq.com/cgi-bin/exmail/app/compose_send?access_token='
  const response = await axios.post(sendEmailURL + accessToken, {
    to: {
      emails: [email],
    },
    subject: '您的验证码为',
    content: code,
  })

  return response
}

router.post('/verify-email', async (req, res) => {
  try {
    const { email, type } = req.body

    // 验证 email 是否合法
    if (!email || !validateEmail(email))
      throw new Error('Invalid email')

    if (!type) {
      // 检查数据库中是否已经存在该用户
      const [user] = await executeQuery(
        'SELECT * FROM users WHERE email = ?',
        [email],
      )
      if (user)
        throw new Error('用户已经注册')
    }
    else {
      const [user] = await executeQuery(
        'SELECT * FROM users WHERE email = ?',
        [email],
      )
      if (!user)
        throw new Error('用户不存在')
    }

    // 检查是否已经生成了验证码并且还在有效期内
    let code = await client.get(email)
    if (code && !type) {
      // 如果验证码存在，直接返回成功信息
      res.send({ status: 'success', message: '确认邮件已经发送，请稍等再试。' })
      return
    }

    // 如果不存在，生成新的验证码
    code = Math.floor(100000 + Math.random() * 900000).toString() // Generate a random 6-digit number

    // 从 Redis 获取 access token
    let accessToken = await client.get('access_token')
    if (!accessToken) {
      // 如果 Redis 中没有 access token，则发送请求获取新的 access token
      const tokenURL = 'https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=wwbc3ee2aa737a64de&corpsecret=P5zyzGJi0WQuRbMLsj94mQq_0IB7rPt_DHhEUWbqr3M'
      const response = await axios.get(tokenURL)
      accessToken = response.data.access_token

      // 将新的 access token 存储到 Redis，设置过期时间为 7000 秒
      await client.set('access_token', accessToken, 'EX', 7000)
    }

    // 发送验证码邮件
    const response = await sendEmail(email, code, accessToken)
    if (response) {
      // 获取当前时间
      const send_time = new Date()
      // 插入到数据库中
      await executeQuery(
        'INSERT INTO send_email (email, send_time, status) VALUES (?, ?, ?)',
        [email, send_time, response.data.errmsg],
      )
    }

    // 将验证码存储到 Redis，设置过期时间为5分钟
    if (type)
      await client.set(`${email}_token`, code, 'EX', 300)

    else
      await client.set(`${email}_code`, code, 'EX', 300)

    // 返回成功信息
    res.send({ status: 'success', message: '邮件已经发送，请检查您的邮箱' })
  }
  catch (error) {
    res.send({ status: 'fail', message: error.message })
  }
})

router.post('/reset-password', async (req, res) => {
  try {
    const { email, password, emailCode } = req.body

    if (!password || password.length < 6 || !(/[a-zA-Z]/.test(password) && /\d/.test(password)))
      throw new Error('无效的密码')

    const [user] = await executeQuery(
      'SELECT * FROM users WHERE email = ?',
      [email],
    )
    if (!user)
      throw new Error('用户不存在')

    // 验证验证码是否正确
    const storedEmailCode = await client.get(`${email}_token`)
    if (!storedEmailCode || emailCode !== storedEmailCode)
      throw new Error('无效的邮箱验证码')
    client.del(`${email}_token`)

    const saltRounds = 10
    const hash = await bcrypt.hash(password, saltRounds)

    await executeQuery(
      'UPDATE users SET password = ? WHERE email = ?',
      [hash, email],
    )

    // res.send({ status: 'success', message: '密码更改成功，就返回重新登录' })
    // 生成一个新的 token 并将其存储到 Redis 中
    const token = jwt.sign({ email }, privateKey)
    await client.set(email, token, 'EX', 36000, (err, reply) => {
      if (err)
        throw new Error(err)
    })
    // 设置 cookie，有效期为 1 小时
    res.cookie('token', token, { maxAge: 3600 * 10000 })
    res.send({ status: 'success', token })
  }
  catch (error) {
    res.send({ status: 'fail', message: error.message })
  }
})

router.post('/register', async (req, res) => {
  try {
    const { email, password, invitationCode, emailCode } = req.body
    // 验证 email 和 password 是否合法
    if (!email || !password)
      throw new Error('无效的邮箱或者密码')

    // 验证 email 是否合法
    if (!email || !validateEmail(email))
      throw new Error('无效的邮箱')

    // 验证 password 是否合法
    if (!password || password.length < 6 || !(/[a-zA-Z]/.test(password) && /\d/.test(password)))
      throw new Error('无效的密码')

    // 验证验证码是否正确
    const storedEmailCode = await client.get(`${email}_code`)
    if (!storedEmailCode || emailCode !== storedEmailCode)
      throw new Error('无效的邮箱验证码')
    client.del(`${email}_code`)

    if (invitationCode) {
      // 检查邀请码是否存在并且获取推荐人的邮箱
      const [inviter] = await executeQuery(
        'SELECT * FROM users WHERE invitation_code = ?',
        [invitationCode],
      )
      if (!inviter)
        throw new Error('无效的邀请码')

      // 将一级推荐关系存入referrals表
      await executeQuery(
        'INSERT INTO referrals (referrer_email, referred_email, level) VALUES (?, ?, ?)',
        [inviter.email, email, 1],
      )

      // 更新推荐人的membership_times
      await executeQuery(
        'UPDATE users SET membership_times = membership_times + 10 WHERE email = ?',
        [inviter.email],
      )

      // 查找推荐人的推荐人，如果存在且是代理人则将二级推荐关系存入referrals表
      const [inviterReferrer] = await executeQuery(
        'SELECT referrer_email FROM referrals INNER JOIN users ON referrals.referrer_email = users.email WHERE referred_email = ? AND level = 1 AND users.user_type = "agent"',
        [inviter.email],
      )
      if (inviterReferrer) {
        await executeQuery(
          'INSERT INTO referrals (referrer_email, referred_email, level) VALUES (?, ?, ?)',
          [inviterReferrer.referrer_email, email, 2],
        )
      }
    }

    // 检查数据库中是否已经存在该用户
    const [user] = await executeQuery(
      'SELECT * FROM users WHERE email = ?',
      [email],
    )
    if (user)
      throw new Error('用户已经存在')

    // 使用 bcrypt 对密码进行加密
    const saltRounds = 10
    const hash = await bcrypt.hash(password, saltRounds)
    // 将加密后的密码和 email 存入数据库，并且将当前时间作为创建时间
    const created_at = new Date()

    const invitation_hash = crypto.createHash('sha256')
    invitation_hash.update(email)
    const fullHash = invitation_hash.digest('hex')
    const user_invitationCode = fullHash.substring(0, 8)

    const result = await executeQuery(
      'INSERT INTO users (email, password, user_type, created_at, membership_times, invitation_code) VALUES (?, ?, "user", ?, 0, ?)',
      [email, hash, created_at, user_invitationCode],
    )

    // 如果有邀请码，则将邀请码存储到用户表中
    if (invitationCode) {
      // 将邀请码存储到用户表中
      await executeQuery(
        'UPDATE users SET invitation_code = ? WHERE email = ?',
        [invitationCode, email],
      )
    }

    // 返回 token
    const token = jwt.sign({ email }, privateKey, { algorithm: 'HS256' })

    await client.set(email, token, 'EX', 3600, (err, reply) => {
      if (err)
        throw new Error(err)
    })
    res.cookie('token', token, { maxAge: 3600 * 10000 })

    res.send({ status: 'success', token })

    // ... (rest of the code)
  }
  catch (error) {
    res.send({ status: 'fail', message: error.message })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    // 验证 email 和 password 是否合法
    if (!email || !validateEmail(email))
      throw new Error('无效的邮箱')

    if (!password || password.length < 6 || !(/[a-zA-Z]/.test(password) && /\d/.test(password)))
      throw new Error('无效的密码')

    // 检查数据库中是否存在该用户
    const [user] = await executeQuery(
      'SELECT * FROM users WHERE email = ?',
      [email],
    )
    if (!user)
      throw new Error('用户无法找到')

    // 使用 bcrypt 验证密码是否匹配
    const match = await bcrypt.compare(password, user.password)
    if (!match)
      throw new Error('无效的密码')

    client.get(email, async (err, reply) => {
      if (err)
        throw new Error(err)

      if (reply) {
        // 删除 Redis 中的旧 token
        await client.del(email)
      }

      // 生成一个新的 token 并将其存储到 Redis 中
      const token = jwt.sign({ email }, privateKey)
      await client.set(email, token, 'EX', 36000, (err, reply) => {
        if (err)
          throw new Error(err)
      })
      // 设置 cookie，有效期为 1 小时
      res.cookie('token', token, { maxAge: 3600 * 10000 })
      res.send({ status: 'success', token })
    })
  }
  catch (error) {
    res.send({ status: 'fail', message: error.message })
  }
})

router.post('/verify', auth, async (req, res) => {
  try {
    res.status(401).send({ status: 'fail', message: 'Invalid token. Please authenticate.', code: 401 })
  }
  catch (error) {
    res.status(401).send({ status: 'fail', message: 'Invalid token. Please authenticate.', code: 401 })
  }
})

async function getUsersCountByDate(date) {
  const startDate = new Date(date)
  startDate.setHours(0, 0, 0, 0)

  const endDate = new Date(date)
  endDate.setHours(23, 59, 59, 999)

  const [result] = await executeQuery(
    'SELECT COUNT(*) as count FROM users WHERE created_at >= ? AND created_at <= ?',
    [startDate, endDate],
  )
  return result.count
}

router.post('/chat-process', [auth, limiter], async (req, res) => {
  res.setHeader('Content-type', 'application/octet-stream')

  try {
    const { prompt, options = {}, systemMessage, model } = req.body as RequestProps
    let firstChunk = true

    if (prompt === 'ddd') {
      const today = new Date().toISOString().split('T')[0]
      const todayNewUsersCount = await getUsersCountByDate(today)

      const [totalUsers] = await executeQuery('SELECT COUNT(*) as count FROM users')
      const totalUsersCount = totalUsers.count

      const [todaySearches] = await executeQuery(
        'SELECT COUNT(*) as count FROM search_history WHERE DATE(search_time) = ?',
        [today],
      )
      const todaySearchesCount = todaySearches.count

      const yesterday = new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().split('T')[0]
      const yesterdayNewUsersCount = await getUsersCountByDate(yesterday)

      const [totalSearches] = await executeQuery('SELECT COUNT(*) as count FROM search_history')
      const totalSearchesCount = totalSearches.count

      const topUsers = await executeQuery(
        'SELECT user_email, COUNT(*) as search_count FROM search_history GROUP BY user_email ORDER BY search_count DESC LIMIT 3',
      )

      let topUsersMessage = 'Top 3 users with highest search counts:\n'
      topUsers.forEach((user, index) => {
        topUsersMessage += `${index + 1}. ${user.user_email} - ${user.search_count} searches\n`
      })

      const statisticsMessage = `Today's new users: ${todayNewUsersCount}\nYesterday's new users: ${yesterdayNewUsersCount}\nTotal users: ${totalUsersCount}\nToday's user searches: ${todaySearchesCount}\nTotal user searches: ${totalSearchesCount}\n ${topUsersMessage}`
      const customChatMessage: ChatMessage = {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        role: 'analysis',
        text: statisticsMessage,
      }

      res.write(JSON.stringify(customChatMessage))
      res.end()
      return
    }

    // 存储用户搜索记录
    const authorizationHeader = req.header('Authorization')
    const token = authorizationHeader.replace('Bearer ', '')
    const decodedToken = jwt.verify(token, privateKey)
    const userEmail = decodedToken.email

    if (model === 'gpt-4') {
      const today = new Date()
      const [user] = await executeQuery(
        'SELECT * FROM users WHERE email = ?',
        [userEmail],
      )

      if (!user)
        throw new Error('用户不存在')

      if (user.membership_start <= today && user.membership_end >= today) {
        // 用户在会员有效期内，可以使用gpt-4
      }
      else if (user.membership_times > 0) {
        // 用户不在会员有效期内，但是有membership_times的额度，消耗一个membership_times
        await executeQuery(
          'UPDATE users SET membership_times = membership_times - 1 WHERE email = ?',
          [userEmail],
        )
      }
      else {
        // 用户不在会员有效期内，并且没有membership_times的额度
        const customChatMessage: ChatMessage = {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          role: '',
          text: '很抱歉，您还没有开通GPT4.0的使用权限，请在左侧联系客服',
        }

        res.write(JSON.stringify(customChatMessage))
        res.end()
        return
      }
    }

    const curModel = model || 'gpt-3.5'
    if (userEmail && prompt) {
      const truncatedPrompt = prompt.slice(0, 255)
      await executeQuery(
        'INSERT INTO search_history (user_email, keyword, model) VALUES (?, ?, ?)',
        [userEmail, truncatedPrompt, curModel],
      )

      // 获取用户IP地址和归属地
      // 注意：在实际环境中，你可能需要使用其他方式来获取真实的用户IP和归属地，因为req.ip可能会被代理服务器修改
      const lastUsedIP = req.ip
      const lastUsedIPFrom = await getIpLocation(lastUsedIP) // 使用你选择的IP归属地查询服务

      // 获取当前时间
      const lastUsedTime = new Date()

      // 更新数据库
      await executeQuery(
        'UPDATE users SET lastUsedIP = ?, lastUsedIPFrom = ?, lastUsedTime = ? WHERE email = ?',
        [lastUsedIP, lastUsedIPFrom, lastUsedTime, userEmail],
      )
    }

    await chatReplyProcess({
      message: prompt,
      lastContext: options,
      process: (chat: ChatMessage) => {
        res.write(firstChunk ? JSON.stringify(chat) : `\n${JSON.stringify(chat)}`)
        firstChunk = false
      },
      systemMessage,
      model: model === 'gpt-4' ? 'gpt-4' : '', // Add model parameter here
    })
  }
  catch (error) {
    res.write(JSON.stringify(error))
  }
  finally {
    res.end()
  }
})

router.post('/user-info', auth, async (req, res) => {
  try {
    // 从JWT中获取用户电子邮件
    const authorizationHeader = req.header('Authorization')
    const token = authorizationHeader.replace('Bearer ', '')
    const decodedToken = jwt.verify(token, privateKey)
    const userEmail = decodedToken.email

    // 查询用户信息
    const [user] = await executeQuery(
      'SELECT email, invitation_code, membership_end, membership_times FROM users WHERE email = ?',
      [userEmail],
    )

    if (!user) {
      return res.status(404).json({
        message: '用户不存在',
      })
    }

    // 从数据库查询结果中提取用户信息
    const userInfo = {
      email: user.email,
      invitation_code: user.invitation_code,
      membership_end: user.membership_end,
      membership_times: user.membership_times,
    }

    // 发送用户信息
    res.send({ status: 'Success', message: '', data: { userInfo } })
  }
  catch (error) {
    res.status(500).json({
      message: '服务器错误',
      error: error.message,
    })
  }
})

router.post('/config', async (req, res) => {
  try {
    const response = await chatConfig()
    res.send(response)
  }
  catch (error) {
    res.send(error)
  }
})

router.post('/session', async (req, res) => {
  try {
    const AUTH_SECRET_KEY = process.env.AUTH_SECRET_KEY
    const hasAuth = isNotEmptyString(AUTH_SECRET_KEY)
    res.send({ status: 'Success', message: '', data: { auth: hasAuth, model: currentModel() } })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

function createSign(params, key) {
  // Step 1: Sort the parameters by key
  const sortedParams = Object.keys(params).sort().reduce((result, key) => {
    if (params[key]) { // Exclude the empty parameters
      result[key] = params[key]
    }
    return result
  }, {})

  // Step 2: Join the parameters into a string with '&' between them
  let paramString = ''
  for (const key in sortedParams) {
    if (key !== 'sign' && key !== 'sign_type')
      paramString += `${key}=${sortedParams[key]}&`
  }

  // Remove the trailing '&'
  paramString = paramString.slice(0, -1)
  // Step 3: Append the secret key and generate the md5 hash
  paramString += key
  const md5 = crypto.createHash('md5')
  return md5.update(paramString).digest('hex')
}

router.post('/initiate-payment', auth, async (req, res) => {
  const authorizationHeader = req.header('Authorization')
  const token = authorizationHeader.replace('Bearer ', '')
  const decodedToken = jwt.verify(token, privateKey)
  const userEmail = decodedToken.email
  try {
    const pid = '20230504230028'
    const key = '63a7PDalwyvJpEZLKRY9lv7z2BYIJruq'
    const apiurl = 'https://7-pay.cn/mapi.php'
    const type = 'wxpay'
    const notify_url = 'http://www.aiworlds.cc:3002/notify'
    const return_url = 'http://www.yourwebsite.com/return'
    const out_trade_no = Date.now().toString()
    const name = 'Chagpt4-单月会员'
    const money = '30'
    const param = ''
    const params = {
      pid,
      type,
      notify_url,
      return_url,
      out_trade_no,
      name,
      money,
      param,
      sign_type: 'MD5', // Add sign_type parameter
    }

    await executeQuery('INSERT INTO orders (order_no, pid, payment_type, product_name, amount, status, user_email) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      out_trade_no,
      pid,
      type,
      name,
      money,
      'pending',
      userEmail,
    ])

    const sign = createSign(params, key)

    const formData = new FormData()
    Object.keys(params).forEach(key => formData.append(key, params[key]))
    formData.append('sign', sign)

    const response = await axios({
      method: 'post',
      url: `${apiurl}?act=order`,
      data: formData,
    })

    // handle the response
    if (response.data.code === '1')
      res.send({ status: 'Success', message: '', data: response.data })

    else throw new Error(response.data.msg)
  }
  catch (error) {
    res.status(500).json({
      message: '服务器错误',
      error: error.message,
    })
  }
})

router.get('/notify', async (req, res) => {
  try {
    const { pid, name, money, out_trade_no, trade_no, param, trade_status, type, sign, sign_type } = req.query

    // 在这里进行签名验证，确保这是来自支付服务商的通知
    // 如果签名不匹配，应该抛出错误或直接返回错误响应

    // 找到对应的订单记录
    const [order] = await executeQuery(
      'SELECT * FROM orders WHERE order_no = ?',
      [out_trade_no],
    )

    if (!order) {
      return res.status(404).json({
        message: '订单不存在',
      })
    }

    // 判断支付状态
    if (trade_status === 'TRADE_SUCCESS') {
      // 如果支付成功，更新订单状态
      await executeQuery(
        'UPDATE orders SET status = ? WHERE order_no = ?',
        ['paid', out_trade_no],
      )

      // Get the current user's membership end date
      const [user] = await executeQuery(
        'SELECT membership_end FROM users WHERE email = ?',
        [order.user_email],
      )

      let membershipEnd
      // If the user's membership has already expired, add one month from now
      if (user.membership_end < new Date()) {
        membershipEnd = new Date()
        membershipEnd.setMonth(membershipEnd.getMonth() + 1)
      }
      // If the user's membership has not expired yet, add one month to the current end date
      else {
        membershipEnd = new Date(user.membership_end)
        membershipEnd.setMonth(membershipEnd.getMonth() + 1)
      }

      // Update the user's membership end date
      await executeQuery(
        'UPDATE users SET membership_end = ? WHERE email = ?',
        [membershipEnd, order.user_email],
      )

      // 这里可以添加其他逻辑，如给用户发送支付成功的通知等
    }
    else {
      // 如果支付失败，也可以进行相应的操作
    }
    res.sendStatus(200)
  }
  catch (error) {
    res.status(500).json({
      message: '服务器错误',
      error: error.message,
    })
  }
})

app.use('', router)
app.use('/api', router)
app.set('trust proxy', 1)

app.listen(3002, () => globalThis.console.log('Server is running on port 3002'))
