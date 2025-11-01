const { ActivityService } = require('./activity-service');

/**
 * Simple activity logger utility that can be called directly from endpoints
 * This avoids the complexity and potential issues of middleware-based logging
 */
class ActivityLogger {
  constructor() {
    this.activityService = ActivityService;
  }

  /**
   * Log an activity asynchronously without blocking the request
   * @param {Object} activityData - Activity data
   * @param {string} activityData.userId - User ID
   * @param {string} activityData.activityType - Type of activity
   * @param {string} activityData.resourceType - Type of resource
   * @param {string} activityData.resourceId - ID of related resource
   * @param {Object} activityData.metadata - Additional metadata
   * @param {Object} activityData.req - Express request object (optional)
   */
  async logActivity(activityData) {
    // Log asynchronously without blocking
    this.activityService.logActivity(activityData).catch(error => {
      console.error('[ActivityLogger] Error logging activity:', error);
    });
  }

  // Convenience methods for common activity types

  async logCommentCreate(userId, commentId, movieId, showId, req) {
    const resourceType = movieId ? this.activityService.RESOURCE_TYPES.MOVIE : this.activityService.RESOURCE_TYPES.SHOW;
    const resourceId = movieId || showId;

    await this.logActivity({
      userId,
      activityType: this.activityService.ACTIVITY_TYPES.COMMENT_CREATE,
      resourceType,
      resourceId,
      metadata: { commentId },
      req
    });
  }

  async logRatingCreate(userId, ratingId, movieId, showId, rating, req) {
    const resourceType = movieId ? this.activityService.RESOURCE_TYPES.MOVIE : this.activityService.RESOURCE_TYPES.SHOW;
    const resourceId = movieId || showId;

    await this.logActivity({
      userId,
      activityType: this.activityService.ACTIVITY_TYPES.RATING_CREATE,
      resourceType,
      resourceId,
      metadata: { ratingId, rating },
      req
    });
  }

  async logWatchlistAdd(userId, movieId, showId, collectionId, req) {
    const resourceType = movieId ? this.activityService.RESOURCE_TYPES.MOVIE : this.activityService.RESOURCE_TYPES.SHOW;
    const resourceId = movieId || showId;

    await this.logActivity({
      userId,
      activityType: this.activityService.ACTIVITY_TYPES.WATCHLIST_ADD,
      resourceType,
      resourceId,
      metadata: { collectionId },
      req
    });
  }

  async logLogin(userId, req) {
    await this.logActivity({
      userId,
      activityType: this.activityService.ACTIVITY_TYPES.LOGIN,
      resourceType: this.activityService.RESOURCE_TYPES.USER,
      resourceId: userId,
      req
    });
  }

  async logLogout(userId, req) {
    await this.logActivity({
      userId,
      activityType: this.activityService.ACTIVITY_TYPES.LOGOUT,
      resourceType: this.activityService.RESOURCE_TYPES.USER,
      resourceId: userId,
      req
    });
  }
}

// Create singleton instance
const activityLogger = new ActivityLogger();

module.exports = { activityLogger };