# Recent Activity System Documentation

## Overview

The Recent Activity System provides comprehensive tracking of user interactions across the Pickford API. It monitors and logs all user activities including authentication events, content interactions, profile updates, and watchlist operations.

## Features

- **Comprehensive Activity Tracking**: Logs all user interactions with detailed metadata
- **Real-time Monitoring**: Automatic activity logging through middleware
- **Flexible Querying**: Filter activities by type, date range, and resource
- **Performance Optimized**: Database indexes for fast queries
- **Privacy Controls**: Users can only view their own activities

## Architecture

### Components

1. **Activity Service** (`lib/activity-service.js`)
   - Centralized activity logging functionality
   - Activity type constants and validation
   - Convenience methods for common operations

2. **Activity Middleware** (`lib/activity-middleware.js`)
   - Express middleware for automatic activity logging
   - Configurable endpoint tracking
   - Request/response interception

3. **Database Methods** (`lib/db-mongodb.js`)
   - Activity storage and retrieval operations
   - Optimized indexes for performance
   - Cleanup and maintenance functions

4. **API Endpoints** (`app.js`)
   - User activity retrieval endpoints
   - Activity statistics endpoints
   - Admin access to global activities

## Activity Types

### Authentication Activities
- `LOGIN` - User login
- `LOGOUT` - User logout  
- `PASSWORD_CHANGE` - Password reset/change
- `PROFILE_UPDATE` - Profile information changes

### Content Interaction Activities
- `COMMENT_CREATE` - New comment on movie/show
- `COMMENT_UPDATE` - Comment edited
- `COMMENT_DELETE` - Comment removed
- `COMMENT_LIKE` - Comment liked
- `COMMENT_UNLIKE` - Comment unliked

### Rating Activities
- `RATING_CREATE` - New rating for movie/show
- `RATING_UPDATE` - Rating modified
- `RATING_DELETE` - Rating removed

### Watchlist Activities
- `WATCHLIST_ADD` - Item added to watchlist
- `WATCHLIST_REMOVE` - Item removed from watchlist
- `WATCHLIST_UPDATE` - Watchlist item updated
- `COLLECTION_CREATE` - New watchlist collection created
- `COLLECTION_UPDATE` - Collection modified
- `COLLECTION_DELETE` - Collection removed

### Viewing Activities
- `MOVIE_VIEW` - Movie details viewed
- `SHOW_VIEW` - Show details viewed

## Database Schema

### user_activities Collection

```javascript
{
  _id: ObjectId,              // Activity ID
  userId: ObjectId,            // User who performed the action
  activityType: String,         // Type of activity (LOGIN, COMMENT_CREATE, etc.)
  action: String,              // Action performed (CREATE, UPDATE, DELETE, etc.)
  resourceType: String,        // Type of resource (MOVIE, SHOW, USER, etc.)
  resourceId: ObjectId,        // ID of related resource
  metadata: {                 // Additional context-specific data
    endpoint: String,          // API endpoint that triggered activity
    method: String,           // HTTP method
    userAgent: String,         // User agent information
    ipAddress: String,         // IP address
    timestamp: Date,          // When the activity occurred
    changes: Object,          // Profile update changes
    rating: Number,           // Rating value
    review: String,           // Rating review text
    commentId: ObjectId,       // Comment ID
    collectionId: ObjectId     // Collection ID
  },
  createdAt: Date,             // When activity was logged
  isActive: Boolean           // For soft deletes
}
```

## API Endpoints

### Get User Activities

```http
GET /api/activities/users/{userId}
```

