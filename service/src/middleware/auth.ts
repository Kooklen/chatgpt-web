import { promisify } from 'util'
import jwt from 'jsonwebtoken'
import { isNotEmptyString } from '../utils/is'
import { client } from '../redis'
const auth = async (req, res, next) => {
  const privateKey = 'your_private_key_here'

  const authorizationHeader = req.header('Authorization')
  if (isNotEmptyString(authorizationHeader)) {
    const token = authorizationHeader.replace('Bearer ', '')

    if (!token) {
      res.status(401).send({ status: 'fail', message: 'Token not found. Please authenticate.', code: 401 })
    }
    else {
      try {
        const decodedToken = jwt.verify(token, privateKey)
        const email = decodedToken.email

        const storedToken = await promisify(client.get).bind(client)(email)

        if (token !== storedToken)
          res.status(401).send({ status: 'fail', message: 'Invalid token. Please authenticate.', code: 401 })
				 else
          next()
      }
      catch (error) {
        res.status(401).send({ status: 'fail', message: 'Invalid token. Please authenticate.', code: 401 })
      }
    }
  }
  else {
    next()
  }
}

export { auth }
