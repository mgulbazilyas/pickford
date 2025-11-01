const { ActivityService } = require('./activity-service');

class ActivityMiddleware {
  constructor() {
    this.activityService = ActivityService;
    
    // Define which endpoints to track and how to extract data
    this.endpointConfigs = {
      // Authentication endpoints
      'POST:/api/auth/login': {
        activityType: ActivityService.ACTIVITY_TYPES.LOGIN,
        resourceType: ActivityService.RESOURCE_TYPES.USER,
        extractUserId: (req, res) => {
          // Extract user ID from response after successful login
          return res.locals?.user?._id || res.locals?.userId;
        }
      },
      
      'POST:/api/auth/logout': {
        activityType: ActivityService.ACTIVITY_TYPES.LOGOUT,
        resourceType: ActivityService.RESOURCE_TYPES.USER,
        extractUserId: (req) => {
          // Extract user ID from authenticated request
          return req.user?._id || req.locals?.user?._id;
        }
      },
      
      'POST:/api/auth/reset-password': {
        activityType: ActivityService.ACTIVITY_TYPES.PASSWORD_CHANGE,
        resourceType: ActivityService.RESOURCE_TYPES.USER,
        extractUserId: (req) => {
          return req.user?._id || req.locals?.user?._id;
        }
      },
      
      'PUT:/api/auth/profile': {
        activityType: ActivityService.ACTIVITY_TYPES.PROFILE_UPDATE,
        resourceType: ActivityService.RESOURCE_TYPES.USER,
        extractUserId: (req) => {
          return req.user?._id || req.locals?.user?._id;
        },
        extractMetadata: (req) => {
          const { firstName, lastName, bio, avatar, preferences } = req.body;
          const changes = {};
          if (firstName !== undefined) changes.firstName = firstName;
          if (lastName !== undefined) changes.lastName = lastName;
          if (bio !== undefined) changes.bio = bio;
          if (avatar !== undefined) changes.avatar = avatar;
          if (preferences !== undefined) changes.preferences = preferences;
          return { changes };
        }
      },
      
      // Comment endpoints
      'POST:/api/comments': {
        activityType: ActivityService.ACTIVITY_TYPES.COMMENT_CREATE,
        resourceType: ActivityService.RESOURCE_TYPES.MOVIE,
        extractUserId: (req) => req.user?._id || req.locals?.user?._id,
        extractResourceId: (req) => req.body.movieId,
        extractMetadata: (req, res) => ({
          commentId: res.locals?.commentId
        })
      },
      
      'PUT:/api/comments': {
        activityType: ActivityService.ACTIVITY_TYPES.COMMENT_UPDATE,
        resourceType: ActivityService.RESOURCE_TYPES.MOVIE,
        extractUserId: (req) => req.user?._id || req.locals?.user?._id,
        extractResourceId: (req) => {
          // For comment updates, we need to fetch the comment to get movie ID
          return null; // Will be handled in the endpoint
        }
      },
      
      'DELETE:/api/comments': {
        activityType: ActivityService.ACTIVITY_TYPES.COMMENT_DELETE,
        resourceType: ActivityService.RESOURCE_TYPES.MOVIE,
        extractUserId: (req) => req.user?._id || req.locals?.user?._id,
        extractResourceId: (req) => {
          return req.query.movieId; // Will be handled in the endpoint
        }
      },
      
      // Show comment endpoints
      'POST:/api/shows/comments': {
        activityType: ActivityService.ACTIVITY_TYPES.COMMENT_CREATE,
        resourceType: ActivityService.RESOURCE_TYPES.SHOW,
        extractUserId: (req) => req.user?._id || req.locals?.user?._id,
        extractResourceId: (req) => req.body.showId,
        extractMetadata: (req, res) => ({
          commentId: res.locals?.commentId
        })
      },
      
      // Rating endpoints
      'POST:/api/ratings': {
        activityType: ActivityService.ACTIVITY_TYPES.RATING_CREATE,
        resourceType: ActivityService.RESOURCE_TYPES.MOVIE,
        extractUserId: (req) => req.user?._id || req.locals?.user?._id,
        extractResourceId: (req) => req.body.movieId,
        extractMetadata: (req) => ({
          rating: req.body.rating,
          review: req.body.review
        })
      },
      
      'DELETE:/api/ratings': {
        activityType: ActivityService.ACTIVITY_TYPES.RATING_DELETE,
        resourceType: ActivityService.RESOURCE_TYPES.MOVIE,
        extractUserId: (req) => req.user?._id || req.locals?.user?._id,
        extractResourceId: (req) => req.query.movieId
      },
      
      'POST:/api/shows/ratings': {
        activityType: ActivityService.ACTIVITY_TYPES.RATING_CREATE,
        resourceType: ActivityService.RESOURCE_TYPES.SHOW,
        extractUserId: (req) => req.user?._id || req.locals?.user?._id,
        extractResourceId: (req) => req.body.showId,
        extractMetadata: (req) => ({
          rating: req.body.rating,
          review: req.body.review
        })
      },
      
      // Watchlist endpoints
      'POST:/api/watchlist': {
        activityType: ActivityService.ACTIVITY_TYPES.WATCHLIST_ADD,
        extractUserId: (req) => req.user?._id || req.locals?.user?._id,
        extractResourceInfo: (req) => {
          const { movieId, showId } = req.body;
          if (movieId) {
            return {
              resourceType: ActivityService.RESOURCE_TYPES.MOVIE,
              resourceId: movieId
            };
          } else if (showId) {
            return {
              resourceType: ActivityService.RESOURCE_TYPES.SHOW,
              resourceId: showId
            };
          }
          return null;
        }
      },
      
      'DELETE:/api/watchlist': {
        activityType: ActivityService.ACTIVITY_TYPES.WATCHLIST_REMOVE,
        extractUserId: (req) => req.user?._id || req.locals?.user?._id,
        extractResourceInfo: (req) => {
          const { movieId, showId } = req.query;
          if (movieId) {
            return {
              resourceType: ActivityService.RESOURCE_TYPES.MOVIE,
              resourceId: movieId
            };
          } else if (showId) {
            return {
              resourceType: ActivityService.RESOURCE_TYPES.SHOW,
              resourceId: showId
            };
          }
          return null;
        }
      },
      
      'POST:/api/watchlist/collections': {
        activityType: ActivityService.ACTIVITY_TYPES.COLLECTION_CREATE,
        resourceType: ActivityService.RESOURCE_TYPES.COLLECTION,
        extractUserId: (req) => req.user?._id || req.locals?.user?._id,
        extractResourceId: (req, res) => res.locals?.collectionId
      },
      
      // Movie/Show viewing (for Trakt proxy endpoints)
      'GET:/api/trakt/movies': {
        activityType: ActivityService.ACTIVITY_TYPES.MOVIE_VIEW,
        resourceType: ActivityService.RESOURCE_TYPES.MOVIE,
        extractUserId: (req) => req.user?._id || req.locals?.user?._id,
        extractResourceId: (req) => {
          // Extract movie ID from URL path like /api/trakt/movies/123
          const pathParts = req.path.split('/');
          return pathParts[pathParts.length - 1];
        },
        condition: (req) => {
          // Only log if path contains a specific movie ID (not list endpoints)
          return req.path.match(/\/api\/trakt\/movies\/\d+/);
        }
      },
      
      'GET:/api/trakt/shows': {
        activityType: ActivityService.ACTIVITY_TYPES.SHOW_VIEW,
        resourceType: ActivityService.RESOURCE_TYPES.SHOW,
        extractUserId: (req) => req.user?._id || req.locals?.user?._id,
        extractResourceId: (req) => {
          // Extract show ID from URL path like /api/trakt/shows/123
          const pathParts = req.path.split('/');
          return pathParts[pathParts.length - 1];
        },
        condition: (req) => {
          // Only log if path contains a specific show ID (not list endpoints)
          return req.path.match(/\/api\/trakt\/shows\/\d+/);
        }
      }
    };
  }

