import express from 'express'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
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

router.post('/register', async (req, res) => {
  try {
    const { email, password, invitationCode } = req.body
    // 验证 email 和 password 是否合法
    if (!email || !password)
      throw new Error('Invalid email or password')

    // 如果有邀请码，则检查邀请码是否合法
    if (invitationCode) {
      const [invitation] = await executeQuery(
        'SELECT * FROM invitation_codes WHERE code = ?',
        [invitationCode],
      )
      if (!invitation)
        throw new Error('Invalid invitation code')
    }

    // 检查数据库中是否已经存在该用户
    const [user] = await executeQuery(
      'SELECT * FROM users WHERE email = ?',
      [email],
    )
    if (user)
      throw new Error('User already exists')

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

    await client.set(token, email, (err, reply) => {
      if (err)
        throw new Error(err)
    })
    res.cookie('token', token, { maxAge: 3600 * 1000 })

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
    if (!email || !password)
      throw new Error('Invalid email or password')

    // 检查数据库中是否存在该用户
    const [user] = await executeQuery(
      'SELECT * FROM users WHERE email = ?',
      [email],
    )
    if (!user)
      throw new Error('User not found')

    // 使用 bcrypt 验证密码是否匹配
    const match = await bcrypt.compare(password, user.password)
    if (!match)
      throw new Error('Invalid password')

    client.get(email, async (err, reply) => {
      if (err)
        throw new Error(err)

      if (reply) {
        // 删除 Redis 中的旧 token
        await client.del(email)
      }

      // 生成一个新的 token 并将其存储到 Redis 中
      const token = jwt.sign({ email }, privateKey)
      await client.set(email, token, 'EX', 3600, (err, reply) => {
        if (err)
          throw new Error(err)
      })
      // 设置 cookie，有效期为 1 小时
      res.cookie('token', token, { maxAge: 3600 * 1000 })
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
    // res.send({ status: 'fail', message: 'Token is valid' })
  }
  catch (error) {
    res.status(401).send({ status: 'fail', message: 'Invalid token. Please authenticate.', code: 401 })
    // res.send({ status: 'fail', message: error.message })
  }
})

router.post('/chat-process', [auth, limiter], async (req, res) => {
  res.setHeader('Content-type', 'application/octet-stream')

  try {
    const { prompt, options = {}, systemMessage } = req.body as RequestProps
    let firstChunk = true

    // 存储用户搜索记录
    const authorizationHeader = req.header('Authorization')
    const token = authorizationHeader.replace('Bearer ', '')
    const decodedToken = jwt.verify(token, privateKey)
    const userEmail = decodedToken.email
    if (userEmail && prompt) {
      await executeQuery(
        'INSERT INTO search_history (user_email, keyword) VALUES (?, ?)',
        [userEmail, prompt],
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
