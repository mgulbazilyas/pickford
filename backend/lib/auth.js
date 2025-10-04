const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')

class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key'
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d'
  }

  async hashPassword(password) {
    return await bcrypt.hash(password, 12)
  }

  async comparePassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword)
  }

  generateToken(userId) {
    return jwt.sign(
      { userId },
      this.jwtSecret,
      { expiresIn: this.jwtExpiresIn }
    )
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret)
    } catch (error) {
      return null
    }
  }

  async createSession(userId) {
    const { db } = require('./db-mongodb')

    // Generate JWT token
    const token = this.generateToken(userId.toString())

    // Calculate expiration date
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7 days from now

    // Store session in database
    const sessionData = {
      userId: new (require('mongodb').ObjectId)(userId),
      token,
      expiresAt,
      createdAt: new Date()
    }

    await db.createSession(sessionData)

    return token
  }

  async verifySession(token) {
    const { db } = require('./db-mongodb')

    // First verify the JWT token
    const decoded = this.verifyToken(token)
    if (!decoded) return null

    // Then verify the session exists in database
    const user = await db.verifySession(token)
    return user
  }

  async destroySession(token) {
    const { db } = require('./db-mongodb')
    return await db.destroySession(token)
  }
}

// Create singleton instance
const authService = new AuthService()

// Export the instance
module.exports = { AuthService: authService }