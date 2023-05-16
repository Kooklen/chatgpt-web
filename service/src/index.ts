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
    console.error(error)
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

    // 如果有邀请码，则检查邀请码是否合法
    if (invitationCode) {
      const [invitation] = await executeQuery(
        'SELECT * FROM invitation_codes WHERE code = ?',
        [invitationCode],
      )
      if (!invitation)
        throw new Error('无效的邀请码')
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
    const result = await executeQuery(
      'INSERT INTO users (email, password, created_at) VALUES (?, ?, ?)',
      [email, hash, created_at],
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
        'SELECT * FROM users WHERE email = ? AND membership_start <= ? AND membership_end >= ?',
        [userEmail, today, today],
      )
      if (!user) {
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

app.use('', router)
app.use('/api', router)
app.set('trust proxy', 1)

app.listen(3002, () => globalThis.console.log('Server is running on port 3002'))
