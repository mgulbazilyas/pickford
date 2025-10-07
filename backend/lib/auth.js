const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { v4: uuidv4 } = require('uuid')

class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key'
    this.refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET || 'your-refresh-secret-key'
    this.accessTokenExpiresIn = '7d' // 7 days for access token
    this.refreshTokenExpiresIn = '90d' // 90 days for refresh token
  }

  async hashPassword(password) {
    return await bcrypt.hash(password, 12)
  }

  async comparePassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword)
  }

  generateAccessToken(userId) {
    return jwt.sign(
      { userId, type: 'access' },
      this.jwtSecret,
      { expiresIn: this.accessTokenExpiresIn }
    )
  }

  generateRefreshToken() {
    return jwt.sign(
      { type: 'refresh', uuid: uuidv4() },
      this.refreshTokenSecret,
      { expiresIn: this.refreshTokenExpiresIn }
    )
  }

  verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret)
      return decoded.type === 'access' ? decoded : null
    } catch (error) {
      return null
    }
  }

  verifyRefreshToken(token) {
    try {
      const decoded = jwt.verify(token, this.refreshTokenSecret)
      return decoded.type === 'refresh' ? decoded : null
    } catch (error) {
      return null
    }
  }

  async createSession(userId) {
    const { db } = require('./db-mongodb')

    // Generate both tokens
    const accessToken = this.generateAccessToken(userId.toString())
    const refreshToken = this.generateRefreshToken()

    // Calculate expiration dates
    const accessExpiresAt = new Date()
    accessExpiresAt.setDate(accessExpiresAt.getDate() + 7) // 7 days from now

    const refreshExpiresAt = new Date()
    refreshExpiresAt.setDate(refreshExpiresAt.getDate() + 90) // 90 days from now

    // Store session in database
    const sessionData = {
      userId: new (require('mongodb').ObjectId)(userId),
      accessToken,
      refreshToken,
      accessExpiresAt,
      refreshExpiresAt,
      createdAt: new Date(),
      isActive: true
    }

    await db.createSession(sessionData)

    return {
      accessToken,
      refreshToken,
      expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
      tokenType: 'Bearer'
    }
  }

  async refreshAccessToken(refreshToken) {
    const { db } = require('./db-mongodb')

    // Verify the refresh token
    const decoded = this.verifyRefreshToken(refreshToken)
    if (!decoded) return null

    // Find the session with this refresh token
    const session = await db.findSessionByRefreshToken(refreshToken)
    if (!session || !session.isActive || session.refreshExpiresAt < new Date()) {
      return null
    }

    // Generate new access token
    const newAccessToken = this.generateAccessToken(session.userId.toString())
    const newAccessExpiresAt = new Date()
    newAccessExpiresAt.setDate(newAccessExpiresAt.getDate() + 7)

    // Update the session with new access token
    await db.updateSessionAccessToken(session._id, newAccessToken, newAccessExpiresAt)

    return {
      accessToken: newAccessToken,
      expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
      tokenType: 'Bearer'
    }
  }

  async verifySession(token) {
    const { db } = require('./db-mongodb')

    // First verify the JWT token
    const decoded = this.verifyAccessToken(token)
    if (!decoded) return null

    // Then verify the session exists in database
    const user = await db.verifySession(token)
    return user
  }

  async destroySession(token) {
    const { db } = require('./db-mongodb')
    return await db.destroySession(token)
  }

  async destroyAllUserSessions(userId) {
    const { db } = require('./db-mongodb')
    return await db.destroyAllUserSessions(userId)
  }
}

// Create singleton instance
const authService = new AuthService()

// Export the instance
module.exports = { AuthService: authService }