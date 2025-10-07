require('dotenv').config()
const express = require("express")
const cors = require("cors")
const app = express()

// Force enable console logging regardless of NODE_ENV
if (process.env.NODE_ENV === 'production') {
  console.log('=== BACKEND SERVER STARTING IN PRODUCTION MODE ===')
  console.log('Console logging is explicitly enabled')
  console.log('Environment variables:', {
    NODE_ENV: process.env.NODE_ENV,
    DEBUG: process.env.DEBUG,
    LOG_LEVEL: process.env.LOG_LEVEL,
    PORT: process.env.PORT
  })
}

// MongoDB database instance
const { db } = require('./lib/db-mongodb')
const { AuthService } = require('./lib/auth')

// Initialize database connection
async function initializeDatabase() {
  try {
    await db.connect()
    console.log('[app] Database initialized successfully')
  } catch (error) {
    console.error('[app] Failed to initialize database:', error)
    // Continue running but with limited functionality
  }
}

// Trakt config (server env)
const BASE_URL = (process.env.TRAKT_BASE_URL || "https://api.trakt.tv").replace(/\/+$/, "")
const TRAKT_CLIENT_ID = process.env.TRAKT_CLIENT_ID
const TRAKT_API_VERSION = process.env.TRAKT_API_VERSION || "2"

async function insertApiLog({ method, path, query, body, ip }) {
  if (!db.isConfigured()) return
  await db.insertApiLog({ method, path, query, body, ip })
}

async function selectLogs(limit = 50) {
  if (!db.isConfigured()) throw new Error("Database not configured")
  return await db.selectLogs(limit)
}

// Middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))

// Global CORS headers middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization")

  if (req.method === "OPTIONS") {
    return res.status(204).end()
  }

  next()
})

// Helper function to parse query parameters
function parseQueryParams(query) {
  const limit = Math.max(1, Math.min(100, Number(query.limit || 20)))
  const skip = Math.max(0, Number(query.skip || 0))
  return { limit, skip }
}

// Health check endpoint
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Trakt API Proxy",
    version: "1.0.0",
    status: "running",
    timestamp: new Date().toISOString()
  })
})

// Trakt proxy endpoints with MongoDB logging
app.all("/api/trakt/*", async (req, res) => {
  const path = req.originalUrl.replace("/api/trakt", "")
  const method = req.method
  const query = req.query
  const body = req.body
  const ip = req.ip

  try {
    if (!TRAKT_CLIENT_ID) {
      return res.status(500).json({ error: "TRAKT_CLIENT_ID not configured" })
    }

    const targetUrl = `${BASE_URL}${path}${Object.keys(query).length ? '?' + new URLSearchParams(query).toString() : ''}`

    const headers = {
      "Content-Type": "application/json",
      "trakt-api-key": TRAKT_CLIENT_ID,
      "trakt-api-version": TRAKT_API_VERSION
    }

    const response = await fetch(targetUrl, {
      method,
      headers,
      body: method !== "GET" ? JSON.stringify(body) : undefined
    })

    // Log API request asynchronously
    insertApiLog({ method, path, query: JSON.stringify(query), body: JSON.stringify(body), ip }).catch(e => console.error("Log insert failed:", e))

    const data = await response.json()

    res.status(response.status)
    res.set("x-proxied-by", "trakt-proxy")
    res.json(data)
  } catch (e) {
    console.error("Proxy error:", e)
    res.status(502).json({ error: "Upstream request failed", detail: e && e.message ? e.message : String(e) })
  }
})

