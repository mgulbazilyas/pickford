require('dotenv').config()
const express = require("express")
const cors = require("cors")
const multer = require('multer')
const path = require('path')
const fs = require('fs')
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
app.use(express.json({ verify: (req, _, buf) => { req.rawBody = buf } }))
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

// Function to save individual movies/shows from trending/popular responses
async function saveIndividualItemsFromResponse(data, path) {
  try {
    const isMovie = path.includes('/movies/')
    const isShow = path.includes('/shows/')

    if (!isMovie && !isShow) return

    // Handle array responses (like trending/popular lists)
    if (Array.isArray(data)) {
      for (const item of data) {
        if (isMovie && item.movie) {
          await cacheMovieItem(item.movie)
        } else if (isShow && item.show) {
          await cacheShowItem(item.show)
        }
      }
    }
    // Handle responses with numeric keys (like { "0": { "title": "Deadpool", "year": 2016 } })
    else if (typeof data === 'object' && data !== null) {
      for (const key in data) {
        if (key.match(/^\d+$/)) { // Check if key is numeric
          const item = data[key]
          // Check if this item has movie/show specific fields to determine type
          const hasMovieFields = item && (item.title || item.year || item.released)
          const hasShowFields = item && (item.first_aired || item.seasons || item.episode_count)

          if (isMovie && hasMovieFields) {
            await cacheMovieItem(item)
          } else if (isShow && hasShowFields) {
            await cacheShowItem(item)
          }
          // If path contains both movies and shows, determine by content
          else if (hasMovieFields && item.movie) {
            await cacheMovieItem(item)
          } else if (hasShowFields && item.show) {
            await cacheShowItem(item)
          }
          // Fallback: check path context
          else if (isMovie && item) {
            await cacheMovieItem(item)
          } else if (isShow && item) {
            await cacheShowItem(item)
          }
        }
      }
    }
    // Handle single movie/show responses
    else if (isMovie && data.movie) {
      await cacheMovieItem(data.movie)
    } else if (isShow && data.show) {
      await cacheShowItem(data.show)
    }
  } catch (error) {
    console.error('Error saving individual items from response:', error)
  }
}

// Function to cache individual movie item
async function cacheMovieItem(item) {
  try {
    // Handle both direct movie objects and nested movie objects
    const movie = item.movie || item

    if (!movie || !movie.ids || !movie.ids.trakt) return

    const movieId = movie.ids.trakt.toString()
    const cacheKey = `trakt-movies-${movieId}`

    // Check if already cached
    const existing = await db.getCachedResponse(cacheKey)
    if (existing) return

    // Cache the movie data
    await db.cacheResponse(cacheKey, {
      ...movie,
      _hasImages: movie.images ? true : false,
      _cacheStatus: "HIT",
      _source: "trending-popular"
    })

    console.log(`Cached movie from trending/popular: ${movie.title} (${movieId})`)
  } catch (error) {
    console.error('Error caching movie item:', error)
  }
}

// Function to cache individual show item
async function cacheShowItem(item) {
  try {
    // Handle both direct show objects and nested show objects
    const show = item.show || item

    if (!show || !show.ids || !show.ids.trakt) return

    const showId = show.ids.trakt.toString()
    const cacheKey = `trakt-shows-${showId}`

    // Check if already cached
    const existing = await db.getCachedResponse(cacheKey)
    if (existing) return

    // Cache the show data
    await db.cacheResponse(cacheKey, {
      ...show,
      _hasImages: show.images ? true : false,
      _cacheStatus: "HIT",
      _source: "trending-popular"
    })

    console.log(`Cached show from trending/popular: ${show.title} (${showId})`)
  } catch (error) {
    console.error('Error caching show item:', error)
  }
}

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

    // Override query parameters to always include extended=full,images
    const overriddenQuery = { ...query, extended: 'full,images' }
    const targetUrl = `${BASE_URL}${path}${Object.keys(overriddenQuery).length ? '?' + new URLSearchParams(overriddenQuery).toString() : ''}`
    console.log(`[Proxy] ${method} ${targetUrl}`);
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
            const imagesUrl = `${BASE_URL}${path}?extended=full,images`
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

        // Save individual movies/shows from trending/popular responses
        if (path.includes('/trending') || path.includes('/popular')) {
          await saveIndividualItemsFromResponse(data, path)
        }
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

