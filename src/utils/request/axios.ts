import axios, { type AxiosResponse } from 'axios'
import { useNotification } from 'naive-ui'

const service = axios.create({
  baseURL: import.meta.env.VITE_GLOB_API_URL,
})

const notification = useNotification()

service.interceptors.request.use(
  (config) => {
    // const token = useAuthStore().token
    const token = localStorage.getItem('token')
    console.log(token)
    // if (!token)
    //   return Promise.reject(new Error('No token available'))

    if (token)
      config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => {
    return Promise.reject(error.response)
  },
)

service.interceptors.response.use(
  (response: AxiosResponse): AxiosResponse => {
    if (response.status === 200)
      return response

    throw new Error(response.status.toString())
  },
  (error) => {
    console.log(error.response)
    if (error.response && error.response.status === 401) {
      console.log(111)
      window.location.href = '/'

      // 返回 401 时进行页面跳转
      notification.error({
        content: '登陆过期',
        meta: '正在跳转回主页',
        duration: 2500,
        keepAliveOnHover: false,
      })
    }
    return Promise.reject(error)
  },
)

export default service