// Trakt proxy endpoints with MongoDB caching
app.all("/api/trakt-new/*", async (req, res) => {
  const path = req.originalUrl.replace("/api/trakt-new", "")
  const method = req.method
  const query = req.query
  const body = req.body
  const ip = req.ip

  try {
    if (!TRAKT_CLIENT_ID) {
      return res.status(500).json({ error: "TRAKT_CLIENT_ID not configured" })
    }

    const targetUrl = `${BASE_URL}${path}${Object.keys(query).length ? '?' + new URLSearchParams(query).toString() : ''}`

    const headers = {
      "Content-Type": "application/json",
      "trakt-api-key": TRAKT_CLIENT_ID,
      "trakt-api-version": TRAKT_API_VERSION
    }

    let data, cacheStatus = "MISS"

    // Check cache for GET requests to specific endpoints
    if (method === "GET" && [
      "/movies/", "/shows/", "/search/", "/movies/trending/",
      "/shows/trending/", "/movies/popular/", "/shows/popular/"
    ].some(p => path.startsWith(p))) {

      const cacheKey = path + JSON.stringify(query)
      const cached = await db.getCachedResponse(cacheKey)

      if (cached) {
        // Handle both old format (with .data wrapper) and new format (direct)
        if (cached.data && cached.data.data) {
          // Old format with double nested .data
          data = cached.data.data
          cacheStatus = "HIT"
        } else if (cached.data) {
          // Old format with single .data wrapper
          data = cached.data
          cacheStatus = "HIT"
        } else {
          // New format (direct data)
          data = cached
          cacheStatus = cached._cacheStatus || "HIT"
          
          // Remove internal cache properties before returning
          if (data._hasImages !== undefined) delete data._hasImages
          if (data._cacheStatus !== undefined) delete data._cacheStatus
        }

        // Determine if images are available (for both old and new formats)
        const hasImages = cached._hasImages !== undefined ? cached._hasImages :
                          (cached.data && cached.data.hasImages !== undefined ? cached.data.hasImages : false)

        // If images are missing, fetch them separately
        if (!hasImages && path.startsWith("/movies/")) {
          try {
            const imagesUrl = `${BASE_URL}${path}?extended=images`
            const imagesResponse = await fetch(imagesUrl, { headers })
            const imagesData = await imagesResponse.json()

            if (imagesData.movie && imagesData.movie.images) {
              data.movie = { ...data.movie, images: imagesData.movie.images }
              // Update cache with images using new format
              await db.updateCachedResponse(cacheKey, { ...data, _hasImages: true, _cacheStatus: "HIT" })
            }
          } catch (e) {
            console.error("Failed to fetch images:", e)
          }
        }
      }
    }

    if (!data) {
      // Fetch data from Trakt API
      const response = await fetch(targetUrl, {
        method,
        headers,
        body: method !== "GET" ? JSON.stringify(body) : undefined
      })

      data = await response.json()

      // Cache the response for GET requests
      if (method === "GET") {
        const cacheKey = path + JSON.stringify(query)
        const hasImages = data.movie && data.movie.images
        // Store data directly without wrapper to avoid confusion
        await db.cacheResponse(cacheKey, { ...data, _hasImages: hasImages, _cacheStatus: "HIT" })
      }
    }

    res.status(200)
    res.set("x-proxied-by", "trakt-proxy")
    res.set("x-cache", cacheStatus)
    res.json(data)
  } catch (e) {
    console.error("Proxy error:", e)
    res.status(502).json({ error: "Upstream request failed", detail: e && e.message ? e.message : String(e) })
  }
})

