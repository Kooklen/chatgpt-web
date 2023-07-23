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
const UniSMS = require('unisms').default
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

function validatephone(phone) {
  const phoneRegex = /^1[3-9]\d{9}$/
  return phoneRegex.test(phone)
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

const textClient = new UniSMS({
  accessKeyId: 'RPbuEq1H1D3Wi6rENgvfoQDCuoqQq4nKDuSStpjTtGSKQvsH2',
})

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

router.post('/verify-phone', async (req, res) => {
  try {
    const { phone, type } = req.body

    // Verify phone number
    if (!phone || !validatephone(phone))
      throw new Error('无效的手机号')

    if (!type) {
      // 检查数据库中是否已经存在该用户
      const [user] = await executeQuery(
        'SELECT * FROM users WHERE phone = ?',
        [phone],
      )
      if (user)
        throw new Error('用户已经注册')
    }
    else {
      const [user] = await executeQuery(
        'SELECT * FROM users WHERE phone = ?',
        [phone],
      )
      if (!user)
        throw new Error('用户不存在')
    }

    // Check if the verification code has already been generated and is still valid
    let code = await client.get(`${phone}_code`)
    if (code) {
      // If the code exists, return the success message directly
      res.send({ status: 'success', message: '验证码已经发送，请稍后重试 ' })
      return
    }

    // If it does not exist, generate a new verification code
    code = Math.floor(100000 + Math.random() * 900000).toString() // Generate a random 6-digit number

    // Send verification SMS
    await textClient.send({
      to: phone,
      signature: 'AIworlds世界',
      templateId: type ? 'pub_verif_resetpass' : 'pub_verif_register', // 注册
      templateData: {
        code,
      },
    })
      .then((ret) => {
        console.info('Result:', ret)
      })
      .catch((e) => {
        throw new Error(e.message)
        return
      })

    await client.set(`${phone}_code`, code, 'EX', 300)

    // Return success message
    res.send({ status: 'success', message: '验证码已经发送, 请检查您的手机' })
  }
  catch (error) {
    res.send({ status: 'fail', message: error.message })
  }
})

router.post('/reset-password', async (req, res) => {
  try {
    const { phone, password, phoneCode } = req.body

    // 验证新密码是否合法
    if (!password || password.length < 6 || !(/[a-zA-Z]/.test(password) && /\d/.test(password)))
      throw new Error('无效的密码')

    // 根据用户ID查找用户
    const [user] = await executeQuery(
      'SELECT * FROM users WHERE phone = ?',
      [phone],
    )
    if (!user)
      throw new Error('用户不存在')

    // 验证验证码是否正确
    const storedPhoneCode = await client.get(`${user.phone}_code`)
    if (!storedPhoneCode || phoneCode !== storedPhoneCode)
      throw new Error('无效的验证码')
    client.del(`${user.phone}_code`)

    // 使用 bcrypt 对密码进行加密
    const saltRounds = 10
    const hash = await bcrypt.hash(password, saltRounds)

    // 更新用户的密码
    await executeQuery(
      'UPDATE users SET password = ? WHERE phone = ?',
      [hash, phone],
    )

    const id = user.id

    // 生成一个新的 token 并将其存储到 Redis 中
    const token = jwt.sign({ id }, privateKey, { algorithm: 'HS256' })
    await client.set(id, token, 'EX', 360000, (err, reply) => {
      if (err)
        throw new Error(err)
    })
    // 设置 cookie，有效期为 100 小时
    res.cookie('token', token, { maxAge: 3600 * 100000 })

    // 保存用户信息到resetPwd表中
    const lastUsedIP = req.ip
    const lastUsedIPFrom = await getIpLocation(lastUsedIP) // 使用你选择的IP归属地查询服务
    const lastUsedTime = new Date()

    await executeQuery(
      'INSERT INTO resetPwd (user_id, time, lastUsedIP, lastUsedIPFrom) VALUES (?, ?, ?, ?)',
      [id, lastUsedTime, lastUsedIP, lastUsedIPFrom],
    )

    res.send({ status: 'success', token })
  }
  catch (error) {
    res.send({ status: 'fail', message: error.message })
  }
})

router.post('/register', async (req, res) => {
  try {
    const { phone, password, invitationCode, phoneCode } = req.body

    // 验证手机号和密码是否合法
    if (!phone || !validatephone(phone))
      throw new Error('无效的手机号')
    if (!password || password.length < 6 || !(/[a-zA-Z]/.test(password) && /\d/.test(password)))
      throw new Error('无效的密码')

    // 验证手机验证码是否正确
    const storedPhoneCode = await client.get(`${phone}_code`)
    if (!storedPhoneCode || phoneCode !== storedPhoneCode)
      throw new Error('无效的手机验证码')

    // 查询用户是否已存在
    const [user] = await executeQuery('SELECT * FROM users WHERE phone = ?', [phone])
    if (user)
      throw new Error('用户已经存在')

    // 若存在邀请码，查询对应的推荐人信息
    let inviter = null
    if (invitationCode) {
      const [result] = await executeQuery('SELECT * FROM users WHERE invitation_code = ?', [invitationCode])
      if (!result)
        throw new Error('无效的邀请码')
      inviter = result
    }

    // 密码哈希
    const saltRounds = 10
    const hash = await bcrypt.hash(password, saltRounds)
    const created_at = new Date()

    // 生成用户邀请码
    const invitation_hash = crypto.createHash('sha256')
    invitation_hash.update(phone)
    const fullHash = invitation_hash.digest('hex')
    const user_invitationCode = fullHash.substring(0, 8)

    // 插入新用户信息, 注册赠送10次GPT3
    const result = await executeQuery(
      'INSERT INTO users (phone, password, user_type, created_at, gpt3_times, gpt4_times, invitation_code, balance) VALUES (?, ?, "user", ?, 10, 0, ?, 0)',
      [phone, hash, created_at, user_invitationCode],
    )

    // 获取新插入记录的ID
    const id = result.insertId

    // 如果有推荐人，处理推荐关系
    if (inviter) {
      // 奖赏推荐人的5次
      await executeQuery('UPDATE users SET gpt4_times = gpt4_times + 5 WHERE id = ?', [inviter.id])
      const now = new Date()
      await executeQuery('INSERT INTO referrals_score (time, referrer_id, referred_id, gpt4_times) VALUES (?, ?, ?, ?)', [now, inviter.id, id, 5])

      // 将一级推荐关系存入referrals表
      await executeQuery('INSERT INTO referrals (time, referrer_id, referred_id, level) VALUES (?, ?, ?, 1)', [now, inviter.id, id])

      // 查找推荐人的推荐人，如果存在且是代理人则将二级推荐关系存入referrals表
      const [inviterReferrer] = await executeQuery(
        'SELECT referrer_id FROM referrals INNER JOIN users ON referrals.referrer_id = users.id WHERE referred_id = ? AND level = 1 AND users.user_type = "agent"',
        [inviter.id],
      )
      if (inviterReferrer)
        await executeQuery('INSERT INTO referrals (time, referrer_id, referred_id, level) VALUES (?, ?, ?, 2)', [now, inviterReferrer.referrer_id, id])
    }

    // 生成JWT token
    const token = jwt.sign({ id }, privateKey, { algorithm: 'HS256' })

    // 存储JWT token，错误由回调函数处理
    await client.set(id, token, 'EX', 3600, (err, reply) => {
      if (err)
        res.send({ status: 'fail', message: err.message })
    })

    // 设置cookie并返回
    res.cookie('token', token, { maxAge: 3600 * 100000 })
    res.send({ status: 'success', token })
  }
  catch (error) {
    res.send({ status: 'fail', message: error.message })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password, phone } = req.body
    let user

    if (!password || password.length < 6 || !(/[a-zA-Z]/.test(password) && /\d/.test(password)))
      throw new Error('无效的密码')

    if (email) {
      // 验证 email 是否合法
      if (!validateEmail(email)) {
        throw new Error('无效的邮箱')
      }
      // 检查数据库中是否存在该用户
      [user] = await executeQuery('SELECT * FROM users WHERE email = ?', [email])
    }
    else if (phone) {
      // 验证 phone 是否合法
      if (!validatephone(phone)) {
        throw new Error('无效的手机号')
      }
      // 检查数据库中是否存在该用户
      [user] = await executeQuery('SELECT * FROM users WHERE phone = ?', [phone])
    }
    else {
      throw new Error('请输入邮箱或手机号')
    }

    if (!user)
      throw new Error('用户无法找到')

    // 使用 bcrypt 验证密码是否匹配
    const match = await bcrypt.compare(password, user.password)
    if (!match)
      throw new Error('无效的密码')

    const key = user.id

    client.get(key, async (err, reply) => {
      if (err)
        throw new Error(err)

      if (reply) {
        // 删除 Redis 中的旧 token
        await client.del(key)
      }

      // 生成一个新的 token 并将其存储到 Redis 中
      const token = jwt.sign({ id: user.id }, privateKey)
      await client.set(key, token, 'EX', 360000, (err, reply) => {
        if (err)
          throw new Error(err)
      })

      // 设置 cookie，有效期为 100 小时
      res.cookie('token', token, { maxAge: 3600 * 100000 })
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
    const { prompt, options = {}, systemMessage, model, type } = req.body as RequestProps
    let firstChunk = true
    // 存储用户搜索记录
    const authorizationHeader = req.header('Authorization')
    const token = authorizationHeader.replace('Bearer ', '')
    const decodedToken = jwt.verify(token, privateKey)
    const userId = decodedToken.id

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
        'SELECT user_id, COUNT(*) as search_count FROM search_history GROUP BY user_id ORDER BY search_count DESC LIMIT 10',
      )

      let topUsersMessage = 'Top 10 users with the highest search counts:\n'
      topUsers.forEach((user, index) => {
        topUsersMessage += `${index + 1}. User ID: ${user.user_id}, ${user.search_count} searches\n`
      })

      const statisticsMessage = `Today's new users: ${todayNewUsersCount}\nYesterday's new users: ${yesterdayNewUsersCount}\nTotal users: ${totalUsersCount}\nToday's user searches: ${todaySearchesCount}\n`

      // 获取今日已付款订单数量和信息
      const todayPaidOrders = await executeQuery(
        'SELECT user_id, updated_at, amount FROM orders WHERE status = ? AND DATE(updated_at) = ?',
        ['paid', today],
      )

      let ordersMessage = 'Today\'s paid orders:\n'
      todayPaidOrders.forEach((order, index) => {
        ordersMessage += `${index + 1}. User ID: ${order.user_id}, Update Time: ${order.updated_at}, Amount: ${order.amount}\n`
      })

      // 获取总已付款订单数量和信息
      const totalPaidOrders = await executeQuery(
        'SELECT user_id, updated_at, amount FROM orders WHERE status = ?',
        ['paid'],
      )

      let totalOrdersMessage = '\nTotal paid orders:\n'
      totalPaidOrders.forEach((order, index) => {
        totalOrdersMessage += `${index + 1}. User ID: ${order.user_id}, Update Time: ${order.updated_at}, Amount: ${order.amount}\n`
      })

      const customChatMessage: ChatMessage = {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        role: 'analysis',
        text: statisticsMessage + ordersMessage + totalOrdersMessage,
      }

      res.write(JSON.stringify(customChatMessage))
      res.end()
      return
    }

    const setAgentPattern = /手机号为(\d+)设置成代理/ // 正则表达式匹配设置手机号为代理的提示

    if (setAgentPattern.test(prompt)) {
      const phoneNumber = setAgentPattern.exec(prompt)[1] // 提取提示中的手机号

      const [user] = await executeQuery('SELECT user_type FROM users WHERE id = ?', [userId])

      if (user && user.user_type === 'admin') {
        const [existingUser] = await executeQuery('SELECT id FROM users WHERE phone = ?', [phoneNumber])

        if (existingUser) {
          await executeQuery('UPDATE users SET user_type = "agent" WHERE phone = ?', [phoneNumber])

          const customChatMessage: ChatMessage = {
            role: '',
            text: `手机号${phoneNumber}已被设置为代理。`,
          }

          res.write(JSON.stringify(customChatMessage))
          res.end()
          return
        }
        else {
          const customChatMessage: ChatMessage = {
            role: '',
            text: `找不到使用手机号${phoneNumber}的用户。`,
          }

          res.write(JSON.stringify(customChatMessage))
          res.end()
          return
        }
      }
      else {
        const customChatMessage: ChatMessage = {
          role: '',
          text: '只有管理员可以设置用户为代理。',
        }

        res.write(JSON.stringify(customChatMessage))
        res.end()
        return
      }
    }

    const [user] = await executeQuery(
      'SELECT * FROM users WHERE id = ?',
      [userId],
    )

    if (!user)
      throw new Error('用户不存在')

    // 获取今天的日期
    const today = new Date()

    if (model === 'gpt-3.5-turbo') {
      // 检查 GPT4 会员是否到期
      if (user.gpt4_vip_end && user.gpt4_vip_end >= today) {
        // GPT4 会员未到期，用户可以使用 GPT3
      }
      else if (user.gpt3_vip_end && user.gpt3_vip_end >= today) {
      }
      else if (user.gpt3_times > 0) {
        // GPT4 和 GPT3 会员都已到期，但用户还有 GPT3 单次使用次数，消耗一次
        await executeQuery(
          'UPDATE users SET gpt3_times = gpt3_times - 1 WHERE id = ?',
          [userId],
        )
      }
      else {
        // GPT4 和 GPT3 会员都已到期，且没有 GPT3 单次使用次数
        const customChatMessage: ChatMessage = {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          role: '',
          text: '抱歉，您的GPT-3使用次数已用完或会员已到期。请在左侧开通会员或邀请更多用户以继续使用。',
        }

        res.write(JSON.stringify(customChatMessage))
        res.end()
        return
      }
    }

    if (model === 'gpt-4') {
      // 检查 GPT4 会员是否到期
      if (user.gpt4_vip_end && user.gpt4_vip_end >= today) {
        // GPT4 会员未到期，用户可以使用 GPT4
      }
      else if (user.gpt4_times > 0) {
        // GPT4 会员已到期，但用户还有 GPT4 单次使用次数，消耗一次
        await executeQuery(
          'UPDATE users SET gpt4_times = gpt4_times - 1 WHERE id = ?',
          [userId],
        )
      }
      else {
        // GPT4 会员已到期，且没有 GPT4 单次使用次数
        const customChatMessage: ChatMessage = {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-expect-error
          role: '',
          text: '抱歉，您的GPT-4使用次数已用完或会员已到期。请在左侧开通会员或邀请更多用户以继续使用。',
        }

        res.write(JSON.stringify(customChatMessage))
        res.end()
        return
      }
    }

    if (userId && prompt) {
      const truncatedPrompt = prompt.slice(0, 255)
      await executeQuery(
        'INSERT INTO search_history (user_id, keyword, model, type) VALUES (?, ?, ?, ?)',
        [userId, truncatedPrompt, model, type],
      )

      // 获取用户IP地址和归属地
      // 注意：在实际环境中，你可能需要使用其他方式来获取真实的用户IP和归属地，因为req.ip可能会被代理服务器修改
      const lastUsedIP = req.ip
      const lastUsedIPFrom = await getIpLocation(lastUsedIP) // 使用你选择的IP归属地查询服务

      // 获取当前时间
      const lastUsedTime = new Date()

      // 更新数据库
      await executeQuery(
        'UPDATE users SET lastUsedIP = ?, lastUsedIPFrom = ?, lastUsedTime = ? WHERE id = ?',
        [lastUsedIP, lastUsedIPFrom, lastUsedTime, userId],
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
      // model: 'gpt-3.5-turbo',
      type,
      model, // 暂时屏蔽4.0
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
    const userId = decodedToken.id

    // 查询用户信息
    const [user] = await executeQuery(
      'SELECT email, invitation_code, gpt4_times FROM users WHERE id = ?',
      [userId],
    )

    if (!user) {
      return res.status(404).json({
        message: '用户不存在',
      })
    }

    let invitedUserInfos = []
    if (userId) {
      invitedUserInfos = await executeQuery('SELECT * FROM referrals_score WHERE referrer_id = ?', [userId])

      for (let i = 0; i < invitedUserInfos.length; i++) {
        // 查询被邀请人的邮箱或电话信息
        const [invitedUser] = await executeQuery('SELECT email, phone FROM users WHERE id = ?', [invitedUserInfos[i].referred_id])

        let emailOrPhone
        if (invitedUser.phone) {
          emailOrPhone = `${invitedUser.phone.slice(0, 3)}****${invitedUser.phone.slice(-4)}`
        }
        else if (invitedUser.email) {
          const emailParts = invitedUser.email.split('@')
          emailOrPhone = `${emailParts[0][0]}***@${emailParts[1]}`
        }

        invitedUserInfos[i].emailOrPhone = emailOrPhone

        // 查询推荐奖励信息
        const [reward] = await executeQuery('SELECT gpt4_times, balance, level FROM referrals_score WHERE id = ?', [invitedUserInfos[i].id])

        // 根据获取的奖励类型生成奖励字符串
        let rewardStr = ''
        if (reward) {
          if (reward.gpt4_times) {
            rewardStr = `GPT4使用权-${reward.gpt4_times}次`
          }
          else if (reward.balance) {
            const levelStr = reward.level === 1 ? '' : '[2级]'
            rewardStr = `${levelStr}消费奖励${Number(reward.balance).toFixed(2)}元`
          }
        }

        invitedUserInfos[i] = {
          emailOrPhone,
          invitationTime: invitedUserInfos[i].time,
          reward: rewardStr,
        }
      }
    }

    // 查询用户的所有邀请积分
    const invitationScores = await executeQuery(
      'SELECT * FROM referrals_score WHERE referrer_id = ?',
      [userId],
    )

    let gpt4_times_total = 0
    let balance_total = 0

    if (invitationScores && invitationScores.length > 0) {
      gpt4_times_total = invitationScores.reduce((acc, score) => acc + parseFloat(score.gpt4_times || 0), 0)
      balance_total = invitationScores.reduce((acc, score) => acc + parseFloat(score.balance || 0), 0)
    }

    const invitation_score = {
      gpt4_times: gpt4_times_total || null,
      balance: balance_total.toFixed(2) || null,
    }

    // 从数据库查询结果中提取用户信息
    const userInfo = {
      invitation_code: user.invitation_code,
      invitation_user: invitedUserInfos,
      invitation_score,
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

router.post('/user-packages', auth, async (req, res) => {
  try {
    // 从JWT中获取用户ID
    const authorizationHeader = req.header('Authorization')
    const token = authorizationHeader.replace('Bearer ', '')
    const decodedToken = jwt.verify(token, privateKey)
    const userId = decodedToken.id

    // 查询用户信息
    const [user] = await executeQuery(
      'SELECT gpt3_times, gpt4_times, gpt3_vip_end, gpt4_vip_end, balance FROM users WHERE id = ?',
      [userId],
    )

    if (!user) {
      return res.status(404).json({
        message: '用户不存在',
      })
    }

    // 查看邀请人是否是管理员
    let inviterIsAdminOrAgent = false
    if (userId) {
      const [referral] = await executeQuery('SELECT referrer_id FROM referrals WHERE referred_id = ?', [userId])
      if (referral) {
        const [referrer] = await executeQuery('SELECT user_type FROM users WHERE id = ?', [referral.referrer_id])
        if (referrer && (referrer.user_type === 'admin' || referrer.user_type === 'agent'))
          inviterIsAdminOrAgent = true
      }
    }

    // 查询所有套餐信息
    let packages = await executeQuery('SELECT id, package_name, price, origin_price, description FROM packages')
    // 如果邀请人不是管理员，从套餐列表中移除ID为9的特价套餐
    const [order] = await executeQuery('SELECT user_id FROM orders WHERE user_id = ?', [userId])
    if (!inviterIsAdminOrAgent || order)
      packages = packages.filter(packageItem => packageItem.id !== 9)

    // 从数据库查询结果中提取用户信息和套餐信息
    const data = {
      userInfo: {
        gpt3_times: user.gpt3_times,
        gpt4_times: user.gpt4_times,
        gpt3_vip_end: user.gpt3_vip_end,
        gpt4_vip_end: user.gpt4_vip_end,
        balance: user.balance,
      },
      packages,
    }

    // 发送用户信息和套餐信息
    res.send({ status: 'Success', message: '', data })
  }
  catch (error) {
    res.status(500).json({
      message: '服务器错误',
      error: error.message,
    })
  }
})

router.post('/record-click-buy', auth, async (req, res) => {
  try {
    // 从JWT中获取用户ID
    const authorizationHeader = req.header('Authorization')
    const token = authorizationHeader.replace('Bearer ', '')
    const decodedToken = jwt.verify(token, privateKey)
    const userId = decodedToken.id

    // 记录用户点击购买套餐按钮的时间
    const clickTime = new Date()

    // 执行插入操作将用户ID和点击时间保存到数据库表中
    await executeQuery('INSERT INTO click_buy_btn (user_id, click_time) VALUES (?, ?)', [userId, clickTime])

    res.send({ status: 'Success', message: 'Click recorded successfully' })
  }
  catch (error) {
    res.status(500).json({
      message: '服务器错误',
      error: error.message,
    })
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
  const { selectPackage } = req.body
  const decodedToken = jwt.verify(token, privateKey)
  const userId = decodedToken.id
  try {
    // 获取套餐的价格
    const [package_detail] = await executeQuery('SELECT price,package_name,id FROM packages WHERE id = ?', [selectPackage])
    if (!package_detail) {
      return res.status(404).json({
        message: '套餐不存在',
      })
    }
    let packagePrice = package_detail.price
    const packageName = package_detail.package_name
    const product_number = package_detail.id

    const [user] = await executeQuery('SELECT balance FROM users WHERE id = ?', [userId])
    let remainingBalance = 0
    const userBalance = parseFloat(user.balance)
    if (!isNaN(userBalance) && userBalance >= packagePrice) {
      await executeQuery('UPDATE users SET balance = balance - ? WHERE id = ?', [packagePrice, userId])
      await executeQuery('INSERT INTO orders (payment_type, product_name, product_number, amount, status, user_id) VALUES (?, ?, ?, ?, ?, ?)', [
        'balance',
        packageName,
        product_number,
        packagePrice,
        'success',
        userId,
      ])
      return res.send({ status: 'Success', message: '支付成功，已从余额扣款', data: null })
    }
    else {
      remainingBalance = user.balance
      packagePrice -= remainingBalance
    }

    const pid = '20230504230028'
    const key = '63a7PDalwyvJpEZLKRY9lv7z2BYIJruq'
    const apiurl = 'https://7-pay.cn/mapi.php'
    const type = 'wxpay'
    const notify_url = 'http://www.aiworlds.cc:3002/notify'
    // const notify_url = 'http://www.easylisting.cn:3002/notify'
    // easylisting.cn
    const return_url = 'https://www.aiworlds.cc'
    const out_trade_no = Date.now().toString()
    const name = packageName
    const money = packagePrice
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

    await executeQuery('INSERT INTO orders (order_no, pid, payment_type, product_name,product_number, amount, status, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
      out_trade_no,
      pid,
      type,
      name,
      product_number,
      money,
      'pending',
      userId,
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
      res.send({ status: 'Success', message: '', data: { qrcode: response.data.qrcode, packageName, packagePrice } })

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
    const now = new Date()

    // 判断支付状态
    if (trade_status === 'TRADE_SUCCESS') {
      // 如果支付成功，更新订单状态
      await executeQuery(
        'UPDATE orders SET status = ?, updated_at = ? WHERE order_no = ?',
        ['paid', now, out_trade_no],
      )

      const [package_detail] = await executeQuery(
        'SELECT * FROM packages WHERE id = ?',
        [order.product_number],
      )

      if (!package_detail) {
        await executeQuery(
          'UPDATE orders SET status = ? WHERE order_no = ?',
          ['找不到订单', out_trade_no],
        )
      }

      const [user] = await executeQuery(
        'SELECT balance FROM users WHERE id = ?',
        [order.user_id],
      )

      const needPay = package_detail.price - money // 套餐价格 - 实际支付的
      const needPayFixed = Number(needPay.toFixed(2)) // 保留两位小数
      if (needPayFixed >= 0) {
        // 扣除用户的余额
        if (user.balance >= needPayFixed) {
          await executeQuery(
            'UPDATE users SET balance = balance - ? WHERE id = ?',
            [needPayFixed, order.user_id],
          )
        }
        else {
          // 扣款异常
          await executeQuery(
            'UPDATE orders SET status = ? WHERE order_no = ?',
            ['用户的余额不足', out_trade_no],
          )
          return
        }
      }
      else {
        // 扣款异常
        await executeQuery(
          'UPDATE orders SET status = ? WHERE order_no = ?',
          ['实际支付超出了需要支付的价格', out_trade_no],
        )
        return
      }

      // 处理推荐人的充值奖励
      const referrals = await executeQuery(
        'SELECT * FROM referrals WHERE referred_id = ?',
        [order.user_id],
      )

      for (const referral of referrals) {
        const { referrer_id, level } = referral
        let rewardPercentage = 0

        if (level === '1')
          rewardPercentage = 0.2

        if (level === '2')
          rewardPercentage = 0.1

        // 查询推荐人的信息和当前余额
        const [referrer] = await executeQuery(
          'SELECT * FROM users WHERE id = ?',
          [referrer_id],
        )

        if (referrer) {
          const rewardAmount = money * rewardPercentage
          const now = new Date()
          // 更新推荐的记录
          await executeQuery(
            'INSERT INTO referrals_score (time, referrer_id, referred_id, balance, level) VALUES (?, ?, ?, ?, ?)',
            [now, referrer_id, order.user_id, rewardAmount, level],
          )
          // 更新推荐人的余额
          await executeQuery(
            'UPDATE users SET balance = balance + ? WHERE id = ?',
            [rewardAmount, referrer_id],
          )
        }
      }

      if (package_detail.gpt3_times) {
        // 增加user表中这个用户的GPT-3使用次数
        await executeQuery(
          'UPDATE users SET gpt3_times = gpt3_times + ? WHERE id = ?',
          [package_detail.gpt3_times, order.user_id],
        )
      }

      if (package_detail.gpt4_times) {
        // 增加user表中这个用户的GPT-4使用次数
        await executeQuery(
          'UPDATE users SET gpt4_times = gpt4_times + ? WHERE id = ?',
          [package_detail.gpt4_times, order.user_id],
        )
      }

      // For GPT-3 VIP
      if (package_detail.gpt3_vip_duration) {
        const [user] = await executeQuery(
          'SELECT gpt3_vip_start, gpt3_vip_end FROM users WHERE id = ?',
          [order.user_id],
        )

        let vip_start, vip_end

        if (user.gpt3_vip_start && user.gpt3_vip_end) {
          vip_start = new Date(user.gpt3_vip_start)
          vip_end = new Date(user.gpt3_vip_end)

          // Check if the VIP subscription has not expired before updating
          if (vip_end > new Date()) {
            vip_end.setDate(vip_end.getDate() + package_detail.gpt3_vip_duration)
          }
          else {
            vip_start = new Date()
            vip_end = new Date()
            vip_end.setDate(vip_start.getDate() + package_detail.gpt3_vip_duration)
          }
        }
        else {
          vip_start = new Date()
          vip_end = new Date()
          vip_end.setDate(vip_start.getDate() + package_detail.gpt3_vip_duration)
        }

        await executeQuery(
          'UPDATE users SET gpt3_vip_start = ?, gpt3_vip_end = ? WHERE id = ?',
          [vip_start, vip_end, order.user_id],
        )
      }

      // For GPT-4 VIP
      if (package_detail.gpt4_vip_duration) {
        const [user] = await executeQuery(
          'SELECT gpt4_vip_start, gpt4_vip_end FROM users WHERE id = ?',
          [order.user_id],
        )

        let vip_start, vip_end

        if (user.gpt4_vip_start && user.gpt4_vip_end) {
          vip_start = new Date(user.gpt4_vip_start)
          vip_end = new Date(user.gpt4_vip_end)

          // Check if the VIP subscription has not expired before updating
          if (vip_end > new Date()) {
            vip_end.setDate(vip_end.getDate() + package_detail.gpt4_vip_duration)
          }
          else {
            vip_start = new Date()
            vip_end = new Date()
            vip_end.setDate(vip_start.getDate() + package_detail.gpt4_vip_duration)
          }
        }
        else {
          vip_start = new Date()
          vip_end = new Date()
          vip_end.setDate(vip_start.getDate() + package_detail.gpt4_vip_duration)
        }

        await executeQuery(
          'UPDATE users SET gpt4_vip_start = ?, gpt4_vip_end = ? WHERE id = ?',
          [vip_start, vip_end, order.user_id],
        )
      }
      res.send('success')
    }
    else {
      await executeQuery(
        'UPDATE orders SET status = ? WHERE order_no = ?',
        ['failed', out_trade_no],
      )
    }
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