// User Authentication endpoints with email verification
app.post("/api/auth/register", async (req, res) => {
  try {
    const { db } = require('./lib/db-mongodb');
    const { UserService } = require('./lib/user-service');

    // Ensure database connection
    if (!db.isConnected) {
      await db.connect();
    }

    const { email, username, password, firstName, lastName, bio, avatar, preferences } = req.body;

    // Register user with email verification
    const user = await UserService.registerUser({
      email,
      username,
      password,
      firstName,
      lastName,
      bio,
      avatar,
      preferences
    });

    return res.status(201).json({
      success: true,
      message: 'User registered successfully. Please check your email for verification.',
      user,
      requiresVerification: !user.emailVerified
    });

  } catch (error) {
    console.error('Registration error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Registration failed'
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { db } = require('./lib/db-mongodb');
    const { UserService } = require('./lib/user-service');

    // Ensure database connection
    if (!db.isConnected) {
      await db.connect();
    }

    const { email, password } = req.body;

    // Login user
    const { user, session } = await UserService.loginUser(email, password);

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      user,
      session
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(401).json({
      success: false,
      message: error.message || 'Login failed'
    });
  }
});

app.get("/api/auth/verify-email", async (req, res) => {
  try {
    const { db } = require('./lib/db-mongodb');
    const { UserService } = require('./lib/user-service');

    // Ensure database connection
    if (!db.isConnected) {
      await db.connect();
    }

    const token = req.query.token;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Verification token is required'
      });
    }

    // Verify email
    const user = await UserService.verifyEmail(token);

    return res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      user
    });

  } catch (error) {
    console.error('Email verification error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Email verification failed'
    });
  }
});

app.post("/api/auth/resend-verification", async (req, res) => {
  try {
    const { db } = require('./lib/db-mongodb');
    const { UserService } = require('./lib/user-service');

    // Ensure database connection
    if (!db.isConnected) {
      await db.connect();
    }

    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Resend verification email
    const result = await UserService.resendVerificationEmail(email);

    return res.status(result.success ? 200 : 400).json({
      success: result.success,
      message: result.message
    });

  } catch (error) {
    console.error('Resend verification error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to resend verification email'
    });
  }
});

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { db } = require('./lib/db-mongodb');
    const { UserService } = require('./lib/user-service');

    // Ensure database connection
    if (!db.isConnected) {
      await db.connect();
    }

    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Request password reset
    const result = await UserService.requestPasswordReset(email);

    return res.status(result.success ? 200 : 400).json({
      success: result.success,
      message: result.message
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to process password reset request'
    });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { db } = require('./lib/db-mongodb');
    const { UserService } = require('./lib/user-service');

    // Ensure database connection
    if (!db.isConnected) {
      await db.connect();
    }

    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Reset token and new password are required'
      });
    }

    // Validate password strength
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    // Reset password
    const result = await UserService.resetPassword(token, newPassword);

    return res.status(result.success ? 200 : 400).json({
      success: result.success,
      message: result.message
    });

  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to reset password'
    });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  try {
    const authHeader = req.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const token = authHeader.substring(7);
    await AuthService.destroySession(token);

    return res.status(200).json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Logout failed'
    });
  }
});