// Auth API endpoints
app.post("/api/auth", async (req, res) => {
  try {
    const { action, ...data } = req.body

    switch (action) {
      case 'register':
        return await handleRegister(req, res, data)
      case 'login':
        return await handleLogin(req, res, data)
      case 'logout':
        return await handleLogout(req, res, data)
      case 'verify':
        return await handleVerify(req, res, data)
      case 'refresh':
        return await handleRefreshToken(req, res, data)
      default:
        return res.status(400).json({ error: 'Invalid action' })
    }
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

app.get("/api/auth", async (req, res) => {
  try {
    const action = req.query.action
    if (action !== 'verify') {
      return res.status(400).json({ error: 'Only verify action is supported for GET requests' })
    }

    const authHeader = req.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' })
    }

    const token = authHeader.substring(7)
    const user = await AuthService.verifySession(token)

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    return res.status(200).json({ user })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

// Refresh token endpoint
app.post("/api/auth/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' })
    }

    const tokens = await AuthService.refreshAccessToken(refreshToken)

    if (!tokens) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' })
    }

    return res.status(200).json(tokens)
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Token refresh failed' })
  }
})

// User Profile API endpoints
app.get("/api/user/profile", async (req, res) => {
  try {
    const authHeader = req.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' })
    }

    const token = authHeader.substring(7)
    const user = await AuthService.verifySession(token)

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const stats = await db.getUserStats(user._id)
    const userProfile = { ...user, stats }

    return res.status(200).json(userProfile)
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

app.put("/api/user/profile", async (req, res) => {
  try {
    const authHeader = req.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' })
    }

    const token = authHeader.substring(7)
    const user = await AuthService.verifySession(token)

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const { firstName, lastName, bio, avatar } = req.body
    const updates = {}

    if (firstName !== undefined) updates.firstName = firstName
    if (lastName !== undefined) updates.lastName = lastName
    if (bio !== undefined) updates.bio = bio
    if (avatar !== undefined) updates.avatar = avatar

    const updatedUser = await db.updateUser(user._id, updates)

    return res.status(200).json(updatedUser)
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

// Comments API endpoints
app.get("/api/comments", async (req, res) => {
  try {
    const { movieId, userId } = req.query
    const { limit, skip } = parseQueryParams(req.query)

    if (!movieId && !userId) {
      return res.status(400).json({ error: 'Either movieId or userId is required' })
    }

    let comments
    let currentUserId = null

    // Get current user if authenticated
    const authHeader = req.get('authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      const authUser = await AuthService.verifySession(token)
      if (authUser) {
        currentUserId = authUser._id
      }
    }

    if (movieId) {
      comments = await db.getMovieComments(movieId, limit, skip, currentUserId)
    } else if (userId) {
      if (!currentUserId || currentUserId.toString() !== userId) {
        return res.status(401).json({ error: 'Authentication required to view user comments' })
      }

      comments = await db.getUserComments(new (require('mongodb').ObjectId)(userId), limit, skip)
    }

    return res.status(200).json(comments)
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch comments' })
  }
})

app.post("/api/comments", async (req, res) => {
  try {
    const authHeader = req.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' })
    }

    const token = authHeader.substring(7)
    const user = await AuthService.verifySession(token)

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const { movieId, content, isSpoiler = false } = req.body

    if (!movieId) {
      return res.status(400).json({ error: 'Movie ID is required' })
    }

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' })
    }

    if (content.length > 2000) {
      return res.status(400).json({ error: 'Comment content must be less than 2000 characters' })
    }

    const commentId = await db.createMovieComment({
      userId: user._id,
      movieId,
      content: content.trim(),
      isSpoiler,
    })

    return res.status(201).json({
      message: 'Comment created successfully',
      commentId: commentId.toString()
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to create comment' })
  }
})

app.put("/api/comments", async (req, res) => {
  try {
    const authHeader = req.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' })
    }

    const token = authHeader.substring(7)
    const user = await AuthService.verifySession(token)

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const { commentId, action, content } = req.body

    if (!commentId) {
      return res.status(400).json({ error: 'Comment ID is required' })
    }

    if (action === 'toggleLike') {
      const result = await db.updateCommentLikes(
        new (require('mongodb').ObjectId)(commentId),
        user._id
      )

      return res.status(200).json({
        message: `Comment ${result.action} successfully`,
        action: result.action,
        likes: result.likes
      })
    }

    if (content !== undefined) {
      if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: 'Comment content is required' })
      }

      if (content.length > 2000) {
        return res.status(400).json({ error: 'Comment content must be less than 2000 characters' })
      }

      const updated = await db.updateMovieComment(
        new (require('mongodb').ObjectId)(commentId),
        user._id,
        { content: content.trim() }
      )

      if (!updated) {
        return res.status(404).json({ error: 'Comment not found or you do not have permission to edit it' })
      }

      return res.status(200).json({
        message: 'Comment updated successfully'
      })
    }

    return res.status(400).json({ error: 'Either action or content must be provided' })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to update comment' })
  }
})

app.delete("/api/comments", async (req, res) => {
  try {
    const authHeader = req.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' })
    }

    const token = authHeader.substring(7)
    const user = await AuthService.verifySession(token)

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const commentId = req.query.commentId

    if (!commentId) {
      return res.status(400).json({ error: 'Comment ID is required' })
    }

    const deleted = await db.deleteMovieComment(new (require('mongodb').ObjectId)(commentId), user._id)

    if (!deleted) {
      return res.status(404).json({ error: 'Comment not found or you do not have permission to delete it' })
    }

    return res.status(200).json({
      message: 'Comment deleted successfully'
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to delete comment' })
  }
})

// Ratings API endpoints
app.get("/api/ratings", async (req, res) => {
  try {
    const { movieId, userId, includeAverage } = req.query
    const { limit, skip } = parseQueryParams(req.query)

    if (!movieId && !userId) {
      return res.status(400).json({ error: 'Either movieId or userId is required' })
    }

    let result

    if (movieId) {
      result = await db.getMovieRatings(movieId, limit, skip)

      if (includeAverage === 'true') {
        const average = await db.getAverageMovieRating(movieId)
        result.average = average
      }

      const authHeader = req.get('authorization')
      let authUser = null

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        authUser = await AuthService.verifySession(token)
      }

      if (authUser) {
        const userRating = await db.getMovieRating(movieId, authUser._id)
        result.userRating = userRating
        if (includeAverage !== 'true') {
          result.average = null
        }
      }
    } else if (userId) {
      const authHeader = req.get('authorization')
      let authUser = null

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        authUser = await AuthService.verifySession(token)
      }

      if (!authUser || authUser._id.toString() !== userId) {
        return res.status(401).json({ error: 'Authentication required to view user ratings' })
      }

      result = await db.getUserRatings(new (require('mongodb').ObjectId)(userId), limit, skip)
    }

    return res.status(200).json(result)
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch ratings' })
  }
})

