import Redis from 'ioredis'
export const client = new Redis({
  host: 'localhost', // Redis server address
  port: 6379, // Redis server port number
  password: 'AL5RqqozjHNyfgQfpmDV', // Redis server password
})

client.on('connect', () => {
  console.log('Redis client connected')
})

client.on('error', (err) => {
  console.error('Redis client error:', err)
})