// Legacy auth endpoint for backward compatibility
app.post("/api/auth", async (req, res) => {
  try {
    const { action, ...data } = req.body;

    switch (action) {
      case 'register':
        return await handleRegister(req, res, data);
      case 'login':
        return await handleLogin(req, res, data);
      case 'logout':
        return await handleLogout(req, res, data);
      case 'verify':
        return await handleVerify(req, res, data);
      case 'refresh':
        return await handleRefreshToken(req, res, data);
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

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
app.get("/api/auth/profile", async (req, res) => {
  try {
    const { db } = require('./lib/db-mongodb');
    const { UserService } = require('./lib/user-service');

    // Ensure database connection
    if (!db.isConnected) {
      await db.connect();
    }

    const authHeader = req.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const token = authHeader.substring(7);

    // Verify session and get user
    const user = await AuthService.verifySession(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // Get user profile
    const profile = await UserService.getUserProfile(user._id);

    return res.status(200).json({
      success: true,
      user: profile
    });

  } catch (error) {
    console.error('Get profile error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to get user profile'
    });
  }
});

app.put("/api/auth/profile", async (req, res) => {
  try {
    const { db } = require('./lib/db-mongodb');
    const { UserService } = require('./lib/user-service');

    // Ensure database connection
    if (!db.isConnected) {
      await db.connect();
    }

    const authHeader = req.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const token = authHeader.substring(7);

    // Verify session and get user
    const user = await AuthService.verifySession(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    const { firstName, lastName, bio, avatar, preferences } = req.body;

    // Update user profile
    const updatedProfile = await UserService.updateUserProfile(user._id, {
      firstName,
      lastName,
      bio,
      avatar,
      preferences
    });

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedProfile
    });

  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to update profile'
    });
  }
});

// Legacy user profile endpoints for backward compatibility
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

    const { firstName, lastName, bio, avatar, photo } = req.body
    const updates = {}

    if (firstName !== undefined) updates.firstName = firstName
    if (lastName !== undefined) updates.lastName = lastName
    if (bio !== undefined) updates.bio = bio
    if (avatar !== undefined) updates.avatar = avatar
    if (photo !== undefined) updates.photo = photo

    const updatedUser = await db.updateUser(user._id, updates)

    return res.status(200).json(updatedUser)
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

// User Photo Management

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }
    cb(null, uploadDir)
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, 'user-' + req.user._id + '-' + uniqueSuffix + path.extname(file.originalname))
  }
})

const fileFilter = (req, file, cb) => {
  // Accept only image files
  if (file.mimetype.startsWith('image/')) {
    cb(null, true)
  } else {
    cb(new Error('Only image files are allowed'), false)
  }
}

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
})

// Middleware to set user in request for multer
const setUserForUpload = async (req, res, next) => {
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
    req.user = user
    next()
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}

// Upload user photo
app.post("/api/user/photo", setUserForUpload, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No photo file provided' })
    }

    // Delete previous photo if exists
    const currentUser = await db.findUserByEmail(req.user.email)
    if (currentUser && currentUser.photo) {
      const oldPhotoPath = path.join(__dirname, 'uploads', path.basename(currentUser.photo))
      if (fs.existsSync(oldPhotoPath)) {
        fs.unlinkSync(oldPhotoPath)
      }
    }

    // Create photo URL
    const photoUrl = `/uploads/${req.file.filename}`

    // Update user photo in database
    await db.updateUser(req.user._id, { photo: photoUrl })

    return res.status(200).json({
      message: 'Photo uploaded successfully',
      photoUrl: photoUrl
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to upload photo' })
  }
})

// Update user photo (same as upload - replaces existing photo)
app.put("/api/user/photo", setUserForUpload, upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No photo file provided' })
    }

    // Delete previous photo if exists
    const currentUser = await db.findUserByEmail(req.user.email)
    if (currentUser && currentUser.photo) {
      const oldPhotoPath = path.join(__dirname, 'uploads', path.basename(currentUser.photo))
      if (fs.existsSync(oldPhotoPath)) {
        fs.unlinkSync(oldPhotoPath)
      }
    }

    // Create photo URL
    const photoUrl = `/uploads/${req.file.filename}`

    // Update user photo in database
    await db.updateUser(req.user._id, { photo: photoUrl })

    return res.status(200).json({
      message: 'Photo updated successfully',
      photoUrl: photoUrl
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to update photo' })
  }
})

// Delete user photo
app.delete("/api/user/photo", async (req, res) => {
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

    // Get current user to find photo
    const currentUser = await db.findUserByEmail(user.email)
    if (currentUser && currentUser.photo) {
      // Delete photo file
      const photoPath = path.join(__dirname, 'uploads', path.basename(currentUser.photo))
      if (fs.existsSync(photoPath)) {
        fs.unlinkSync(photoPath)
      }

      // Remove photo from database
      await db.updateUser(user._id, { photo: null })

      return res.status(200).json({
        message: 'Photo deleted successfully'
      })
    } else {
      return res.status(404).json({ error: 'No photo found to delete' })
    }
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to delete photo' })
  }
})

// Serve uploaded files publicly
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

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
// === UNIFIED WATCHLIST API ENDPOINTS ===

