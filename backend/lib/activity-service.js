const { ObjectId } = require('mongodb');

class ActivityService {
  constructor() {
    this.ACTIVITY_TYPES = {
      // Authentication activities
      LOGIN: 'LOGIN',
      LOGOUT: 'LOGOUT',
      PASSWORD_CHANGE: 'PASSWORD_CHANGE',
      PROFILE_UPDATE: 'PROFILE_UPDATE',
      
      // Comment activities
      COMMENT_CREATE: 'COMMENT_CREATE',
      COMMENT_UPDATE: 'COMMENT_UPDATE',
      COMMENT_DELETE: 'COMMENT_DELETE',
      COMMENT_LIKE: 'COMMENT_LIKE',
      COMMENT_UNLIKE: 'COMMENT_UNLIKE',
      
      // Rating activities
      RATING_CREATE: 'RATING_CREATE',
      RATING_UPDATE: 'RATING_UPDATE',
      RATING_DELETE: 'RATING_DELETE',
      
      // Watchlist activities
      WATCHLIST_ADD: 'WATCHLIST_ADD',
      WATCHLIST_REMOVE: 'WATCHLIST_REMOVE',
      WATCHLIST_UPDATE: 'WATCHLIST_UPDATE',
      COLLECTION_CREATE: 'COLLECTION_CREATE',
      COLLECTION_UPDATE: 'COLLECTION_UPDATE',
      COLLECTION_DELETE: 'COLLECTION_DELETE',
      
      // Movie/Show viewing activities
      MOVIE_VIEW: 'MOVIE_VIEW',
      SHOW_VIEW: 'SHOW_VIEW'
    };

    this.RESOURCE_TYPES = {
      MOVIE: 'MOVIE',
      SHOW: 'SHOW',
      USER: 'USER',
      COMMENT: 'COMMENT',
      RATING: 'RATING',
      WATCHLIST: 'WATCHLIST',
      COLLECTION: 'COLLECTION'
    };

    this.ACTIONS = {
      CREATE: 'CREATE',
      UPDATE: 'UPDATE',
      DELETE: 'DELETE',
      LIKE: 'LIKE',
      UNLIKE: 'UNLIKE',
      VIEW: 'VIEW',
      LOGIN: 'LOGIN',
      LOGOUT: 'LOGOUT'
    };
  }