app.post("/api/ratings", async (req, res) => {
  try {
    const authHeader = req.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' })
    }

    const token = authHeader.substring(7)
    const user = await AuthService.verifySession(token)

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const { movieId, rating, review } = req.body

    if (!movieId) {
      return res.status(400).json({ error: 'Movie ID is required' })
    }

    if (typeof rating !== 'number' || rating < 1 || rating > 10) {
      return res.status(400).json({ error: 'Rating must be a number between 1 and 10' })
    }

    const existingRating = await db.getMovieRating(movieId, user._id)

    if (existingRating) {
      await db.updateMovieRating(existingRating._id, {
        rating,
        review: review?.trim() || null,
      })

      return res.status(200).json({
        message: 'Rating updated successfully',
        ratingId: existingRating._id.toString()
      })
    } else {
      const ratingId = await db.createMovieRating({
        userId: user._id,
        movieId,
        rating,
        review: review?.trim() || null,
      })

      return res.status(201).json({
        message: 'Rating created successfully',
        ratingId: ratingId.toString()
      })
    }
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to create/update rating' })
  }
})

app.delete("/api/ratings", async (req, res) => {
  try {
    const authHeader = req.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' })
    }

    const token = authHeader.substring(7)
    const user = await AuthService.verifySession(token)

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const movieId = req.query.movieId

    if (!movieId) {
      return res.status(400).json({ error: 'Movie ID is required' })
    }

    const existingRating = await db.getMovieRating(movieId, user._id)
    if (!existingRating) {
      return res.status(404).json({ error: 'Rating not found' })
    }

    const deleted = await db.deleteMovieRating(existingRating._id, user._id)

    if (!deleted) {
      return res.status(404).json({ error: 'Rating not found or you do not have permission to delete it' })
    }

    return res.status(200).json({
      message: 'Rating deleted successfully'
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to delete rating' })
  }
})

// Watchlist API endpoints
app.get("/api/watchlist", async (req, res) => {
  try {
    const authHeader = req.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' })
    }

    const token = authHeader.substring(7)
    const user = await AuthService.verifySession(token)

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const { limit, skip } = parseQueryParams(req.query)
    const includeDetails = req.query.includeDetails === 'true'

    let watchlist
    if (includeDetails) {
      watchlist = await db.getWatchlistWithMovieDetails(user._id, limit, skip)
    } else {
      watchlist = await db.getWatchlist(user._id, limit, skip)
    }

    return res.status(200).json(watchlist)
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch watchlist' })
  }
})

