import express from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import Redis from 'ioredis'
import type { RequestProps } from './types'
import type { ChatMessage } from './chatgpt'
import { chatConfig, chatReplyProcess, currentModel } from './chatgpt'
import { auth } from './middleware/auth'
import { limiter } from './middleware/limiter'
import { isNotEmptyString } from './utils/is'
// const redis = require('redis')
const { executeQuery } = require('./models/database')
const client = new Redis({
  host: 'localhost', // Redis server address
  port: 6379, // Redis server port number
  // password: 'your_redis_password', // Redis server password
})

client.on('connect', () => {
  console.log('Redis client connected')
})

client.on('error', (err) => {
  console.error('Redis client error:', err)
})

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

// 注册接口
router.post('/register', async (req, res) => {
  try {
    const { email, password, invitationCode } = req.body
    // 验证 email 和 password 是否合法
    if (!email || !password)
      throw new Error('Invalid email or password')

    // Check invitation code first
    if (invitationCode) {
      const [invitation] = await executeQuery(
        'SELECT * FROM invitation_codes WHERE code = ?',
        [invitationCode],
      )
      if (!invitation)
        throw new Error('Invalid invitation code')
    }
    else {
      throw new Error('Invitation code is required')
    }

    // 检查数据库中是否已经存在该用户
    const [user] = await executeQuery(
      'SELECT * FROM users WHERE email = ?',
      [email],
    )
    if (user)
      throw new Error('User already exists')

    // ... (rest of the code)
  }
  catch (error) {
    res.send({ status: 'fail', message: error.message })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    console.log(req.body)
    // 验证 email 和 password 是否合法
    if (!email || !password)
      throw new Error('Invalid email or password')

    // 检查数据库中是否存在该用户
    const [user] = await executeQuery(
      'SELECT * FROM users WHERE email = ?',
      [email],
    )
    console.log(user)
    if (!user)
      throw new Error('User not found')

    // 使用 bcrypt 验证密码是否匹配
    const match = await bcrypt.compare(password, user.password)
    if (!match)
      throw new Error('Invalid password')

    // 检查 Redis 中是否存在该用户的 token
    client.get(email, async (err, reply) => {
      if (err)
        throw new Error(err)

      if (reply) {
        console.log(`Token exists for user ${email}: ${reply}`)
        res.cookie('token', reply, { maxAge: 3600 * 1000 })
        res.send({ status: 'success', token: reply })
      }
      else {
        // 生成一个新的 token 并将其存储到 Redis 中
        const token = jwt.sign({ email }, privateKey)
        await client.set(email, token, 'EX', 3600, (err, reply) => {
          if (err)
            throw new Error(err)
          console.log(`Token ${token} is set for user ${email}`)
        })
        // 设置 cookie，有效期为 1 小时
        res.cookie('token', token, { maxAge: 3600 * 1000 })
        res.send({ status: 'success', token })
      }
    })
  }
  catch (error) {
    res.send({ status: 'fail', message: error.message })
  }
})

router.post('/chat-process', [auth, limiter], async (req, res) => {
  res.setHeader('Content-type', 'application/octet-stream')

  try {
    const { prompt, options = {}, systemMessage } = req.body as RequestProps
    let firstChunk = true

    await chatReplyProcess({
      message: prompt,
      lastContext: options,
      process: (chat: ChatMessage) => {
        res.write(firstChunk ? JSON.stringify(chat) : `\n${JSON.stringify(chat)}`)
        firstChunk = false
      },
      systemMessage,
    })
  }
  catch (error) {
    res.write(JSON.stringify(error))
  }
  finally {
    res.end()
  }
})

router.post('/config', auth, async (req, res) => {
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