**Query Parameters:**
- `limit` (optional): Number of activities to return (default: 20)
- `skip` (optional): Number of activities to skip (default: 0)
- `activityType` (optional): Filter by activity type
- `resourceType` (optional): Filter by resource type
- `startDate` (optional): Filter by start date (ISO format)
- `endDate` (optional): Filter by end date (ISO format)

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response (200):**
```json
{
  "success": true,
  "activities": [
    {
      "_id": "activity_id",
      "userId": "user_id",
      "activityType": "COMMENT_CREATE",
      "action": "CREATE",
      "resourceType": "MOVIE",
      "resourceId": "movie_id",
      "metadata": {
        "endpoint": "/api/comments",
        "method": "POST",
        "userAgent": "Mozilla/5.0...",
        "ipAddress": "192.168.1.1",
        "timestamp": "2024-01-01T12:00:00.000Z",
        "commentId": "comment_id"
      },
      "createdAt": "2024-01-01T12:00:00.000Z",
      "isActive": true
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 100,
    "totalPages": 5
  }
}
```

### Get All Activities (Admin)

```http
GET /api/activities
```

**Query Parameters:**
- All parameters from user activities endpoint
- `userId` (optional): Filter by specific user ID

**Response:** Same structure as user activities endpoint

### Get User Activity Statistics

```http
GET /api/activities/users/{userId}/stats
```

**Query Parameters:**
- `startDate` (optional): Filter by start date
- `endDate` (optional): Filter by end date

**Response (200):**
```json
{
  "success": true,
  "stats": {
    "totalActivities": 150,
    "activityBreakdown": [
      {
        "_id": "COMMENT_CREATE",
        "count": 45,
        "lastActivity": "2024-01-01T12:00:00.000Z"
      },
      {
        "_id": "RATING_CREATE", 
        "count": 30,
        "lastActivity": "2024-01-01T10:00:00.000Z"
      }
    ],
    "period": {
      "startDate": "2024-01-01T00:00:00.000Z",
      "endDate": "2024-01-31T23:59:59.999Z"
    }
  }
}
```

## Usage Examples

### Track Custom Activity

```javascript
const { ActivityService } = require('./lib/activity-service');

// Log custom activity
await ActivityService.logActivity({
  userId: 'user_id',
  activityType: ActivityService.ACTIVITY_TYPES.CUSTOM_ACTION,
  resourceType: ActivityService.RESOURCE_TYPES.MOVIE,
  resourceId: 'movie_id',
  metadata: {
    customField: 'custom_value',
    additionalInfo: { key: 'value' }
  },
  req: requestObject
});
```

### Use Convenience Methods

```javascript
// Log login
await ActivityService.logLogin(userId, req);

// Log comment creation
await ActivityService.logCommentCreate(userId, commentId, movieId, null, req);

// Log rating
await ActivityService.logRatingCreate(userId, ratingId, movieId, null, 8, req);

// Log watchlist addition
await ActivityService.logWatchlistAdd(userId, movieId, null, collectionId, req);
```

## Performance Considerations

### Database Indexes

The system creates the following indexes for optimal performance:

1. `{ userId: 1, createdAt: -1 }` - Fast user activity queries
2. `{ activityType: 1, createdAt: -1 }` - Activity type filtering
3. `{ resourceType: 1, resourceId: 1, createdAt: -1 }` - Resource-based queries
4. `{ createdAt: 1 }` with TTL (90 days) - Automatic cleanup
5. `{ isActive: 1 }` - Soft delete filtering

### Cleanup Strategy

- **Automatic TTL**: Activities automatically expire after 90 days
- **Manual Cleanup**: Use `ActivityService.cleanupOldActivities(days)` for custom cleanup
- **Soft Deletes**: Use `isActive` flag for immediate hiding

## Security & Privacy

### Access Control

- **User Activities**: Users can only view their own activities
- **Admin Access**: Special endpoints for viewing all activities (requires admin role)
- **Data Filtering**: Sensitive data automatically filtered from responses

### Data Protection

- **Password Exclusion**: Passwords and tokens never logged
- **IP Address**: Logged for security auditing
- **User Agent**: Logged for device tracking
- **PII Protection**: Personal information handled according to privacy policies

## Configuration

### Environment Variables

```bash
# Activity system configuration
ACTIVITY_RETENTION_DAYS=90        # Days to keep activities (default: 90)
ACTIVITY_CLEANUP_ENABLED=true     # Enable automatic cleanup (default: true)
ACTIVITY_LOG_LEVEL=info         # Logging level (default: info)
```