// Get user's watchlist collections
app.get("/api/watchlist/collections", async (req, res) => {
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

    const collections = await db.getUserWatchlistCollections(user._id)
    return res.status(200).json({ collections })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch watchlist collections' })
  }
})

// Create a new watchlist collection
app.post("/api/watchlist/collections", async (req, res) => {
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

    const { name, description, emoji } = req.body

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Collection name is required' })
    }

    const collectionId = await db.createWatchlistCollection(user._id, name.trim(), description, emoji)

    return res.status(201).json({
      message: 'Watchlist collection created successfully',
      collectionId: collectionId.toString()
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to create watchlist collection' })
  }
})

// Update a watchlist collection
app.put("/api/watchlist/collections/:collectionId", async (req, res) => {
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

    const { collectionId } = req.params
    const { name, description, emoji } = req.body

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Collection name is required' })
    }

    const updates = {}
    if (name !== undefined) updates.name = name.trim()
    if (description !== undefined) updates.description = description
    if (emoji !== undefined) updates.emoji = emoji

    const updated = await db.updateWatchlistCollection(user._id, collectionId, updates)

    if (!updated) {
      return res.status(404).json({ error: 'Collection not found' })
    }

    return res.status(200).json({ message: 'Watchlist collection updated successfully' })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to update watchlist collection' })
  }
})

// Delete a watchlist collection
app.delete("/api/watchlist/collections/:collectionId", async (req, res) => {
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

    const { collectionId } = req.params

    const deleted = await db.deleteWatchlistCollection(user._id, collectionId)

    if (!deleted) {
      return res.status(404).json({ error: 'Collection not found' })
    }

    return res.status(200).json({ message: 'Watchlist collection deleted successfully' })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to delete watchlist collection' })
  }
})

// Get items in a specific watchlist collection
app.get("/api/watchlist/collections/:collectionId/items", async (req, res) => {
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

    const { collectionId } = req.params
    const { limit, skip } = parseQueryParams(req.query)
    const includeDetails = req.query.includeDetails === 'true'

    const result = await db.getWatchlistCollectionItems(user._id, collectionId, limit, skip, includeDetails)
    return res.status(200).json(result)
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch watchlist items' })
  }
})

// Add item to watchlist collection (supports both movies and shows)
app.post("/api/watchlist/collections/:collectionId/items", async (req, res) => {
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

    const { collectionId } = req.params
    const { type, contentId, notes } = req.body

    if (!type || !contentId) {
      return res.status(400).json({ error: 'Type and contentId are required' })
    }

    if (!['movie', 'show'].includes(type)) {
      return res.status(400).json({ error: 'Type must be either "movie" or "show"' })
    }

    const alreadyInCollection = await db.isInWatchlistCollection(user._id, collectionId, type, contentId)
    if (alreadyInCollection) {
      return res.status(409).json({ error: 'Item already exists in this collection' })
    }

    const itemId = await db.addToWatchlistCollection(user._id, collectionId, type, contentId, notes)

    return res.status(201).json({
      message: `${type === 'movie' ? 'Movie' : 'Show'} added to watchlist collection successfully`,
      itemId: itemId.toString()
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to add item to watchlist collection' })
  }
})

// Update item in watchlist collection
app.put("/api/watchlist/collections/:collectionId/items/:itemId", async (req, res) => {
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

    const { collectionId, itemId } = req.params
    const { notes } = req.body

    if (notes === undefined) {
      return res.status(400).json({ error: 'At least notes field must be provided' })
    }

    const updates = { notes }

    const updated = await db.updateWatchlistItem(user._id, collectionId, itemId, updates)

    if (!updated) {
      return res.status(404).json({ error: 'Item not found in collection' })
    }

    return res.status(200).json({ message: 'Watchlist item updated successfully' })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to update watchlist item' })
  }
})

// Remove item from watchlist collection
app.delete("/api/watchlist/collections/:collectionId/items/:itemId", async (req, res) => {
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

    const { collectionId, itemId } = req.params

    const removed = await db.removeFromWatchlistCollection(user._id, collectionId, itemId)

    if (!removed) {
      return res.status(404).json({ error: 'Item not found in collection' })
    }

    return res.status(200).json({ message: 'Item removed from watchlist collection successfully' })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to remove item from watchlist collection' })
  }
})