  /**
   * Check if a string is a valid ObjectId (24-character hex string)
   * @param {string} id - The string to check
   * @returns {boolean} - Whether it's a valid ObjectId
   */
  isValidObjectId(id) {
    return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);
  }

  /**
   * Log user activity
   * @param {Object} activityData - Activity data
   * @param {string} activityData.userId - User ID
   * @param {string} activityData.activityType - Type of activity
   * @param {string} activityData.action - Action performed
   * @param {string} activityData.resourceType - Type of resource
   * @param {string} activityData.resourceId - ID of related resource
   * @param {Object} activityData.metadata - Additional metadata
   * @param {Object} activityData.req - Express request object (for auto-extraction)
   */
  async logActivity(activityData) {
    const { db } = require('./db-mongodb');

    try {
      // Check database connection first
      if (!db.isConfigured() || !db.isConnected) {
        console.warn('[ActivityService] Database not available, skipping activity logging');
        return null;
      }

      // Auto-extract request data if req object is provided
      let metadata = activityData.metadata || {};
      if (activityData.req) {
        const req = activityData.req;
        metadata = {
          ...metadata,
          endpoint: req.originalUrl || req.path,
          method: req.method,
          userAgent: req.get('User-Agent'),
          ipAddress: req.ip || req.connection.remoteAddress,
          timestamp: new Date()
        };
        delete activityData.req; // Remove req from stored data
      }

      
      const activity = {
        userId: typeof activityData.userId === 'string' ? new ObjectId(activityData.userId) : activityData.userId,
        activityType: activityData.activityType,
        action: activityData.action || this.getActionFromActivityType(activityData.activityType),
        resourceType: activityData.resourceType,
        resourceId: activityData.resourceId ? (this.isValidObjectId(activityData.resourceId) ? new ObjectId(activityData.resourceId) : activityData.resourceId) : null,
        metadata,
        createdAt: new Date(),
        isActive: true
      };

      const result = await db.insertActivity(activity);
      return result;
    } catch (error) {
      console.error('[ActivityService] Error logging activity:', error);
      // Don't throw error to avoid breaking main functionality
      return null;
    }
  }

  /**
   * Get action from activity type
   * @param {string} activityType - Activity type
   * @returns {string} Action
   */
  getActionFromActivityType(activityType) {
    const actionMap = {
      [this.ACTIVITY_TYPES.LOGIN]: this.ACTIONS.LOGIN,
      [this.ACTIVITY_TYPES.LOGOUT]: this.ACTIONS.LOGOUT,
      [this.ACTIVITY_TYPES.PASSWORD_CHANGE]: this.ACTIONS.UPDATE,
      [this.ACTIVITY_TYPES.PROFILE_UPDATE]: this.ACTIONS.UPDATE,
      [this.ACTIVITY_TYPES.COMMENT_CREATE]: this.ACTIONS.CREATE,
      [this.ACTIVITY_TYPES.COMMENT_UPDATE]: this.ACTIONS.UPDATE,
      [this.ACTIVITY_TYPES.COMMENT_DELETE]: this.ACTIONS.DELETE,
      [this.ACTIVITY_TYPES.COMMENT_LIKE]: this.ACTIONS.LIKE,
      [this.ACTIVITY_TYPES.COMMENT_UNLIKE]: this.ACTIONS.UNLIKE,
      [this.ACTIVITY_TYPES.RATING_CREATE]: this.ACTIONS.CREATE,
      [this.ACTIVITY_TYPES.RATING_UPDATE]: this.ACTIONS.UPDATE,
      [this.ACTIVITY_TYPES.RATING_DELETE]: this.ACTIONS.DELETE,
      [this.ACTIVITY_TYPES.WATCHLIST_ADD]: this.ACTIONS.CREATE,
      [this.ACTIVITY_TYPES.WATCHLIST_REMOVE]: this.ACTIONS.DELETE,
      [this.ACTIVITY_TYPES.WATCHLIST_UPDATE]: this.ACTIONS.UPDATE,
      [this.ACTIVITY_TYPES.COLLECTION_CREATE]: this.ACTIONS.CREATE,
      [this.ACTIVITY_TYPES.COLLECTION_UPDATE]: this.ACTIONS.UPDATE,
      [this.ACTIVITY_TYPES.COLLECTION_DELETE]: this.ACTIONS.DELETE,
      [this.ACTIVITY_TYPES.MOVIE_VIEW]: this.ACTIONS.VIEW,
      [this.ACTIVITY_TYPES.SHOW_VIEW]: this.ACTIONS.VIEW
    };

    return actionMap[activityType] || this.ACTIONS.CREATE;
  }

  /**
   * Get user activities with pagination and filtering
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @param {number} options.limit - Number of activities to return
   * @param {number} options.skip - Number of activities to skip
   * @param {string} options.activityType - Filter by activity type
   * @param {string} options.resourceType - Filter by resource type
   * @param {Date} options.startDate - Filter by start date
   * @param {Date} options.endDate - Filter by end date
   */
  async getUserActivities(userId, options = {}) {
    const { db } = require('./db-mongodb');
    
    const {
      limit = 20,
      skip = 0,
      activityType,
      resourceType,
      startDate,
      endDate
    } = options;

    return await db.getUserActivities(new ObjectId(userId), {
      limit,
      skip,
      activityType,
      resourceType,
      startDate,
      endDate
    });
  }

  /**
   * Get all activities (admin only)
   * @param {Object} options - Query options
   */
  async getAllActivities(options = {}) {
    const { db } = require('./db-mongodb');
    
    const {
      limit = 50,
      skip = 0,
      userId,
      activityType,
      resourceType,
      startDate,
      endDate
    } = options;

    return await db.getAllActivities({
      limit,
      skip,
      userId: userId ? new ObjectId(userId) : null,
      activityType,
      resourceType,
      startDate,
      endDate
    });
  }

  /**
   * Get activity statistics for a user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   */
  async getUserActivityStats(userId, options = {}) {
    const { db } = require('./db-mongodb');
    
    const { startDate, endDate } = options;
    
    return await db.getUserActivityStats(new ObjectId(userId), {
      startDate,
      endDate
    });
  }

  /**
   * Delete old activities (cleanup)
   * @param {number} daysOld - Delete activities older than this many days
   */
  async cleanupOldActivities(daysOld = 90) {
    const { db } = require('./db-mongodb');
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    return await db.deleteOldActivities(cutoffDate);
  }

  // Convenience methods for common activity types

  async logLogin(userId, req) {
    return await this.logActivity({
      userId,
      activityType: this.ACTIVITY_TYPES.LOGIN,
      resourceType: this.RESOURCE_TYPES.USER,
      resourceId: userId,
      req
    });
  }

  async logLogout(userId, req) {
    return await this.logActivity({
      userId,
      activityType: this.ACTIVITY_TYPES.LOGOUT,
      resourceType: this.RESOURCE_TYPES.USER,
      resourceId: userId,
      req
    });
  }

  async logPasswordChange(userId, req) {
    return await this.logActivity({
      userId,
      activityType: this.ACTIVITY_TYPES.PASSWORD_CHANGE,
      resourceType: this.RESOURCE_TYPES.USER,
      resourceId: userId,
      req
    });
  }

  async logProfileUpdate(userId, req, changes = {}) {
    return await this.logActivity({
      userId,
      activityType: this.ACTIVITY_TYPES.PROFILE_UPDATE,
      resourceType: this.RESOURCE_TYPES.USER,
      resourceId: userId,
      metadata: { changes },
      req
    });
  }

  async logCommentCreate(userId, commentId, movieId, showId, req) {
    const resourceType = movieId ? this.RESOURCE_TYPES.MOVIE : this.RESOURCE_TYPES.SHOW;
    const resourceId = movieId || showId;
    
    return await this.logActivity({
      userId,
      activityType: this.ACTIVITY_TYPES.COMMENT_CREATE,
      resourceType,
      resourceId,
      metadata: { commentId },
      req
    });
  }

  async logRatingCreate(userId, ratingId, movieId, showId, rating, req) {
    const resourceType = movieId ? this.RESOURCE_TYPES.MOVIE : this.RESOURCE_TYPES.SHOW;
    const resourceId = movieId || showId;
    
    return await this.logActivity({
      userId,
      activityType: this.ACTIVITY_TYPES.RATING_CREATE,
      resourceType,
      resourceId,
      metadata: { ratingId, rating },
      req
    });
  }

  async logWatchlistAdd(userId, movieId, showId, collectionId, req) {
    const resourceType = movieId ? this.RESOURCE_TYPES.MOVIE : this.RESOURCE_TYPES.SHOW;
    const resourceId = movieId || showId;
    
    return await this.logActivity({
      userId,
      activityType: this.ACTIVITY_TYPES.WATCHLIST_ADD,
      resourceType,
      resourceId,
      metadata: { collectionId },
      req
    });
  }

  async logMovieView(userId, movieId, req) {
    return await this.logActivity({
      userId,
      activityType: this.ACTIVITY_TYPES.MOVIE_VIEW,
      resourceType: this.RESOURCE_TYPES.MOVIE,
      resourceId: movieId,
      req
    });
  }

  async logShowView(userId, showId, req) {
    return await this.logActivity({
      userId,
      activityType: this.ACTIVITY_TYPES.SHOW_VIEW,
      resourceType: this.RESOURCE_TYPES.SHOW,
      resourceId: showId,
      req
    });
  }
}

// Create singleton instance
const activityService = new ActivityService();

module.exports = { ActivityService: activityService };