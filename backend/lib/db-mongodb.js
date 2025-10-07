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

  // Comments (works for both movies and shows)
  async createComment(commentData) {
    const comments = this.db.collection('comments')
    const result = await comments.insertOne({
      ...commentData,
      likes: 0,
      likedBy: [],
      createdAt: new Date(),
      updatedAt: new Date()
    })
    return result.insertedId
  }

  async createMovieComment(commentData) {
    // Legacy method - delegates to generic method
    return await this.createComment({ ...commentData, type: 'movie' })
  }

  async getComments(contentType, contentId, limit = 20, skip = 0, currentUserId = null) {
    const comments = this.db.collection('comments')
    const users = this.db.collection('users')

    const query = contentType === 'movie' ? { movieId: contentId } : { showId: contentId }

    const cursor = comments.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)

    const commentsArray = await cursor.toArray()

    // Fetch user information for each comment
    const commentsWithUsers = await Promise.all(
      commentsArray.map(async (comment) => {
        const user = await users.findOne(
          { _id: new ObjectId(comment.userId) },
          { projection: { _id: 1, username: 1, firstName: 1, lastName: 1 } }
        )

        // Check if current user has liked this comment
        let isLikedByCurrentUser = false
        if (currentUserId) {
          isLikedByCurrentUser = comment.likedBy.some(
            likedUserId => likedUserId.toString() === currentUserId.toString()
          )
        }

        return {
          ...comment,
          user: user ? {
            _id: user._id,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName
          } : null,
          isLikedByCurrentUser
        }
      })
    )

    const totalCount = await comments.countDocuments(query)

    return {
      comments: commentsWithUsers,
      pagination: {
        page: Math.floor(skip / limit) + 1,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    }
  }

  async getMovieComments(movieId, limit = 20, skip = 0, currentUserId = null) {
    return await this.getComments('movie', movieId, limit, skip, currentUserId)
  }

  async getShowComments(showId, limit = 20, skip = 0, currentUserId = null) {
    return await this.getComments('show', showId, limit, skip, currentUserId)
  }

  async getUserComments(userId, limit = 20, skip = 0) {
    const comments = this.db.collection('comments')
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

  async updateCommentLikes(commentId, userId) {
    const comments = this.db.collection('comments')
    
    // First check if user has already liked this comment
    const comment = await comments.findOne({ _id: new ObjectId(commentId) })
    if (!comment) {
      throw new Error('Comment not found')
    }
    
    const hasLiked = comment.likedBy.some(
      likedUserId => likedUserId.toString() === userId.toString()
    )
    
    if (hasLiked) {
      // Unlike - remove user from likedBy and decrement likes
      await comments.updateOne(
        { _id: new ObjectId(commentId) },
        {
          $inc: { likes: -1 },
          $pull: { likedBy: new ObjectId(userId) }
        }
      )
      return { action: 'unliked', likes: comment.likes - 1 }
    } else {
      // Like - add user to likedBy and increment likes
      await comments.updateOne(
        { _id: new ObjectId(commentId) },
        {
          $inc: { likes: 1 },
          $addToSet: { likedBy: new ObjectId(userId) }
        }
      )
      return { action: 'liked', likes: comment.likes + 1 }
    }
  }

  async deleteComment(commentId, userId) {
    const comments = this.db.collection('comments')
    const result = await comments.deleteOne({
      _id: new ObjectId(commentId),
      userId: new ObjectId(userId)
    })

    return result.deletedCount > 0
  }

  async deleteMovieComment(commentId, userId) {
    // Legacy method - delegates to generic method
    return await this.deleteComment(commentId, userId)
  }

  async deleteShowComment(commentId, userId) {
    // Legacy method - delegates to generic method
    return await this.deleteComment(commentId, userId)
  }

  async updateComment(commentId, userId, updates) {
    const comments = this.db.collection('comments')
    const result = await comments.updateOne(
      {
        _id: new ObjectId(commentId),
        userId: new ObjectId(userId)
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

  async updateMovieComment(commentId, userId, updates) {
    // Legacy method - delegates to generic method
    return await this.updateComment(commentId, userId, updates)
  }

  async updateShowComment(commentId, userId, updates) {
    // Legacy method - delegates to generic method
    return await this.updateComment(commentId, userId, updates)
  }

  // Ratings (works for both movies and shows)
  async createRating(ratingData) {
    const ratings = this.db.collection('ratings')
    const result = await ratings.insertOne({
      ...ratingData,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    return result.insertedId
  }

  async createMovieRating(ratingData) {
    // Legacy method - delegates to generic method
    return await this.createRating({ ...ratingData, type: 'movie' })
  }

  async getRatings(contentType, contentId, limit = 20, skip = 0) {
    const ratings = this.db.collection('ratings')
    const users = this.db.collection('users')

    const query = contentType === 'movie' ? { movieId: contentId } : { showId: contentId }

    const cursor = ratings.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)

    const ratingsArray = await cursor.toArray()

    // Fetch user information for each rating
    const ratingsWithUsers = await Promise.all(
      ratingsArray.map(async (rating) => {
        const user = await users.findOne(
          { _id: new ObjectId(rating.userId) },
          { projection: { _id: 1, username: 1, firstName: 1, lastName: 1 } }
        )

        return {
          ...rating,
          user: user ? {
            _id: user._id,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName
          } : null
        }
      })
    )

    const totalCount = await ratings.countDocuments(query)

    return {
      ratings: ratingsWithUsers,
      pagination: {
        page: Math.floor(skip / limit) + 1,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    }
  }

  async getMovieRatings(movieId, limit = 20, skip = 0) {
    return await this.getRatings('movie', movieId, limit, skip)
  }

  async getShowRatings(showId, limit = 20, skip = 0) {
    return await this.getRatings('show', showId, limit, skip)
  }

  async getUserRatings(userId, limit = 20, skip = 0) {
    const ratings = this.db.collection('ratings')
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

  async getRating(contentType, contentId, userId) {
    const ratings = this.db.collection('ratings')
    const query = contentType === 'movie'
      ? { movieId: contentId, userId: new ObjectId(userId) }
      : { showId: contentId, userId: new ObjectId(userId) }
    return await ratings.findOne(query)
  }

  async getMovieRating(movieId, userId) {
    return await this.getRating('movie', movieId, userId)
  }

  async getShowRating(showId, userId) {
    return await this.getRating('show', showId, userId)
  }

  async getAverageRating(contentType, contentId) {
    const ratings = this.db.collection('ratings')
    const query = contentType === 'movie' ? { movieId: contentId } : { showId: contentId }
    const pipeline = [
      { $match: query },
      { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]

    const result = await ratings.aggregate(pipeline).toArray()
    return result.length > 0 ? result[0].average : null
  }

  async getAverageMovieRating(movieId) {
    return await this.getAverageRating('movie', movieId)
  }

  async getAverageShowRating(showId) {
    return await this.getAverageRating('show', showId)
  }

  async updateRating(ratingId, updates) {
    const ratings = this.db.collection('ratings')
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

  async updateMovieRating(ratingId, updates) {
    return await this.updateRating(ratingId, updates)
  }

  async updateShowRating(ratingId, updates) {
    return await this.updateRating(ratingId, updates)
  }

  async deleteRating(ratingId, userId) {
    const ratings = this.db.collection('ratings')
    const result = await ratings.deleteOne({
      _id: new ObjectId(ratingId),
      userId: new ObjectId(userId)
    })

    return result.deletedCount > 0
  }

  async deleteMovieRating(ratingId, userId) {
    return await this.deleteRating(ratingId, userId)
  }

  async deleteShowRating(ratingId, userId) {
    return await this.deleteRating(ratingId, userId)
  }

  // Watchlist (works for both movies and shows)
  async addToWatchlist(userId, contentType, contentId, notes = null, priority = 'medium') {
    const watchlist = this.db.collection('watchlist')
    const data = {
      userId: new ObjectId(userId),
      notes: notes || '',
      priority,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    if (contentType === 'movie') {
      data.movieId = contentId
    } else if (contentType === 'show') {
      data.showId = contentId
    }

    const result = await watchlist.insertOne(data)
    return result.insertedId
  }

  async addToMovieWatchlist(userId, movieId, notes = null, priority = 'medium') {
    // Legacy method - delegates to generic method
    return await this.addToWatchlist(userId, 'movie', movieId, notes, priority)
  }

  async addToShowWatchlist(userId, showId, notes = null, priority = 'medium') {
    // Legacy method - delegates to generic method
    return await this.addToWatchlist(userId, 'show', showId, notes, priority)
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

  async getWatchlistWithDetails(userId, limit = 20, skip = 0) {
    const watchlist = await this.getWatchlist(userId, limit, skip)

    if (!watchlist.watchlist || watchlist.watchlist.length === 0) {
      return watchlist
    }

    // Get details from Trakt API for each watchlist item
    const BASE_URL = process.env.TRAKT_BASE_URL || "https://api.trakt.tv"
    const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID
    const TRAKT_API_VERSION = process.env.TRAKT_API_VERSION || "2"

    if (!TRAKT_CLIENT_ID) {
      // Return basic watchlist if Trakt client ID is not configured
      return watchlist
    }

    const watchlistWithDetails = await Promise.all(
      watchlist.watchlist.map(async (item) => {
        try {
          let url, contentDetails

          if (item.movieId) {
            url = `${BASE_URL}/movies/${item.movieId}?extended=full`
          } else if (item.showId) {
            url = `${BASE_URL}/shows/${item.showId}?extended=full`
          }

          const response = await fetch(url, {
            headers: {
              "Content-Type": "application/json",
              "trakt-api-key": TRAKT_CLIENT_ID,
              "trakt-api-version": TRAKT_API_VERSION
            }
          })

          if (response.ok) {
            contentDetails = await response.json()
            if (item.movieId) {
              return { ...item, movie: contentDetails }
            } else if (item.showId) {
              return { ...item, show: contentDetails }
            }
          } else {
            return item
          }
        } catch (error) {
          const id = item.movieId || item.showId
          console.error(`Failed to fetch details for ${id}:`, error)
          return item
        }
      })
    )

    return {
      ...watchlist,
      watchlist: watchlistWithDetails
    }
  }

  async isInWatchlist(userId, contentType, contentId) {
    const watchlist = this.db.collection('watchlist')
    const query = {
      userId: new ObjectId(userId)
    }

    if (contentType === 'movie') {
      query.movieId = contentId
    } else if (contentType === 'show') {
      query.showId = contentId
    }

    const item = await watchlist.findOne(query)
    return item !== null
  }

  async isInMovieWatchlist(userId, movieId) {
    return await this.isInWatchlist(userId, 'movie', movieId)
  }

  async isInShowWatchlist(userId, showId) {
    return await this.isInWatchlist(userId, 'show', showId)
  }

  async updateWatchlistItem(userId, contentType, contentId, updates) {
    const watchlist = this.db.collection('watchlist')
    const query = {
      userId: new ObjectId(userId)
    }

    if (contentType === 'movie') {
      query.movieId = contentId
    } else if (contentType === 'show') {
      query.showId = contentId
    }

    const result = await watchlist.updateOne(
      query,
      {
        $set: {
          ...updates,
          updatedAt: new Date()
        }
      }
    )

    return result.modifiedCount > 0
  }

  async updateMovieWatchlistItem(userId, movieId, updates) {
    return await this.updateWatchlistItem(userId, 'movie', movieId, updates)
  }

  async updateShowWatchlistItem(userId, showId, updates) {
    return await this.updateWatchlistItem(userId, 'show', showId, updates)
  }

  async removeFromWatchlist(userId, contentType, contentId) {
    const watchlist = this.db.collection('watchlist')
    const query = {
      userId: new ObjectId(userId)
    }

    if (contentType === 'movie') {
      query.movieId = contentId
    } else if (contentType === 'show') {
      query.showId = contentId
    }

    const result = await watchlist.deleteOne(query)
    return result.deletedCount > 0
  }

  async removeFromMovieWatchlist(userId, movieId) {
    return await this.removeFromWatchlist(userId, 'movie', movieId)
  }

  async removeFromShowWatchlist(userId, showId) {
    return await this.removeFromWatchlist(userId, 'show', showId)
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
      accessToken: token,
      accessExpiresAt: { $gt: new Date() },
      isActive: true
    })

    if (!session) return null

    const user = await users.findOne({ _id: new ObjectId(session.userId) })
    return user
  }

  async findSessionByRefreshToken(refreshToken) {
    const sessions = this.db.collection('sessions')
    return await sessions.findOne({
      refreshToken,
      refreshExpiresAt: { $gt: new Date() },
      isActive: true
    })
  }

  async updateSessionAccessToken(sessionId, newAccessToken, newAccessExpiresAt) {
    const sessions = this.db.collection('sessions')
    const result = await sessions.updateOne(
      { _id: new ObjectId(sessionId) },
      {
        $set: {
          accessToken: newAccessToken,
          accessExpiresAt: newAccessExpiresAt,
          updatedAt: new Date()
        }
      }
    )
    return result.modifiedCount > 0
  }

  async destroySession(token) {
    const sessions = this.db.collection('sessions')
    const result = await sessions.deleteOne({ accessToken: token })
    return result.deletedCount > 0
  }

  async destroySessionByRefreshToken(refreshToken) {
    const sessions = this.db.collection('sessions')
    const result = await sessions.deleteOne({ refreshToken })
    return result.deletedCount > 0
  }

  async destroyAllUserSessions(userId) {
    const sessions = this.db.collection('sessions')
    const result = await sessions.deleteMany({
      userId: new ObjectId(userId)
    })
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