// LEGACY ENDPOINTS - for backward compatibility

// Get user's watchlist (returns first collection for backward compatibility)
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
      watchlist = await db.getWatchlistWithDetails(user._id, limit, skip)
    } else {
      watchlist = await db.getWatchlist(user._id, limit, skip)
    }

    return res.status(200).json(watchlist)
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch watchlist' })
  }
})

// Add to watchlist (adds to first collection for backward compatibility)
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

    const { movieId, showId, notes, priority = 'medium' } = req.body
    const contentId = movieId || showId
    const contentType = movieId ? 'movie' : 'show'

    if (!contentId) {
      return res.status(400).json({ error: 'Either movieId or showId is required' })
    }

    const alreadyInWatchlist = await db.isInWatchlist(user._id, contentType, contentId)
    if (alreadyInWatchlist) {
      return res.status(409).json({ error: `${contentType === 'movie' ? 'Movie' : 'Show'} is already in watchlist` })
    }

    const watchlistItemId = await db.addToWatchlistWithData(user._id, contentType, contentId, notes, priority)

    return res.status(201).json({
      message: `${contentType === 'movie' ? 'Movie' : 'Show'} added to watchlist successfully`,
      watchlistItemId: watchlistItemId.toString()
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || `Failed to add ${contentType === 'movie' ? 'movie' : 'show'} to watchlist` })
  }
})

// Update watchlist item
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

    const { movieId, showId, notes, priority } = req.body
    const contentId = movieId || showId
    const contentType = movieId ? 'movie' : 'show'

    if (!contentId) {
      return res.status(400).json({ error: 'Either movieId or showId is required' })
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

    const updated = await db.updateWatchlistItem(user._id, contentType, contentId, updates)

    if (!updated) {
      return res.status(404).json({ error: `${contentType === 'movie' ? 'Movie' : 'Show'} not found in watchlist` })
    }

    return res.status(200).json({ message: 'Watchlist item updated successfully' })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to update watchlist item' })
  }
})

// Remove from watchlist
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

    const { movieId, showId } = req.query
    const contentId = movieId || showId
    const contentType = movieId ? 'movie' : 'show'

    if (!contentId) {
      return res.status(400).json({ error: 'Either movieId or showId is required' })
    }

    const removed = await db.removeFromWatchlist(user._id, contentType, contentId)

    if (!removed) {
      return res.status(404).json({ error: `${contentType === 'movie' ? 'Movie' : 'Show'} not found in watchlist` })
    }

    return res.status(200).json({ message: `${contentType === 'movie' ? 'Movie' : 'Show'} removed from watchlist successfully` })
  } catch (error) {
    return res.status(500).json({ error: error.message || `Failed to remove ${contentType === 'movie' ? 'movie' : 'show'} from watchlist` })
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
    const { includeDetails = 'false' } = req.query

    const watchlistItems = await db.getWatchlist(user._id, limit, skip, true) // Get shows only

    // If includeDetails is true, try to fetch full show data from cache
    if (includeDetails === 'true') {
      const itemsWithDetails = await Promise.all(
        watchlistItems.watchlist.map(async (item) => {
          if (item.showId && item.contentData) {
            return {
              ...item,
              show: item.contentData
            }
          }
          return item
        })
      )
      return res.status(200).json({
        ...watchlistItems,
        watchlist: itemsWithDetails
      })
    }

    return res.status(200).json(watchlistItems)
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch show watchlist' })
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

    const alreadyInWatchlist = await db.isInWatchlist(user._id, 'show', showId)
    if (alreadyInWatchlist) {
      return res.status(409).json({ error: 'Show is already in watchlist' })
    }

    const watchlistItemId = await db.addToWatchlistWithData(user._id, 'show', showId, notes, priority)

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

    const updated = await db.updateWatchlistItem(user._id, 'show', showId, { notes, priority })

    if (!updated) {
      return res.status(404).json({ error: 'Show not found in watchlist' })
    }

    return res.status(200).json({
      message: 'Show watchlist item updated successfully'
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to update show watchlist item' })
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

    const { showId } = req.query
    if (!showId) {
      return res.status(400).json({ error: 'Show ID is required' })
    }

    const deleted = await db.removeFromWatchlist(user._id, 'show', showId)

    if (!deleted) {
      return res.status(404).json({ error: 'Show not found in watchlist' })
    }

    return res.status(200).json({
      message: 'Show removed from watchlist successfully'
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to remove show from watchlist' })
  }
})

// Show Watchlist API endpoints have been merged into the unified watchlist API
// Use /api/watchlist/collections endpoints for managing watchlist collections

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

// Stripe Payment and Subscription API endpoints
app.post("/api/payments/create-intent", async (req, res) => {
  try {
    const { db } = require('./lib/db-mongodb');
    const { StripeService } = require('./lib/stripe-service');

    // Ensure database connection
    if (!db.isConnected) {
      await db.connect();
    }

    const authHeader = req.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const token = authHeader.substring(7);
    const user = await AuthService.verifySession(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    const { amount, currency = 'usd', metadata = {} } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }

    // Create payment intent
    const paymentIntent = await StripeService.createPaymentIntent(
      user._id,
      amount,
      currency,
      { email: user.email, ...metadata }
    );

    return res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });

  } catch (error) {
    console.error('Create payment intent error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to create payment intent'
    });
  }
});