app.post("/api/watchlist", async (req, res) => {
  try {
    const authHeader = req.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' })
    }

    const token = authHeader.substring(7)
    const user = await AuthService.verifySession(token)

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const { movieId, notes, priority = 'medium' } = req.body

    if (!movieId) {
      return res.status(400).json({ error: 'Movie ID is required' })
    }

    if (!['low', 'medium', 'high'].includes(priority)) {
      return res.status(400).json({ error: 'Priority must be one of: low, medium, high' })
    }

    const alreadyInWatchlist = await db.isInWatchlist(user._id, movieId)
    if (alreadyInWatchlist) {
      return res.status(409).json({ error: 'Movie is already in watchlist' })
    }

    const watchlistItemId = await db.addToWatchlist(user._id, movieId, notes, priority)

    return res.status(201).json({
      message: 'Movie added to watchlist successfully',
      watchlistItemId: watchlistItemId.toString()
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to add movie to watchlist' })
  }
})

app.put("/api/watchlist", async (req, res) => {
  try {
    const authHeader = req.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' })
    }

    const token = authHeader.substring(7)
    const user = await AuthService.verifySession(token)

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const { movieId, notes, priority } = req.body

    if (!movieId) {
      return res.status(400).json({ error: 'Movie ID is required' })
    }

    if (!notes && !priority) {
      return res.status(400).json({ error: 'At least one field (notes or priority) must be provided' })
    }

    if (priority && !['low', 'medium', 'high'].includes(priority)) {
      return res.status(400).json({ error: 'Priority must be one of: low, medium, high' })
    }

    const updates = {}
    if (notes !== undefined) updates.notes = notes
    if (priority !== undefined) updates.priority = priority

    const updated = await db.updateWatchlistItem(user._id, movieId, updates)

    if (!updated) {
      return res.status(404).json({ error: 'Movie not found in watchlist' })
    }

    return res.status(200).json({ message: 'Watchlist item updated successfully' })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to update watchlist item' })
  }
})

app.delete("/api/watchlist", async (req, res) => {
  try {
    const authHeader = req.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' })
    }

    const token = authHeader.substring(7)
    const user = await AuthService.verifySession(token)

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const movieId = req.query.movieId

    if (!movieId) {
      return res.status(400).json({ error: 'Movie ID is required' })
    }

    const removed = await db.removeFromWatchlist(user._id, movieId)

    if (!removed) {
      return res.status(404).json({ error: 'Movie not found in watchlist' })
    }

    return res.status(200).json({ message: 'Movie removed from watchlist successfully' })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to remove movie from watchlist' })
  }
})

