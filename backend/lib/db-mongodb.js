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
      emailVerified: false,
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
      passwordResetToken: null,
      passwordResetExpiresAt: null
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

  async findUserByEmail(email) {
    const users = this.db.collection('users')
    return await users.findOne({ email })
  }

  async findUserByUsername(username) {
    const users = this.db.collection('users')
    return await users.findOne({ username })
  }

  async findUserByVerificationToken(token) {
    const users = this.db.collection('users')
    return await users.findOne({
      emailVerificationToken: token,
      emailVerificationExpiresAt: { $gt: new Date() }
    })
  }

  async findUserByPasswordResetToken(token) {
    const users = this.db.collection('users')
    return await users.findOne({
      passwordResetToken: token,
      passwordResetExpiresAt: { $gt: new Date() }
    })
  }

  async setEmailVerificationToken(userId, token, expiresAt) {
    const users = this.db.collection('users')
    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          emailVerificationToken: token,
          emailVerificationExpiresAt: expiresAt,
          updatedAt: new Date()
        }
      }
    )
    return result.modifiedCount > 0
  }

  async verifyEmail(userId) {
    const users = this.db.collection('users')
    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          emailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpiresAt: null,
          updatedAt: new Date()
        }
      }
    )
    return result.modifiedCount > 0
  }

  async setPasswordResetToken(userId, token, expiresAt) {
    const users = this.db.collection('users')
    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          passwordResetToken: token,
          passwordResetExpiresAt: expiresAt,
          updatedAt: new Date()
        }
      }
    )
    return result.modifiedCount > 0
  }

  async updatePassword(userId, hashedPassword) {
    const users = this.db.collection('users')
    const result = await users.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          password: hashedPassword,
          passwordResetToken: null,
          passwordResetExpiresAt: null,
          updatedAt: new Date()
        }
      }
    )
    return result.modifiedCount > 0
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

  async getUserById(userId) {
    const users = this.db.collection('users')
    return await users.findOne({ _id: new ObjectId(userId) })
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

  // Watchlist Collections (named collections with movies and shows)
  async createWatchlistCollection(userId, name, description = null, emoji = null) {
    const collections = this.db.collection('watchlist_collections')
    const data = {
      userId: new ObjectId(userId),
      name,
      description: description || '',
      emoji: emoji || '',
      itemCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    const result = await collections.insertOne(data)
    return result.insertedId
  }

  async getUserWatchlistCollections(userId) {
    const collections = this.db.collection('watchlist_collections')
    const cursor = collections.find({ userId: new ObjectId(userId) })
      .sort({ createdAt: 1 })
    const watchlistCollections = await cursor.toArray()
    return watchlistCollections
  }

  async updateWatchlistCollection(userId, collectionId, updates) {
    const collections = this.db.collection('watchlist_collections')
    const result = await collections.updateOne(
      {
        _id: new ObjectId(collectionId),
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

  async deleteWatchlistCollection(userId, collectionId) {
    const collections = this.db.collection('watchlist_collections')
    const watchlistItems = this.db.collection('watchlist_items')

    // Delete the collection
    const collectionResult = await collections.deleteOne({
      _id: new ObjectId(collectionId),
      userId: new ObjectId(userId)
    })

    // Delete all items in this collection
    await watchlistItems.deleteMany({
      collectionId: new ObjectId(collectionId),
      userId: new ObjectId(userId)
    })

    return collectionResult.deletedCount > 0
  }

  async addToWatchlistCollection(userId, collectionId, contentType, contentId, notes = null) {
    const watchlistItems = this.db.collection('watchlist_items')

    // Check if item already exists in this collection
    const existingItem = await watchlistItems.findOne({
      collectionId: new ObjectId(collectionId),
      userId: new ObjectId(userId),
      [contentType === 'movie' ? 'movieId' : 'showId']: contentId
    })

    if (existingItem) {
      throw new Error('Item already exists in this watchlist collection')
    }

    const data = {
      collectionId: new ObjectId(collectionId),
      userId: new ObjectId(userId),
      notes: notes || '',
      createdAt: new Date(),
      updatedAt: new Date()
    }

    if (contentType === 'movie') {
      data.movieId = contentId
    } else if (contentType === 'show') {
      data.showId = contentId
    }

    const result = await watchlistItems.insertOne(data)

    // Update collection item count
    await this.updateWatchlistCollectionItemCount(collectionId)

    return result.insertedId
  }

  async getWatchlistCollectionItems(userId, collectionId, limit = 20, skip = 0, includeDetails = false) {
    const watchlistItems = this.db.collection('watchlist_items')
    const query = {
      collectionId: new ObjectId(collectionId),
      userId: new ObjectId(userId)
    }

    const cursor = watchlistItems.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)

    const items = await cursor.toArray()
    const totalCount = await watchlistItems.countDocuments(query)

    let itemsWithDetails = items
    if (includeDetails && items.length > 0) {
      itemsWithDetails = await this.addDetailsToWatchlistItems(items)
    }

    return {
      items: itemsWithDetails,
      pagination: {
        limit,
        skip,
        totalCount
      }
    }
  }

  async addDetailsToWatchlistItems(items) {
    const BASE_URL = process.env.TRAKT_BASE_URL || "https://api.trakt.tv"
    const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID
    const TRAKT_API_VERSION = process.env.TRAKT_API_VERSION || "2"

    if (!TRAKT_CLIENT_ID) {
      return items
    }

    const itemsWithDetails = await Promise.all(
      items.map(async (item) => {
        try {
          let url, contentDetails
          const contentId = item.movieId || item.showId
          const contentType = item.movieId ? 'movie' : 'show'

          if (contentType === 'movie') {
            url = `${BASE_URL}/movies/${contentId}?extended=full`
          } else if (contentType === 'show') {
            url = `${BASE_URL}/shows/${contentId}?extended=full`
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
            return {
              ...item,
              type: contentType,
              [contentType]: contentDetails
            }
          } else {
            return {
              ...item,
              type: contentType
            }
          }
        } catch (error) {
          const id = item.movieId || item.showId
          console.error(`Failed to fetch details for ${id}:`, error)
          return {
            ...item,
            type: item.movieId ? 'movie' : 'show'
          }
        }
      })
    )

    return itemsWithDetails
  }

  async updateWatchlistCollectionItemCount(collectionId) {
    const watchlistItems = this.db.collection('watchlist_items')
    const collections = this.db.collection('watchlist_collections')

    const itemCount = await watchlistItems.countDocuments({
      collectionId: new ObjectId(collectionId)
    })

    await collections.updateOne(
      { _id: new ObjectId(collectionId) },
      {
        $set: {
          itemCount,
          updatedAt: new Date()
        }
      }
    )
  }

  async updateWatchlistItem(userId, collectionId, itemId, updates) {
    const watchlistItems = this.db.collection('watchlist_items')
    const result = await watchlistItems.updateOne(
      {
        _id: new ObjectId(itemId),
        collectionId: new ObjectId(collectionId),
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

  async removeFromWatchlistCollection(userId, collectionId, itemId) {
    const watchlistItems = this.db.collection('watchlist_items')
    const result = await watchlistItems.deleteOne({
      _id: new ObjectId(itemId),
      collectionId: new ObjectId(collectionId),
      userId: new ObjectId(userId)
    })

    if (result.deletedCount > 0) {
      await this.updateWatchlistCollectionItemCount(collectionId)
    }

    return result.deletedCount > 0
  }

  async isInWatchlistCollection(userId, collectionId, contentType, contentId) {
    const watchlistItems = this.db.collection('watchlist_items')
    const query = {
      collectionId: new ObjectId(collectionId),
      userId: new ObjectId(userId),
      [contentType === 'movie' ? 'movieId' : 'showId']: contentId
    }
    const item = await watchlistItems.findOne(query)
    return item !== null
  }

  // Legacy methods for backward compatibility
  async addToWatchlist(userId, contentType, contentId, notes = null, priority = 'medium') {
    // Create a default collection if none exists
    const collections = await this.getUserWatchlistCollections(userId)
    let defaultCollection

    if (collections.length === 0) {
      const collectionId = await this.createWatchlistCollection(userId, 'Watchlist', 'Default watchlist collection', '📝')
      defaultCollection = collectionId
    } else {
      defaultCollection = collections[0]._id
    }

    return await this.addToWatchlistCollection(userId, defaultCollection, contentType, contentId, notes)
  }

  async addToMovieWatchlist(userId, movieId, notes = null, priority = 'medium') {
    return await this.addToWatchlist(userId, 'movie', movieId, notes, priority)
  }

  async addToShowWatchlist(userId, showId, notes = null, priority = 'medium') {
    return await this.addToWatchlist(userId, 'show', showId, notes, priority)
  }

  async getWatchlist(userId, limit = 20, skip = 0) {
    const collections = await this.getUserWatchlistCollections(userId)
    if (collections.length === 0) {
      return {
        collections: [],
        items: [],
        pagination: {
          limit,
          skip,
          totalCount: 0
        }
      }
    }

    // Get items from the first collection (for backward compatibility)
    const firstCollection = collections[0]
    const itemsResult = await this.getWatchlistCollectionItems(userId, firstCollection._id, limit, skip)

    return {
      collections: collections,
      items: itemsResult.items,
      pagination: itemsResult.pagination
    }
  }

  async getWatchlistWithDetails(userId, limit = 20, skip = 0) {
    const collections = await this.getUserWatchlistCollections(userId)
    if (collections.length === 0) {
      return {
        collections: [],
        items: [],
        pagination: {
          limit,
          skip,
          totalCount: 0
        }
      }
    }

    // Get items with details from the first collection (for backward compatibility)
    const firstCollection = collections[0]
    const itemsResult = await this.getWatchlistCollectionItems(userId, firstCollection._id, limit, skip, true)

    return {
      collections: collections,
      items: itemsResult.items,
      pagination: itemsResult.pagination
    }
  }

  async isInWatchlist(userId, contentType, contentId) {
    const collections = await this.getUserWatchlistCollections(userId)
    if (collections.length === 0) {
      return false
    }

    // Check the first collection (for backward compatibility)
    return await this.isInWatchlistCollection(userId, collections[0]._id, contentType, contentId)
  }

  async isInMovieWatchlist(userId, movieId) {
    return await this.isInWatchlist(userId, 'movie', movieId)
  }

  async isInShowWatchlist(userId, showId) {
    return await this.isInWatchlist(userId, 'show', showId)
  }

  async updateWatchlistItem(userId, contentType, contentId, updates) {
    const collections = await this.getUserWatchlistCollections(userId)
    if (collections.length === 0) {
      return false
    }

    const watchlistItems = this.db.collection('watchlist_items')
    const query = {
      collectionId: new ObjectId(collections[0]._id),
      userId: new ObjectId(userId),
      [contentType === 'movie' ? 'movieId' : 'showId']: contentId
    }

    const result = await watchlistItems.updateOne(
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
    const collections = await this.getUserWatchlistCollections(userId)
    if (collections.length === 0) {
      return false
    }

    const watchlistItems = this.db.collection('watchlist_items')
    const query = {
      collectionId: new ObjectId(collections[0]._id),
      userId: new ObjectId(userId),
      [contentType === 'movie' ? 'movieId' : 'showId']: contentId
    }
    const result = await watchlistItems.deleteOne(query)

    if (result.deletedCount > 0) {
      await this.updateWatchlistCollectionItemCount(collections[0]._id)
    }

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

  // Subscription management
  async insertSubscription(subscriptionData) {
    if (!this.isConnected) throw new Error("Database not configured")

    const subscriptions = this.db.collection('subscriptions')
    const result = await subscriptions.insertOne({
      ...subscriptionData,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    return result.insertedId
  }

  async updateSubscription(subscriptionId, updates) {
    if (!this.isConnected) throw new Error("Database not configured")

    const subscriptions = this.db.collection('subscriptions')
    const result = await subscriptions.updateOne(
      { stripeSubscriptionId: subscriptionId },
      {
        $set: {
          ...updates,
          updatedAt: new Date()
        }
      }
    )
    return result.modifiedCount > 0
  }

  async getUserSubscriptions(userId, status = null) {
    if (!this.isConnected) throw new Error("Database not configured")

    const subscriptions = this.db.collection('subscriptions')
    const query = { userId: new ObjectId(userId) }

    if (status) {
      query.status = status
    }

    const cursor = subscriptions.find(query)
      .sort({ createdAt: -1 })
    return await cursor.toArray()
  }

  async getUserActiveSubscription(userId) {
    if (!this.isConnected) throw new Error("Database not configured")

    const subscriptions = this.db.collection('subscriptions')
    const subscription = await subscriptions.findOne({
      userId: new ObjectId(userId),
      status: 'active',
      currentPeriodEnd: { $gt: new Date() }
    })
    return subscription
  }

  async getSubscriptionByStripeId(stripeSubscriptionId) {
    if (!this.isConnected) throw new Error("Database not configured")

    const subscriptions = this.db.collection('subscriptions')
    return await subscriptions.findOne({ stripeSubscriptionId })
  }

  // Packages management
  async insertPackage(packageData) {
    if (!this.isConnected) throw new Error("Database not configured")

    const packages = this.db.collection('packages')
    const result = await packages.insertOne({
      ...packageData,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    return result.insertedId
  }

  async getAllPackages(status = 'active') {
    if (!this.isConnected) throw new Error("Database not configured")

    const packages = this.db.collection('packages')
    const query = status ? { status } : {}
    const cursor = packages.find(query)
      .sort({ price: 1, sortOrder: 1 })
    return await cursor.toArray()
  }

  async getPackageById(packageId) {
    if (!this.isConnected) throw new Error("Database not configured")

    const packages = this.db.collection('packages')
    return await packages.findOne({ _id: new ObjectId(packageId) })
  }

  async updatePackage(packageId, updates) {
    if (!this.isConnected) throw new Error("Database not configured")

    const packages = this.db.collection('packages')
    const result = await packages.updateOne(
      { _id: new ObjectId(packageId) },
      {
        $set: {
          ...updates,
          updatedAt: new Date()
        }
      }
    )
    return result.modifiedCount > 0
  }

  // Stripe events storage
  async insertStripeEvent(eventData) {
    if (!this.isConnected) return

    const stripeEvents = this.db.collection('stripe_events')
    await stripeEvents.insertOne(eventData)
  }

  async getStripeEvents(limit = 50, skip = 0) {
    if (!this.isConnected) throw new Error("Database not configured")

    const stripeEvents = this.db.collection('stripe_events')
    const cursor = stripeEvents.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
    return await cursor.toArray()
  }

  async getStripeEventsByUserId(userId, limit = 50, skip = 0) {
    if (!this.isConnected) throw new Error("Database not configured")

    const stripeEvents = this.db.collection('stripe_events')
    const cursor = stripeEvents.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
    return await cursor.toArray()
  }

  async markStripeEventProcessed(eventId) {
    if (!this.isConnected) throw new Error("Database not configured")

    const stripeEvents = this.db.collection('stripe_events')
    const result = await stripeEvents.updateOne(
      { stripeEventId: eventId },
      {
        $set: {
          processed: true,
          processedAt: new Date()
        }
      }
    )
    return result.modifiedCount > 0
  }

  // Customer portal sessions
  async insertPortalSession(sessionData) {
    if (!this.isConnected) throw new Error("Database not configured")

    const sessions = this.db.collection('stripe_portal_sessions')
    const result = await sessions.insertOne({
      ...sessionData,
      createdAt: new Date()
    })
    return result.insertedId
  }

  // Get cached movie/show data from Trakt API cache
  async getCachedMovieData(movieId) {
    if (!this.isConnected) return null

    // Try to find cached movie data from the cache collection
    const cache = this.db.collection('cache')
    const cacheKey = `trakt-movies-${movieId}`

    const cached = await cache.findOne({ key: cacheKey })
    if (!cached) return null

    // Check if cache is expired (24 hours)
    const now = new Date()
    const cachedTime = new Date(cached.createdAt)
    const hoursDiff = (now - cachedTime) / (1000 * 60 * 60)
    if (hoursDiff > 24) return null

    const movieData = cached.data
    return {
      title: movieData.title,
      year: movieData.year,
      overview: movieData.overview || movieData.tagline,
      rating: movieData.rating,
      votes: movieData.votes,
      runtime: movieData.runtime,
      genres: movieData.genres,
      released: movieData.released,
      ids: movieData.ids,
      tagline: movieData.tagline,
      country: movieData.country,
      language: movieData.language,
      status: movieData.status,
      homepage: movieData.homepage,
      trailer: movieData.trailer,
      images: movieData.images
    }
  }

  async getCachedShowData(showId) {
    if (!this.isConnected) return null

    // Try to find cached show data from the cache collection
    const cache = this.db.collection('cache')
    const cacheKey = `trakt-shows-${showId}`

    const cached = await cache.findOne({ key: cacheKey })
    if (!cached) return null

    // Check if cache is expired (24 hours)
    const now = new Date()
    const cachedTime = new Date(cached.createdAt)
    const hoursDiff = (now - cachedTime) / (1000 * 60 * 60)
    if (hoursDiff > 24) return null

    const showData = cached.data
    return {
      title: showData.title,
      year: showData.year,
      overview: showData.overview,
      rating: showData.rating,
      votes: showData.votes,
      runtime: showData.runtime,
      genres: showData.genres,
      status: showData.status,
      first_aired: showData.first_aired,
      airs: showData.airs,
      network: showData.network,
      country: showData.country,
      language: showData.language,
      ids: showData.ids,
      aired_episodes: showData.aired_episodes,
      episode_count: showData.episode_count,
      seasons: showData.seasons,
      homepage: showData.homepage,
      trailer: showData.trailer,
      images: showData.images
    }
  }

  // Add movie/show data to watchlist item
  async addToWatchlistWithData(userId, contentType, contentId, notes, priority) {
    if (!this.isConnected) throw new Error("Database not configured")

    // Get cached movie/show data
    let contentData = null
    if (contentType === 'movie') {
      contentData = await this.getCachedMovieData(contentId)
    } else if (contentType === 'show') {
      contentData = await this.getCachedShowData(contentId)
    }

    // Add to watchlist with content data
    const watchlistItems = this.db.collection('watchlist_items')
    const itemData = {
      userId: new ObjectId(userId),
      [contentType === 'movie' ? 'movieId' : 'showId']: contentId,
      notes: notes || '',
      priority: priority || 'medium',
      contentType: contentType,
      contentData: contentData,
      createdAt: new Date(),
      updatedAt: new Date()
    }

    const result = await watchlistItems.insertOne(itemData)
    return result.insertedId
  }

  // Get watchlist filtered by content type
  async getWatchlist(userId, limit = 20, skip = 0, showsOnly = false) {
    if (!this.isConnected) throw new Error("Database not configured")

    const watchlistItems = this.db.collection('watchlist_items')
    let query = { userId: new ObjectId(userId) }

    // Filter by content type if showsOnly is true
    if (showsOnly) {
      query.showId = { $exists: true }
    }

    const cursor = watchlistItems.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)

    const items = await cursor.toArray()
    const totalCount = await watchlistItems.countDocuments(query)

    return {
      watchlist: items,
      pagination: {
        limit: parseInt(limit),
        skip: parseInt(skip),
        totalCount: parseInt(totalCount)
      }
    }
  }
}

// Create singleton instance
const db = new Database()

// Export the instance
module.exports = { db }