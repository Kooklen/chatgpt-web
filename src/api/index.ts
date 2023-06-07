import type { AxiosProgressEvent, GenericAbortSignal } from 'axios'
import { post } from '@/utils/request'
import { useSettingStore } from '@/store'

export function fetchChatAPI<T = any>(
  prompt: string,
  options?: { conversationId?: string; parentMessageId?: string },
  signal?: GenericAbortSignal,
) {
  return post<T>({
    url: '/chat',
    data: { prompt, options },
    signal,
  })
}

export function fetchChatConfig<T = any>() {
  return post<T>({
    url: '/config',
  })
}

export function fetchChatAPIProcess<T = any>(
  params: {
    model?: string
    type?: string
    prompt: string
    options?: { conversationId?: string; parentMessageId?: string }
    signal?: GenericAbortSignal
    onDownloadProgress?: (progressEvent: AxiosProgressEvent) => void },
) {
  const settingStore = useSettingStore()

  return post<T>({
    url: '/chat-process',
    data: { prompt: params.prompt, options: params.options, systemMessage: settingStore.systemMessage, model: params.model, type: params.type },
    signal: params.signal,
    onDownloadProgress: params.onDownloadProgress,
  })
}

export function fetchUserInfo<T>(token: string) {
  return post<T>({
    url: '/user-info',
    data: { token },
  })
}

export function fetchPackageInfo<T>(token: string) {
  return post<T>({
    url: '/user-packages',
    data: { token },
  })
}

export function fetchQrCode<T>(
  params: {
    selectPackage?: any
  }) {
  return post<T>({
    url: '/initiate-payment',
    data: { selectPackage: params.selectPackage },
  })
}

export function clickBuyBtn<T>() {
  return post<T>({
    url: '/record-click-buy',
  })
}

export function fetchSession<T>() {
  return post<T>({
    url: '/session',
  })
}

export function fetchVerify<T>(token: string) {
  return post<T>({
    url: '/verify',
    data: { token },
  })
}