// Logs API endpoint
app.get("/api/logs", async (req, res) => {
  try {
    const authHeader = req.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' })
    }

    const token = authHeader.substring(7)
    const user = await AuthService.verifySession(token)

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const { limit, skip } = parseQueryParams(req.query)
    const logs = await selectLogs(limit)

    return res.status(200).json({
      logs: logs.slice(skip, skip + limit),
      pagination: {
        limit,
        skip,
        totalCount: logs.length
      }
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch logs', detail: e && e.message ? e.message : String(e) })
  }
})

// Show Comments API endpoints
app.get("/api/shows/comments", async (req, res) => {
  try {
    const { showId, userId } = req.query
    const { limit, skip } = parseQueryParams(req.query)

    if (!showId && !userId) {
      return res.status(400).json({ error: 'Either showId or userId is required' })
    }

    let comments
    let currentUserId = null

    // Get current user if authenticated
    const authHeader = req.get('authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      const authUser = await AuthService.verifySession(token)
      if (authUser) {
        currentUserId = authUser._id
      }
    }

    if (showId) {
      comments = await db.getShowComments(showId, limit, skip, currentUserId)
    } else if (userId) {
      if (!currentUserId || currentUserId.toString() !== userId) {
        return res.status(401).json({ error: 'Authentication required to view user comments' })
      }

      comments = await db.getUserComments(new (require('mongodb').ObjectId)(userId), limit, skip)
    }

    return res.status(200).json(comments)
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch comments' })
  }
})

app.post("/api/shows/comments", async (req, res) => {
  try {
    const authHeader = req.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' })
    }

    const token = authHeader.substring(7)
    const user = await AuthService.verifySession(token)

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const { showId, content, isSpoiler = false } = req.body

    if (!showId) {
      return res.status(400).json({ error: 'Show ID is required' })
    }

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Comment content is required' })
    }

    if (content.length > 2000) {
      return res.status(400).json({ error: 'Comment content must be less than 2000 characters' })
    }

    const commentId = await db.createComment({
      userId: user._id,
      showId,
      content: content.trim(),
      isSpoiler,
      type: 'show'
    })

    return res.status(201).json({
      message: 'Comment created successfully',
      commentId: commentId.toString()
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to create comment' })
  }
})

app.put("/api/shows/comments", async (req, res) => {
  try {
    const authHeader = req.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' })
    }

    const token = authHeader.substring(7)
    const user = await AuthService.verifySession(token)

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const { commentId, action, content } = req.body

    if (!commentId) {
      return res.status(400).json({ error: 'Comment ID is required' })
    }

    if (action === 'toggleLike') {
      const result = await db.updateCommentLikes(
        new (require('mongodb').ObjectId)(commentId),
        user._id
      )

      return res.status(200).json({
        message: `Comment ${result.action} successfully`,
        action: result.action,
        likes: result.likes
      })
    }

    if (content !== undefined) {
      if (!content || content.trim().length === 0) {
        return res.status(400).json({ error: 'Comment content is required' })
      }

      if (content.length > 2000) {
        return res.status(400).json({ error: 'Comment content must be less than 2000 characters' })
      }

      const updated = await db.updateShowComment(
        new (require('mongodb').ObjectId)(commentId),
        user._id,
        { content: content.trim() }
      )

      if (!updated) {
        return res.status(404).json({ error: 'Comment not found or you do not have permission to edit it' })
      }

      return res.status(200).json({
        message: 'Comment updated successfully'
      })
    }

    return res.status(400).json({ error: 'Either action or content must be provided' })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to update comment' })
  }
})

app.delete("/api/shows/comments", async (req, res) => {
  try {
    const authHeader = req.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' })
    }

    const token = authHeader.substring(7)
    const user = await AuthService.verifySession(token)

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const commentId = req.query.commentId

    if (!commentId) {
      return res.status(400).json({ error: 'Comment ID is required' })
    }

    const deleted = await db.deleteShowComment(new (require('mongodb').ObjectId)(commentId), user._id)

    if (!deleted) {
      return res.status(404).json({ error: 'Comment not found or you do not have permission to delete it' })
    }

    return res.status(200).json({
      message: 'Comment deleted successfully'
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to delete comment' })
  }
})

// Show Ratings API endpoints
app.get("/api/shows/ratings", async (req, res) => {
  try {
    const { showId, userId, includeAverage } = req.query
    const { limit, skip } = parseQueryParams(req.query)

    if (!showId && !userId) {
      return res.status(400).json({ error: 'Either showId or userId is required' })
    }

    let result

    if (showId) {
      result = await db.getShowRatings(showId, limit, skip)

      if (includeAverage === 'true') {
        const average = await db.getAverageShowRating(showId)
        result.average = average
      }

      const authHeader = req.get('authorization')
      let authUser = null

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        authUser = await AuthService.verifySession(token)
      }

      if (authUser) {
        const userRating = await db.getShowRating(showId, authUser._id)
        result.userRating = userRating
        if (includeAverage !== 'true') {
          result.average = null
        }
      }
    } else if (userId) {
      const authHeader = req.get('authorization')
      let authUser = null

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        authUser = await AuthService.verifySession(token)
      }

      if (!authUser || authUser._id.toString() !== userId) {
        return res.status(401).json({ error: 'Authentication required to view user ratings' })
      }

      result = await db.getUserRatings(new (require('mongodb').ObjectId)(userId), limit, skip)
    }

    return res.status(200).json(result)
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch ratings' })
  }
})

