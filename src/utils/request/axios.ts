import axios, { type AxiosResponse } from 'axios'

const service = axios.create({
  baseURL: import.meta.env.VITE_GLOB_API_URL,
})

service.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')

    if (token)
      config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => {
    window.location.href = '/'
    alert('登陆过期,正在跳转回主页')
    return Promise.reject(error.response)
  },
)

service.interceptors.response.use(
  (response: AxiosResponse): AxiosResponse => {
    if (response.status === 200) {
      if (Object.keys(response.data).length === 0 && response.data.constructor === Object) {
        window.location.href = '/'
        alert('登陆过期,正在跳转回主页')
        // @ts-expect-error
        return Promise.reject(new Error('Empty data returned'))
      }
    }
    return response

    throw new Error(response.status.toString())
  },
  (error) => {
    console.log(error.response)
    if (error.response && error.response.status === 401) {
      window.location.href = '/'

      // 返回 401 时进行页面跳转
      // notification.error({
      //   content: '登陆过期',
      //   meta: '正在跳转回主页',
      //   duration: 2500,
      //   keepAliveOnHover: false,
      // })
      alert('登陆过期,正在跳转回主页')
    }
    return Promise.reject(error)
  },
)

export default service