  /**
   * Express middleware for activity tracking
   */
  middleware() {
    return (req, res, next) => {
      // Store original res.json and res.status methods
      const originalJson = res.json;
      const originalStatus = res.status;
      let hasLogged = false;

      // Override res.json to capture response data
      res.json = function(data) {
        // Store response data for activity logging
        res.locals.responseData = data;

        // Call activity logging after response is sent (only once)
        if (!hasLogged) {
          hasLogged = true;
          res.on('finish', () => {
            // Don't block response, log asynchronously
            this.logActivity(req, res).catch(error => {
              console.error('[ActivityMiddleware] Error in async logging:', error);
            });
          });
        }

        return originalJson.call(this, data);
      }.bind(this);

      // Override res.status to capture status code
      res.status = function(code) {
        res.locals.statusCode = code;
        return originalStatus.call(this, code);
      };

      next();
    };
  }

  /**
   * Log activity based on request and response
   */
  async logActivity(req, res) {
    try {
      // Only log successful requests (2xx status codes)
      const statusCode = res.locals.statusCode || res.statusCode;
      if (statusCode < 200 || statusCode >= 300) {
        return;
      }

      // Check if database is available
      const { db } = require('./db-mongodb');
      if (!db.isConfigured() || !db.isConnected) {
        return; // Skip logging if database is not available
      }

      // Get endpoint configuration
      const endpointKey = `${req.method}:${req.route?.path || req.path}`;
      const config = this.findEndpointConfig(req.method, req.path);

      if (!config) {
        return; // No activity tracking configured for this endpoint
      }

      // Check condition if exists
      if (config.condition && !config.condition(req)) {
        return;
      }

      // Extract user ID
      const userId = config.extractUserId(req, res);
      if (!userId) {
        return; // No user ID found, skip logging
      }

      // Extract resource information
      let resourceType = config.resourceType;
      let resourceId = config.extractResourceId ? config.extractResourceId(req, res) : null;

      // Handle dynamic resource type extraction
      if (config.extractResourceInfo) {
        const resourceInfo = config.extractResourceInfo(req, res);
        if (resourceInfo) {
          resourceType = resourceInfo.resourceType;
          resourceId = resourceInfo.resourceId;
        }
      }

      // Extract metadata
      let metadata = config.extractMetadata ? config.extractMetadata(req, res) : {};

      // Log the activity with timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Activity logging timeout')), 2000)
      );

      await Promise.race([
        this.activityService.logActivity({
          userId,
          activityType: config.activityType,
          resourceType,
          resourceId,
          metadata,
          req
        }),
        timeoutPromise
      ]);

    } catch (error) {
      console.error('[ActivityMiddleware] Error logging activity:', error);
      // Don't throw error to avoid breaking main functionality
    }
  }

  /**
   * Find endpoint configuration by method and path
   */
  findEndpointConfig(method, path) {
    const endpointKey = `${method}:${path}`;
    
    // Direct match
    if (this.endpointConfigs[endpointKey]) {
      return this.endpointConfigs[endpointKey];
    }

    // Pattern matching for dynamic routes
    for (const [key, config] of Object.entries(this.endpointConfigs)) {
      const [configMethod, configPath] = key.split(':');
      
      if (configMethod !== method) {
        continue;
      }

      // Convert path to regex pattern
      const pattern = configPath
        .replace(/\//g, '\\/')
        .replace(/:\w+/g, '[^/]+')
        .replace(/\*/g, '.*');

      const regex = new RegExp(`^${pattern}$`);
      if (regex.test(path)) {
        return config;
      }
    }

    return null;
  }

  /**
   * Helper method to set user in request for activity tracking
   */
  static setUser(req, user) {
    req.user = user;
    req.locals.user = user;
  }

  /**
   * Helper method to set response data for activity tracking
   */
  static setResponseData(res, key, value) {
    res.locals[key] = value;
  }
}

// Create singleton instance
const activityMiddleware = new ActivityMiddleware();

module.exports = { 
  ActivityMiddleware: activityMiddleware,
  activityMiddleware: activityMiddleware.middleware.bind(activityMiddleware)
};