### Middleware Configuration

The activity middleware can be configured to track specific endpoints:

```javascript
// Custom endpoint configuration
const customConfig = {
  'POST:/api/custom-endpoint': {
    activityType: ActivityService.ACTIVITY_TYPES.CUSTOM_ACTION,
    resourceType: ActivityService.RESOURCE_TYPES.CUSTOM_RESOURCE,
    extractUserId: (req) => req.user?._id,
    extractResourceId: (req) => req.body.resourceId,
    extractMetadata: (req) => ({ custom: req.body.customData })
  }
};
```

## Monitoring & Debugging

### Activity Logging

The system provides detailed logging for debugging:

```javascript
// Enable debug logging
process.env.ACTIVITY_LOG_LEVEL = 'debug';

// Check activity service logs
console.log('[ActivityService] Activity logged:', activityData);
```

### Performance Monitoring

Monitor activity system performance:

```javascript
// Check database query performance
const startTime = Date.now();
const activities = await ActivityService.getUserActivities(userId, options);
const queryTime = Date.now() - startTime;
console.log(`Activity query took ${queryTime}ms`);
```

## Troubleshooting

### Common Issues

1. **Activities Not Logging**
   - Check middleware is properly registered
   - Verify user is set in request object
   - Confirm endpoint configuration exists

2. **Performance Issues**
   - Ensure database indexes are created
   - Check query complexity and pagination
   - Monitor database connection pool

3. **Missing Activity Data**
   - Verify extractUserId function returns correct ID
   - Check resourceId extraction logic
   - Confirm metadata extraction

### Debug Commands

```javascript
// Test activity logging
const testActivity = await ActivityService.logActivity({
  userId: 'test_user_id',
  activityType: ActivityService.ACTIVITY_TYPES.LOGIN,
  resourceType: ActivityService.RESOURCE_TYPES.USER,
  resourceId: 'test_user_id',
  metadata: { test: true }
});

// Verify activity was logged
const activities = await ActivityService.getUserActivities('test_user_id');
console.log('Test activity:', activities.activities[0]);
```

## Future Enhancements

### Planned Features

1. **Real-time Notifications**: WebSocket-based activity notifications
2. **Activity Feeds**: Social activity feeds for users
3. **Advanced Analytics**: Machine learning insights from activity patterns
4. **Export Functionality**: CSV/JSON export of activity data
5. **Activity Aggregation**: Daily/weekly/monthly activity summaries

### Extensibility

The system is designed for easy extension:

- **New Activity Types**: Add to ActivityService.ACTIVITY_TYPES
- **Custom Resources**: Extend RESOURCE_TYPES enum
- **Advanced Metadata**: Enhance metadata structure
- **Custom Middleware**: Create specialized tracking middleware

## API Reference

### ActivityService Methods

- `logActivity(activityData)` - Log custom activity
- `getUserActivities(userId, options)` - Get user activities with pagination
- `getAllActivities(options)` - Get all activities (admin)
- `getUserActivityStats(userId, options)` - Get activity statistics
- `cleanupOldActivities(daysOld)` - Delete old activities
- `logLogin(userId, req)` - Log login activity
- `logLogout(userId, req)` - Log logout activity
- `logProfileUpdate(userId, req, changes)` - Log profile update
- `logCommentCreate(userId, commentId, movieId, showId, req)` - Log comment creation
- `logRatingCreate(userId, ratingId, movieId, showId, rating, req)` - Log rating creation
- `logWatchlistAdd(userId, movieId, showId, collectionId, req)` - Log watchlist addition

### Database Methods

- `insertActivity(activityData)` - Insert activity record
- `getUserActivities(userId, options)` - Query user activities
- `getAllActivities(options)` - Query all activities
- `getUserActivityStats(userId, options)` - Get activity statistics
- `deleteOldActivities(cutoffDate)` - Cleanup old activities
- `createActivityIndexes()` - Create performance indexes

This comprehensive activity system provides detailed tracking of all user interactions while maintaining performance, security, and privacy standards.