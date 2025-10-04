const { MongoClient, ObjectId } = require('mongodb')

class Database {
  constructor() {
    this.client = null
    this.db = null
    this.isConnected = false
    this.configured = false
  }

  async connect() {
    if (this.isConnected) return
    
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017'
    const dbName = process.env.MONGODB_DB || 'trakt-proxy'

    try {
      this.client = new MongoClient(uri)
      await this.client.connect()
      this.db = this.client.db(dbName)
      this.isConnected = true
      this.configured = true
      console.log('[mongodb] Connected successfully')
    } catch (error) {
      console.error('[mongodb] Connection failed:', error)
      this.configured = false
      throw error
    }
  }

  isConfigured() {
    return this.configured
  }

  async close() {
    if (this.client) {
      await this.client.close()
      this.isConnected = false
      console.log('[mongodb] Connection closed')
    }
  }

  // User management
  async createUser(userData) {
    const users = this.db.collection('users')
    const result = await users.insertOne({
      ...userData,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
      emailVerified: false
    })
    return { _id: result.insertedId, ...userData }
  }

  async authenticateUser(email, password) {
    const users = this.db.collection('users')
    const bcrypt = require('bcryptjs')

    const user = await users.findOne({ email })
    if (!user) return null

    const isValid = await bcrypt.compare(password, user.password)
    if (!isValid) return null

    return user
  }