app.post("/api/payments/create-checkout", async (req, res) => {
  try {
    const { db } = require('./lib/db-mongodb');
    const { SubscriptionService } = require('./lib/subscription-service');

    // Ensure database connection
    if (!db.isConnected) {
      await db.connect();
    }

    const authHeader = req.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const token = authHeader.substring(7);
    const user = await AuthService.verifySession(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    const { amount, currency = 'usd', successUrl, cancelUrl, metadata = {} } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }

    if (!successUrl || !cancelUrl) {
      return res.status(400).json({
        success: false,
        message: 'Success and cancel URLs are required'
      });
    }

    // Create checkout session
    const checkoutSession = await SubscriptionService.createPaymentCheckout(
      user._id,
      amount,
      currency,
      successUrl,
      cancelUrl,
      { email: user.email, ...metadata }
    );

    return res.status(200).json({
      success: true,
      checkoutUrl: checkoutSession.url,
      sessionId: checkoutSession.id
    });

  } catch (error) {
    console.error('Create payment checkout error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to create payment checkout'
    });
  }
});

// Subscription Packages endpoints
app.post("/api/subscriptions/packages", async (req, res) => {
  try {
    const { db } = require('./lib/db-mongodb');
    const { SubscriptionService } = require('./lib/subscription-service');

    // Ensure database connection
    if (!db.isConnected) {
      await db.connect();
    }

    const authHeader = req.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const token = authHeader.substring(7);
    const user = await AuthService.verifySession(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    const packageData = req.body;

    // Create package
    const package_ = await SubscriptionService.createPackage(packageData);

    return res.status(201).json({
      success: true,
      message: 'Package created successfully',
      package: package_
    });

  } catch (error) {
    console.error('Create package error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to create package'
    });
  }
});

app.get("/api/subscriptions/packages", async (req, res) => {
  try {
    const { db } = require('./lib/db-mongodb');
    const { SubscriptionService } = require('./lib/subscription-service');

    // Ensure database connection
    if (!db.isConnected) {
      await db.connect();
    }

    const { status } = req.query;

    // Get all packages
    const packages = await SubscriptionService.getAllPackages(status);

    return res.status(200).json({
      success: true,
      packages
    });

  } catch (error) {
    console.error('Get packages error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to get packages'
    });
  }
});

app.get("/api/subscriptions/packages/:packageId", async (req, res) => {
  try {
    const { db } = require('./lib/db-mongodb');
    const { SubscriptionService } = require('./lib/subscription-service');

    // Ensure database connection
    if (!db.isConnected) {
      await db.connect();
    }

    const { packageId } = req.params;

    // Get package by ID
    const package_ = await SubscriptionService.getPackageById(packageId);

    if (!package_) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }

    return res.status(200).json({
      success: true,
      package: package_
    });

  } catch (error) {
    console.error('Get package error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to get package'
    });
  }
});

