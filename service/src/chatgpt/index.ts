import * as dotenv from 'dotenv'
import 'isomorphic-fetch'
import type { ChatGPTAPIOptions, ChatMessage, SendMessageOptions } from 'chatgpt'
import { ChatGPTAPI } from 'chatgpt'
import { SocksProxyAgent } from 'socks-proxy-agent'
import httpsProxyAgent from 'https-proxy-agent'
import fetch from 'node-fetch'
import { sendResponse } from '../utils'
import { isNotEmptyString } from '../utils/is'
import type { ApiModel, ChatContext, ChatGPTUnofficialProxyAPIOptions, ModelConfig } from '../types'
import type { RequestOptions } from './types'

const { HttpsProxyAgent } = httpsProxyAgent

dotenv.config()

const ErrorCodeMessage: Record<string, string> = {
  401: '[OpenAI] 提供错误的API密钥 | Incorrect API key provided',
  403: '[OpenAI] 服务器拒绝访问，请稍后再试 | Server refused to access, please try again later',
  502: '[OpenAI] 错误的网关 |  Bad Gateway',
  503: '[OpenAI] 服务器繁忙，请稍后再试 | Server is busy, please try again later',
  504: '[OpenAI] 网关超时 | Gateway Time-out',
  500: '[OpenAI] 服务器繁忙，请稍后再试 | Internal Server Error',
}

const timeoutMs: number = !isNaN(+process.env.TIMEOUT_MS) ? +process.env.TIMEOUT_MS : 30 * 1000

let apiModel: ApiModel

if (!isNotEmptyString(process.env.OPENAI_API_KEY) && !isNotEmptyString(process.env.OPENAI_API_KEY_GPT4))
  throw new Error('Missing OPENAI_API_KEY')

class ApiManager {
  private apis: Map<string, ChatGPTAPI>

  constructor() {
    this.apis = new Map()
  }

  getAPI(model: string): ChatGPTAPI {
    if (!this.apis.has(model)) {
      const api = this.initializeAPI(model)
      this.apis.set(model, api)
    }

    return this.apis.get(model)
  }

  private initializeAPI(model: string): ChatGPTAPI {
    const apiKey = model === 'gpt-4' ? process.env.OPENAI_API_KEY_GPT4 : process.env.OPENAI_API_KEY
    const OPENAI_API_BASE_URL = process.env.OPENAI_API_BASE_URL

    const options: ChatGPTAPIOptions = {
      apiKey,
      completionParams: { model },
      debug: true,
    }

    // increase max token limit if use gpt-4
    if (model.toLowerCase().includes('gpt-4')) {
      // if use 32k model
      if (model.toLowerCase().includes('32k')) {
        options.maxModelTokens = 32768
        options.maxResponseTokens = 8192
      }
      else {
        options.maxModelTokens = 32768
        options.maxResponseTokens = 8192
      }
    }

    if (isNotEmptyString(OPENAI_API_BASE_URL))
      options.apiBaseUrl = `${OPENAI_API_BASE_URL}/v1`

    setupProxy(options)

    const api = new ChatGPTAPI({ ...options })

    return api
  }
}

const apiManager = new ApiManager()

async function chatReplyProcess(options: RequestOptions) {
  let { message, lastContext, process, systemMessage, model, type } = options
  try {
    if (type === 'web') {
      // 使用message作为查询进行搜索
      const query = message
      let snippet = ''
      const maxSnippetLength = 100 // 限制每个搜索结果的最大长度
      try {
        const searchResponse = await fetch(`https://api-ddg.iii.hair/search?q=${query}&max_results=10`)
        const searchResults = await searchResponse.json()
        snippet = searchResults.map(({ title, body, href }) => {
          const truncatedBody = body.length > maxSnippetLength ? `${body.substring(0, maxSnippetLength)}...` : body
          return `'${title}' : ${truncatedBody} ;`
        }).join('\n')
      }
      catch (err) {
        try {
          const searchResponse = await fetch(`https://ddg-api.herokuapp.com/search?query=${query}&limit=10`)
          const searchResults = await searchResponse.json()
          snippet = searchResults.map(({ title, snippet, link }) => {
            const truncatedSnippet = snippet.length > maxSnippetLength ? `${snippet.substring(0, maxSnippetLength)}...` : snippet
            return `'${title}' : ${truncatedSnippet} ;`
          }).join('\n')
        }
        catch (err) {
          return err.status(500).json({
            message: '服务器错误',
            error: err.message,
          })
        }
      }

      const instructions = 'Instructions: Reply to me in the language of my request or question above. Give a comprehensive answer to the question or request I have made above. Below are some results from a web search. Use them if necessary.'
      message += `${instructions}\n${snippet}`
    }

    let options: SendMessageOptions = { timeoutMs }

    if (apiModel === 'ChatGPTAPI') {
      if (isNotEmptyString(systemMessage))
        options.systemMessage = systemMessage
    }

    if (lastContext != null) {
      if (apiModel === 'ChatGPTAPI')
        options.parentMessageId = lastContext.parentMessageId
      else
        options = { ...lastContext }
    }
    console.log(model)
    const api = apiManager.getAPI(model)

    const response = await api.sendMessage(message, {
      ...options,
      onProgress: (partialResponse) => {
        process?.(partialResponse)
      },
    })

    return sendResponse({ type: 'Success', data: response })
  }
  catch (error: any) {
    const code = error.statusCode
    if (Reflect.has(ErrorCodeMessage, code))
      return sendResponse({ type: 'Fail', message: ErrorCodeMessage[code] })
    return sendResponse({ type: 'Fail', message: error.message ?? 'Please check the back-end console' })
  }
}

async function chatConfig() {
  // const balance = await fetchBalance()
  const reverseProxy = process.env.API_REVERSE_PROXY ?? '-'
  const httpsProxy = (process.env.HTTPS_PROXY || process.env.ALL_PROXY) ?? '-'
  const socksProxy = (process.env.SOCKS_PROXY_HOST && process.env.SOCKS_PROXY_PORT)
    ? (`${process.env.SOCKS_PROXY_HOST}:${process.env.SOCKS_PROXY_PORT}`)
    : '-'
  return sendResponse<ModelConfig>({
    type: 'Success',
    data: { apiModel, reverseProxy, timeoutMs, socksProxy, httpsProxy },
    // data: { apiModel, reverseProxy, timeoutMs, socksProxy, httpsProxy, balance },
  })
}

function setupProxy(options: ChatGPTAPIOptions | ChatGPTUnofficialProxyAPIOptions) {
  if (process.env.SOCKS_PROXY_HOST && process.env.SOCKS_PROXY_PORT) {
    const agent = new SocksProxyAgent({
      hostname: process.env.SOCKS_PROXY_HOST,
      port: process.env.SOCKS_PROXY_PORT,
    })
    options.fetch = (url, options) => {
      return fetch(url, { agent, ...options })
    }
  }
  else {
    if (process.env.HTTPS_PROXY || process.env.ALL_PROXY) {
      const httpsProxy = process.env.HTTPS_PROXY || process.env.ALL_PROXY
      if (httpsProxy) {
        const agent = new HttpsProxyAgent(httpsProxy)
        options.fetch = (url, options) => {
          return fetch(url, { agent, ...options })
        }
      }
    }
  }
}

function currentModel(): ApiModel {
  return apiModel
}

export type { ChatContext, ChatMessage }

export { chatReplyProcess, chatConfig, currentModel }