app.post("/api/shows/ratings", async (req, res) => {
  try {
    const authHeader = req.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' })
    }

    const token = authHeader.substring(7)
    const user = await AuthService.verifySession(token)

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const { showId, rating, review } = req.body

    if (!showId) {
      return res.status(400).json({ error: 'Show ID is required' })
    }

    if (typeof rating !== 'number' || rating < 1 || rating > 10) {
      return res.status(400).json({ error: 'Rating must be a number between 1 and 10' })
    }

    const existingRating = await db.getShowRating(showId, user._id)

    if (existingRating) {
      await db.updateShowRating(existingRating._id, {
        rating,
        review: review?.trim() || null,
      })

      return res.status(200).json({
        message: 'Rating updated successfully',
        ratingId: existingRating._id.toString()
      })
    } else {
      const ratingId = await db.createRating({
        userId: user._id,
        showId,
        rating,
        review: review?.trim() || null,
        type: 'show'
      })

      return res.status(201).json({
        message: 'Rating created successfully',
        ratingId: ratingId.toString()
      })
    }
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to create/update rating' })
  }
})

app.delete("/api/shows/ratings", async (req, res) => {
  try {
    const authHeader = req.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' })
    }

    const token = authHeader.substring(7)
    const user = await AuthService.verifySession(token)

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const showId = req.query.showId

    if (!showId) {
      return res.status(400).json({ error: 'Show ID is required' })
    }

    const existingRating = await db.getShowRating(showId, user._id)
    if (!existingRating) {
      return res.status(404).json({ error: 'Rating not found' })
    }

    const deleted = await db.deleteShowRating(existingRating._id, user._id)

    if (!deleted) {
      return res.status(404).json({ error: 'Rating not found or you do not have permission to delete it' })
    }

    return res.status(200).json({
      message: 'Rating deleted successfully'
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to delete rating' })
  }
})

// Show Watchlist API endpoints
app.get("/api/shows/watchlist", async (req, res) => {
  try {
    const authHeader = req.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' })
    }

    const token = authHeader.substring(7)
    const user = await AuthService.verifySession(token)

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const { limit, skip } = parseQueryParams(req.query)
    const includeDetails = req.query.includeDetails === 'true'

    let watchlist
    if (includeDetails) {
      watchlist = await db.getWatchlistWithDetails(user._id, limit, skip)
    } else {
      watchlist = await db.getWatchlist(user._id, limit, skip)
    }

    return res.status(200).json(watchlist)
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch watchlist' })
  }
})

app.post("/api/shows/watchlist", async (req, res) => {
  try {
    const authHeader = req.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' })
    }

    const token = authHeader.substring(7)
    const user = await AuthService.verifySession(token)

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const { showId, notes, priority = 'medium' } = req.body

    if (!showId) {
      return res.status(400).json({ error: 'Show ID is required' })
    }

    if (!['low', 'medium', 'high'].includes(priority)) {
      return res.status(400).json({ error: 'Priority must be one of: low, medium, high' })
    }

    const alreadyInWatchlist = await db.isInShowWatchlist(user._id, showId)
    if (alreadyInWatchlist) {
      return res.status(409).json({ error: 'Show is already in watchlist' })
    }

    const watchlistItemId = await db.addToShowWatchlist(user._id, showId, notes, priority)

    return res.status(201).json({
      message: 'Show added to watchlist successfully',
      watchlistItemId: watchlistItemId.toString()
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to add show to watchlist' })
  }
})

app.put("/api/shows/watchlist", async (req, res) => {
  try {
    const authHeader = req.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' })
    }

    const token = authHeader.substring(7)
    const user = await AuthService.verifySession(token)

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const { showId, notes, priority } = req.body

    if (!showId) {
      return res.status(400).json({ error: 'Show ID is required' })
    }

    if (!notes && !priority) {
      return res.status(400).json({ error: 'At least one field (notes or priority) must be provided' })
    }

    if (priority && !['low', 'medium', 'high'].includes(priority)) {
      return res.status(400).json({ error: 'Priority must be one of: low, medium, high' })
    }

    const updates = {}
    if (notes !== undefined) updates.notes = notes
    if (priority !== undefined) updates.priority = priority

    const updated = await db.updateShowWatchlistItem(user._id, showId, updates)

    if (!updated) {
      return res.status(404).json({ error: 'Show not found in watchlist' })
    }

    return res.status(200).json({ message: 'Watchlist item updated successfully' })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to update watchlist item' })
  }
})