// User Subscriptions endpoints
app.post("/api/subscriptions/create", async (req, res) => {
  try {
    const { db } = require('./lib/db-mongodb');
    const { SubscriptionService } = require('./lib/subscription-service');

    // Ensure database connection
    if (!db.isConnected) {
      await db.connect();
    }

    const authHeader = req.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const token = authHeader.substring(7);
    const user = await AuthService.verifySession(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    const { packageId, paymentMethodId } = req.body;

    if (!packageId) {
      return res.status(400).json({
        success: false,
        message: 'Package ID is required'
      });
    }

    // Create subscription
    const subscription = await SubscriptionService.createUserSubscription(
      user._id,
      packageId,
      paymentMethodId
    );

    return res.status(201).json({
      success: true,
      message: 'Subscription created successfully',
      subscription
    });

  } catch (error) {
    console.error('Create subscription error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to create subscription'
    });
  }
});

app.post("/api/subscriptions/custom", async (req, res) => {
  try {
    const { db } = require('./lib/db-mongodb');
    const { SubscriptionService } = require('./lib/subscription-service');

    // Ensure database connection
    if (!db.isConnected) {
      await db.connect();
    }

    const authHeader = req.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const token = authHeader.substring(7);
    const user = await AuthService.verifySession(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    const subscriptionData = req.body;

    // Create custom subscription
    const subscription = await SubscriptionService.createCustomSubscription(
      user._id,
      subscriptionData
    );

    return res.status(201).json({
      success: true,
      message: 'Custom subscription created successfully',
      subscription
    });

  } catch (error) {
    console.error('Create custom subscription error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to create custom subscription'
    });
  }
});

app.post("/api/subscriptions/checkout", async (req, res) => {
  try {
    const { db } = require('./lib/db-mongodb');
    const { SubscriptionService } = require('./lib/subscription-service');

    // Ensure database connection
    if (!db.isConnected) {
      await db.connect();
    }

    const authHeader = req.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const token = authHeader.substring(7);
    const user = await AuthService.verifySession(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    const { packageId, successUrl, cancelUrl, metadata = {} } = req.body;

    if (!packageId) {
      return res.status(400).json({
        success: false,
        message: 'Package ID is required'
      });
    }

    if (!successUrl || !cancelUrl) {
      return res.status(400).json({
        success: false,
        message: 'Success and cancel URLs are required'
      });
    }

    // Create checkout session
    const checkoutSession = await SubscriptionService.createSubscriptionCheckout(
      user._id,
      packageId,
      successUrl,
      cancelUrl,
      metadata
    );

    return res.status(200).json({
      success: true,
      checkoutUrl: checkoutSession.url,
      sessionId: checkoutSession.id
    });

  } catch (error) {
    console.error('Create subscription checkout error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to create subscription checkout'
    });
  }
});

app.get("/api/subscriptions", async (req, res) => {
  try {
    const { db } = require('./lib/db-mongodb');
    const { SubscriptionService } = require('./lib/subscription-service');

    // Ensure database connection
    if (!db.isConnected) {
      await db.connect();
    }

    const authHeader = req.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const token = authHeader.substring(7);
    const user = await AuthService.verifySession(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    const { status } = req.query;

    // Get user subscriptions
    const subscriptions = await SubscriptionService.getUserSubscriptions(
      user._id,
      status
    );

    return res.status(200).json({
      success: true,
      subscriptions
    });

  } catch (error) {
    console.error('Get subscriptions error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to get subscriptions'
    });
  }
});

app.get("/api/subscriptions/active", async (req, res) => {
  try {
    const { db } = require('./lib/db-mongodb');
    const { SubscriptionService } = require('./lib/subscription-service');

    // Ensure database connection
    if (!db.isConnected) {
      await db.connect();
    }

    const authHeader = req.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const token = authHeader.substring(7);
    const user = await AuthService.verifySession(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // Get active subscription
    const subscription = await SubscriptionService.getUserActiveSubscription(user._id);

    return res.status(200).json({
      success: true,
      subscription: subscription || null
    });

  } catch (error) {
    console.error('Get active subscription error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to get active subscription'
    });
  }
});

