const mysql = require('mysql2')

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'qqq111',
  database: 'mydatabase',
})

connection.connect((err) => {
  if (err) {
    console.error('Error connecting to database: ', err)
    return
  }
})

// 执行 SQL 查询
connection.query('SELECT * FROM users', (err, results) => {
  if (err) {
    console.error('Error executing query: ', err)
    return
  }
  console.log('Query results: ', results)
})

// 关闭数据库连接
connection.end((err) => {
  if (err) {
    console.error('Error closing database connection: ', err)
    return
  }
  console.log('Database connection closed')
})