  async updateUser(userId, updates) {
    const users = this.db.collection('users')
    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          ...updates,
          updatedAt: new Date()
        }
      }
    )

    if (result.matchedCount === 0) return null

    const updatedUser = await users.findOne({ _id: new ObjectId(userId) })
    return updatedUser
  }

  async getUserStats(userId) {
    const ratingsCount = await this.db.collection('movie_ratings').countDocuments({ userId: new ObjectId(userId) })
    const commentsCount = await this.db.collection('movie_comments').countDocuments({ userId: new ObjectId(userId) })

    return { ratingsCount, commentsCount }
  }

  // Movie comments
  async createMovieComment(commentData) {
    const comments = this.db.collection('movie_comments')
    const result = await comments.insertOne({
      ...commentData,
      likes: 0,
      likedBy: [],
      createdAt: new Date(),
      updatedAt: new Date()
    })
    return result.insertedId
  }

  async getMovieComments(movieId, limit = 20, skip = 0) {
    const comments = this.db.collection('movie_comments')
    const cursor = comments.find({ movieId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)

    const commentsArray = await cursor.toArray()
    const totalCount = await comments.countDocuments({ movieId })

    return {
      comments: commentsArray,
      pagination: {
        page: Math.floor(skip / limit) + 1,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    }
  }

  async getUserComments(userId, limit = 20, skip = 0) {
    const comments = this.db.collection('movie_comments')
    const cursor = comments.find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)

    const commentsArray = await cursor.toArray()
    const totalCount = await comments.countDocuments({ userId: new ObjectId(userId) })

    return {
      comments: commentsArray,
      pagination: {
        page: Math.floor(skip / limit) + 1,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    }
  }

  async updateCommentLikes(commentId, increment, userId) {
    const comments = this.db.collection('movie_comments')

    if (increment > 0) {
      // Like - add user to likedBy if not already there
      await comments.updateOne(
        { _id: new ObjectId(commentId) },
        {
          $inc: { likes: 1 },
          $addToSet: { likedBy: new ObjectId(userId) }
        }
      )
    } else {
      // Unlike - remove user from likedBy
      await comments.updateOne(
        { _id: new ObjectId(commentId) },
        {
          $inc: { likes: -1 },
          $pull: { likedBy: new ObjectId(userId) }
        }
      )
    }
  }

  async deleteMovieComment(commentId, userId) {
    const comments = this.db.collection('movie_comments')
    const result = await comments.deleteOne({
      _id: new ObjectId(commentId),
      userId: new ObjectId(userId)
    })

    return result.deletedCount > 0
  }

  // Movie ratings
  async createMovieRating(ratingData) {
    const ratings = this.db.collection('movie_ratings')
    const result = await ratings.insertOne({
      ...ratingData,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    return result.insertedId
  }

  async getMovieRatings(movieId, limit = 20, skip = 0) {
    const ratings = this.db.collection('movie_ratings')
    const cursor = ratings.find({ movieId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)

    const ratingsArray = await cursor.toArray()
    const totalCount = await ratings.countDocuments({ movieId })

    return {
      ratings: ratingsArray,
      pagination: {
        page: Math.floor(skip / limit) + 1,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    }
  }

  async getUserRatings(userId, limit = 20, skip = 0) {
    const ratings = this.db.collection('movie_ratings')
    const cursor = ratings.find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)

    const ratingsArray = await cursor.toArray()
    const totalCount = await ratings.countDocuments({ userId: new ObjectId(userId) })

    return {
      ratings: ratingsArray,
      pagination: {
        page: Math.floor(skip / limit) + 1,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    }
  }

  async getMovieRating(movieId, userId) {
    const ratings = this.db.collection('movie_ratings')
    return await ratings.findOne({
      movieId,
      userId: new ObjectId(userId)
    })
  }

  async getAverageMovieRating(movieId) {
    const ratings = this.db.collection('movie_ratings')
    const pipeline = [
      { $match: { movieId } },
      { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]

    const result = await ratings.aggregate(pipeline).toArray()
    return result.length > 0 ? result[0].average : null
  }

  async updateMovieRating(ratingId, updates) {
    const ratings = this.db.collection('movie_ratings')
    const result = await ratings.updateOne(
      { _id: new ObjectId(ratingId) },
      {
        $set: {
          ...updates,
          updatedAt: new Date()
        }
      }
    )

    return result.modifiedCount > 0
  }

  // Watchlist
  async addToWatchlist(userId, movieId, notes = null, priority = 'medium') {
    const watchlist = this.db.collection('watchlist')
    const result = await watchlist.insertOne({
      userId: new ObjectId(userId),
      movieId,
      notes: notes || '',
      priority,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    return result.insertedId
  }

  async getWatchlist(userId, limit = 20, skip = 0) {
    const watchlist = this.db.collection('watchlist')
    const cursor = watchlist.find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)

    const watchlistArray = await cursor.toArray()
    const totalCount = await watchlist.countDocuments({ userId: new ObjectId(userId) })

    return {
      watchlist: watchlistArray,
      pagination: {
        limit,
        skip,
        totalCount
      }
    }
  }

  async getWatchlistWithMovieDetails(userId, limit = 20, skip = 0) {
    // This is a simplified version - you might want to enhance this with actual movie details
    const watchlist = await this.getWatchlist(userId, limit, skip)
    return watchlist
  }

  async isInWatchlist(userId, movieId) {
    const watchlist = this.db.collection('watchlist')
    const item = await watchlist.findOne({
      userId: new ObjectId(userId),
      movieId
    })
    return item !== null
  }

  async updateWatchlistItem(userId, movieId, updates) {
    const watchlist = this.db.collection('watchlist')
    const result = await watchlist.updateOne(
      {
        userId: new ObjectId(userId),
        movieId
      },
      {
        $set: {
          ...updates,
          updatedAt: new Date()
        }
      }
    )

    return result.modifiedCount > 0
  }

  async removeFromWatchlist(userId, movieId) {
    const watchlist = this.db.collection('watchlist')
    const result = await watchlist.deleteOne({
      userId: new ObjectId(userId),
      movieId
    })

    return result.deletedCount > 0
  }

  // Sessions
  async createSession(sessionData) {
    const sessions = this.db.collection('sessions')
    const result = await sessions.insertOne(sessionData)
    return result.insertedId
  }

  async verifySession(token) {
    const sessions = this.db.collection('sessions')
    const users = this.db.collection('users')

    const session = await sessions.findOne({
      token,
      expiresAt: { $gt: new Date() }
    })

    if (!session) return null

    const user = await users.findOne({ _id: new ObjectId(session.userId) })
    return user
  }

  async destroySession(token) {
    const sessions = this.db.collection('sessions')
    const result = await sessions.deleteOne({ token })
    return result.deletedCount > 0
  }

  // API logging
  async insertApiLog(logData) {
    if (!this.isConnected) return

    const logs = this.db.collection('api_logs')
    await logs.insertOne({
      ...logData,
      timestamp: new Date()
    })
  }

  async selectLogs(limit = 50) {
    if (!this.isConnected) return []

    const logs = this.db.collection('api_logs')
    return await logs.find({})
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray()
  }

  // Caching (simplified version)
  async cacheResponse(key, data) {
    if (!this.isConnected) return

    const cache = this.db.collection('cache')
    await cache.updateOne(
      { key },
      {
        $set: {
          data,
          createdAt: new Date()
        }
      },
      { upsert: true }
    )
  }

  async getCachedResponse(key) {
    if (!this.isConnected) return null

    const cache = this.db.collection('cache')
    const cached = await cache.findOne({ key })

    if (!cached) return null

    // Check if cache is expired (24 hours for now)
    const now = new Date()
    const cachedTime = new Date(cached.createdAt)
    const hoursDiff = (now - cachedTime) / (1000 * 60 * 60)

    if (hoursDiff > 24) return null

    return cached
  }

  async updateCachedResponse(key, data) {
    if (!this.isConnected) return

    const cache = this.db.collection('cache')
    await cache.updateOne(
      { key },
      {
        $set: {
          data,
          updatedAt: new Date()
        }
      }
    )
  }
}

// Create singleton instance
const db = new Database()

// Export the instance
module.exports = { db }