app.post("/api/subscriptions/cancel", async (req, res) => {
  try {
    const { db } = require('./lib/db-mongodb');
    const { SubscriptionService } = require('./lib/subscription-service');

    // Ensure database connection
    if (!db.isConnected) {
      await db.connect();
    }

    const authHeader = req.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const token = authHeader.substring(7);
    const user = await AuthService.verifySession(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    const { subscriptionId, cancelImmediately = false } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({
        success: false,
        message: 'Subscription ID is required'
      });
    }

    // Cancel subscription
    const canceledSubscription = await SubscriptionService.cancelSubscription(
      subscriptionId,
      user._id,
      cancelImmediately
    );

    return res.status(200).json({
      success: true,
      message: cancelImmediately ? 'Subscription canceled immediately' : 'Subscription will be canceled at period end',
      subscription: canceledSubscription
    });

  } catch (error) {
    console.error('Cancel subscription error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to cancel subscription'
    });
  }
});

app.post("/api/subscriptions/portal", async (req, res) => {
  try {
    const { db } = require('./lib/db-mongodb');
    const { SubscriptionService } = require('./lib/subscription-service');

    // Ensure database connection
    if (!db.isConnected) {
      await db.connect();
    }

    const authHeader = req.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const token = authHeader.substring(7);
    const user = await AuthService.verifySession(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    const { returnUrl } = req.body;

    if (!returnUrl) {
      return res.status(400).json({
        success: false,
        message: 'Return URL is required'
      });
    }

    // Create customer portal session
    const portalSession = await SubscriptionService.createCustomerPortalSession(
      user._id,
      returnUrl
    );

    return res.status(200).json({
      success: true,
      portalUrl: portalSession.url,
      sessionId: portalSession.id
    });

  } catch (error) {
    console.error('Create portal session error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to create portal session'
    });
  }
});

app.get("/api/payments/methods", async (req, res) => {
  try {
    const { db } = require('./lib/db-mongodb');
    const { SubscriptionService } = require('./lib/subscription-service');

    // Ensure database connection
    if (!db.isConnected) {
      await db.connect();
    }

    const authHeader = req.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const token = authHeader.substring(7);
    const user = await AuthService.verifySession(token);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // Get payment methods
    const paymentMethods = await SubscriptionService.getUserPaymentMethods(user._id);

    return res.status(200).json({
      success: true,
      paymentMethods
    });

  } catch (error) {
    console.error('Get payment methods error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to get payment methods'
    });
  }
});

// Stripe Webhook endpoint
app.post("/api/webhooks/stripe", async (req, res) => {
  try {
    const { StripeService } = require('./lib/stripe-service');
    const { SubscriptionService } = require('./lib/subscription-service');
    const { db } = require('./lib/db-mongodb');

    // Ensure database connection
    if (!db.isConnected) {
      await db.connect();
    }

    const signature = req.get('stripe-signature');
    if (!signature) {
      return res.status(400).json({
        success: false,
        message: 'Stripe signature is required'
      });
    }

    // Verify webhook signature
    const event = StripeService.verifyWebhookSignature(req.rawBody, signature);

    // Handle the webhook event
    await StripeService.handleWebhookEvent(event);

    // Update subscription data if needed
    if (event.type.startsWith('customer.subscription.')) {
      await SubscriptionService.updateSubscriptionFromWebhook(event);
    }

    // Mark event as processed in database
    await db.markStripeEventProcessed(event.id);

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error('Stripe webhook error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Webhook processing failed'
    });
  }
});

// Stripe Events viewing endpoints (for admin/debugging)
app.get("/api/stripe/events", async (req, res) => {
  try {
    const { db } = require('./lib/db-mongodb');

    // Ensure database connection
    if (!db.isConnected) {
      await db.connect();
    }

    const { limit = 50, skip = 0 } = req.query;

    // Get stripe events
    const events = await db.getStripeEvents(parseInt(limit), parseInt(skip));

    return res.status(200).json({
      success: true,
      events
    });

  } catch (error) {
    console.error('Get stripe events error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to get stripe events'
    });
  }
});

app.get("/api/stripe/events/user/:userId", async (req, res) => {
  try {
    const { db } = require('./lib/db-mongodb');

    // Ensure database connection
    if (!db.isConnected) {
      await db.connect();
    }

    const { userId } = req.params;
    const { limit = 50, skip = 0 } = req.query;

    // Get stripe events for user
    const events = await db.getStripeEventsByUserId(userId, parseInt(limit), parseInt(skip));

    return res.status(200).json({
      success: true,
      events
    });

  } catch (error) {
    console.error('Get user stripe events error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to get user stripe events'
    });
  }
});

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