app.delete("/api/shows/watchlist", async (req, res) => {
  try {
    const authHeader = req.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' })
    }

    const token = authHeader.substring(7)
    const user = await AuthService.verifySession(token)

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const showId = req.query.showId

    if (!showId) {
      return res.status(400).json({ error: 'Show ID is required' })
    }

    const removed = await db.removeFromShowWatchlist(user._id, showId)

    if (!removed) {
      return res.status(404).json({ error: 'Show not found in watchlist' })
    }

    return res.status(200).json({ message: 'Show removed from watchlist successfully' })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to remove show from watchlist' })
  }
})

// Helper functions for auth handlers
async function handleRegister(req, res, data) {
  try {
    // Ensure database is connected
    if (!db.isConnected) {
      await db.connect()
    }

    const { email, username, password, firstName, lastName } = data

    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username, and password are required' })
    }

    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' })
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }

    // Hash password before storing
    const hashedPassword = await AuthService.hashPassword(password)

    const user = await db.createUser({
      email,
      username,
      password: hashedPassword,
      firstName: firstName || '',
      lastName: lastName || ''
    })

    const tokens = await AuthService.createSession(user._id)

    return res.status(201).json({ user, ...tokens })
  } catch (error) {
    console.error('[handleRegister] Error:', error)
    return res.status(500).json({ error: error.message || 'Registration failed' })
  }
}

async function handleLogin(req, res, data) {
  try {
    // Ensure database is connected
    if (!db.isConnected) {
      await db.connect()
    }

    const { email, password } = data

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const user = await db.authenticateUser(email, password)

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    const tokens = await AuthService.createSession(user._id)

    return res.status(200).json({ user, ...tokens })
  } catch (error) {
    console.error('[handleLogin] Error:', error)
    return res.status(500).json({ error: error.message || 'Login failed' })
  }
}

async function handleLogout(req, res, data) {
  try {
    // Ensure database is connected
    if (!db.isConnected) {
      await db.connect()
    }

    const authHeader = req.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' })
    }

    const token = authHeader.substring(7)
    await AuthService.destroySession(token)

    return res.status(200).json({ message: 'Logged out successfully' })
  } catch (error) {
    console.error('[handleLogout] Error:', error)
    return res.status(500).json({ error: error.message || 'Logout failed' })
  }
}

async function handleVerify(req, res, data) {
  try {
    // Ensure database is connected
    if (!db.isConnected) {
      await db.connect()
    }

    const authHeader = req.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required' })
    }

    const token = authHeader.substring(7)
    const user = await AuthService.verifySession(token)

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    return res.status(200).json({ user })
  } catch (error) {
    console.error('[handleVerify] Error:', error)
    return res.status(500).json({ error: error.message || 'Token verification failed' })
  }
}

async function handleRefreshToken(req, res, data) {
  try {
    // Ensure database is connected
    if (!db.isConnected) {
      await db.connect()
    }

    const { refreshToken } = data

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' })
    }

    const tokens = await AuthService.refreshAccessToken(refreshToken)

    if (!tokens) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' })
    }

    return res.status(200).json(tokens)
  } catch (error) {
    console.error('[handleRefreshToken] Error:', error)
    return res.status(500).json({ error: error.message || 'Token refresh failed' })
  }
}

// Export for Passenger
module.exports = app

// Start the server if run directly
if (require.main === module) {
  const port = process.env.PORT || 3000
  
  // Initialize database first, then start server
  initializeDatabase().then(() => {
    app.listen(port, (err) => {
      if (err) throw err
      console.log(`[trakt-proxy] Express server ready on http://localhost:${port}`)
    })
  }).catch(error => {
    console.error('[app] Failed to start server:', error)
    process.exit(1)
  })
}