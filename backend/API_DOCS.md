# API Documentation

This document describes the API endpoints for the Trakt Proxy application. These endpoints provide user authentication, profile management, and local movie interaction features stored in MongoDB.

## Overview

The application provides two types of API endpoints:
1. **Trakt Proxy APIs** (`/api/trakt/*`, `/api/trakt-new/*`) - Proxy requests to Trakt.tv API with caching
2. **Local APIs** (`/api/auth/*`, `/api/comments/*`, `/api/ratings/*`, `/api/watchlist/*`) - Store data locally in MongoDB

All local APIs are completely independent of Trakt.tv and store user-generated content in the local MongoDB database.

## Data Architecture

### Integration Flow
1. **Movie Discovery**: Use `/api/trakt-new/*` endpoints to search and browse movies from Trakt.tv
2. **User Interactions**: Use `/api/comments/*`, `/api/ratings/*`, and `/api/watchlist/*` to store user-generated content locally
3. **Data Association**: Local content is associated with movies using Trakt movie IDs

### Storage Strategy
- **Movie Metadata**: Cached from Trakt.tv API in MongoDB with TTL
- **User Content**: Comments, ratings, and watchlist items stored permanently in MongoDB
- **User Accounts**: Authentication and profile data stored in MongoDB
- **Sessions**: JWT tokens with expiration tracking in MongoDB

## Authentication

All protected endpoints require Bearer token authentication in the `Authorization` header:
```
Authorization: Bearer <your-jwt-token>
```

---

## Authentication API

### Base URL: `/api/auth`

### POST /api/auth
Handles user authentication actions (register, login, logout, verify).

**Request Body:**
```json
{
  "action": "register|login|logout|verify",
  "email": "string",
  "username": "string",           // Required for register
  "password": "string",
  "firstName": "string (optional)", // Required for register
  "lastName": "string (optional)"   // Required for register
}
```

**Actions:**

#### Register
- **Action:** `register`
- **Required Fields:** `email`, `username`, `password`
- **Optional Fields:** `firstName`, `lastName`
- **Validations:**
  - Email must be valid format
  - Username must be at least 3 characters
  - Password must be at least 6 characters
- **Response (201):**
```json
{
  "user": {
    "_id": "string",
    "email": "string",
    "username": "string",
    "firstName": "string",
    "lastName": "string",
    "isActive": true,
    "emailVerified": false,
    "createdAt": "string",
    "updatedAt": "string"
  },
  "token": "string"
}
```

#### Login
- **Action:** `login`
- **Required Fields:** `email`, `password`
- **Response (200):** Same as register response

#### Logout
- **Action:** `logout`
- **Authentication Required:** Yes
- **Response (200):**
```json
{
  "message": "Logged out successfully"
}
```

#### Verify
- **Action:** `verify`
- **Authentication Required:** Yes
- **Response (200):**
```json
{
  "user": {
    "_id": "string",
    "email": "string",
    "username": "string",
    "firstName": "string",
    "lastName": "string",
    "isActive": true,
    "emailVerified": false,
    "createdAt": "string",
    "updatedAt": "string"
  }
}
```

### GET /api/auth?action=verify
Verifies current authentication token.

**Authentication Required:** Yes
**Response (200):** Same as verify action above

---

## User Profile API

### Base URL: `/api/user/profile`

### GET /api/user/profile
Retrieves user profile with statistics.

**Authentication Required:** Yes
**Response (200):**
```json
{
  "_id": "string",
  "email": "string",
  "username": "string",
  "firstName": "string",
  "lastName": "string",
  "bio": "string",
  "avatar": "string",
  "isActive": true,
  "emailVerified": false,
  "createdAt": "string",
  "updatedAt": "string",
  "stats": {
    "ratingsCount": 0,
    "commentsCount": 0
  }
}
```

### PUT /api/user/profile
Updates user profile information.

**Authentication Required:** Yes
**Request Body:**
```json
{
  "firstName": "string (optional)",
  "lastName": "string (optional)",
  "bio": "string (optional)",
  "avatar": "string (optional)"
}
```
**Response (200):** Returns updated user profile (same structure as GET)

---

## Movie Comments API

### Base URL: `/api/comments`

**Note:** This API stores all comments locally in MongoDB and is completely independent of Trakt.tv. Comments are user-generated content tied to specific movies using Trakt movie IDs.

### GET /api/comments
Retrieves movie comments with pagination.

**Query Parameters:**
- `movieId` (string, required if userId not provided): Trakt Movie ID to fetch comments for
- `userId` (string, required if movieId not provided): User ID to fetch comments by specific user
- `limit` (number, default: 20): Items per page (max 100)
- `skip` (number, default: 0): Items to skip (for pagination)

**Response (200):**
```json
{
  "comments": [
    {
      "_id": "string",
      "userId": "string",
      "movieId": "string",
      "content": "string",
      "isSpoiler": false,
      "likes": 0,
      "likedBy": ["string"],
      "createdAt": "string",
      "updatedAt": "string",
      "user": {
        "_id": "string",
        "username": "string",
        "firstName": "string",
        "lastName": "string",
        "avatar": "string"
      }
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

### POST /api/comments
Creates a new movie comment.

**Authentication Required:** Yes
**Request Body:**
```json
{
  "movieId": "string",
  "content": "string",
  "isSpoiler": false
}
```
**Validations:**
- Content must be between 1 and 2000 characters
- Movie ID (Trakt ID) is required
- isSpoiler must be a boolean
- User must be authenticated

**Behavior:**
- Comments are stored locally in MongoDB
- Comments are tied to both the user and the movie
- Each comment tracks likes and likedBy users
- Comments can be edited by the original author
- Comments can be marked as spoilers

**Response (201):** Returns created comment with user info

### DELETE /api/comments?commentId=<id>
Deletes a movie comment.

**Authentication Required:** Yes
**Query Parameters:**
- `commentId` (string, required): Comment ID

**Response (200):**
```json
{
  "message": "Comment deleted successfully"
}
```

### PUT /api/comments
Likes or unlikes a comment, or edits comment content.

**Authentication Required:** Yes
**Request Body:**
```json
{
  "commentId": "string",
  "action": "like|unlike" // OR
  "content": "string"     // For editing
}
```

**Actions:**
- **Like:** Adds user to likedBy array and increments likes count (user can only like once)
- **Unlike:** Removes user from likedBy array and decrements likes count
- **Edit:** Updates comment content (only original author can edit)

**Behavior:**
- Like/unlike actions are tracked to prevent duplicate likes
- Edit action updates the comment and sets updatedAt timestamp
- All actions are validated to ensure user permissions

**Response (200):**
```json
{
  "message": "Comment liked successfully" | "Comment unliked successfully" | "Comment updated successfully"
}
```

---

## Movie Ratings API

### Base URL: `/api/ratings`

**Note:** This API stores all ratings locally in MongoDB and is completely independent of Trakt.tv. Ratings are user-generated content tied to specific movies using Trakt movie IDs.

### GET /api/ratings
Retrieves movie ratings with pagination and statistics.

**Query Parameters:**
- `movieId` (string, required if userId not provided): Trakt Movie ID to fetch ratings for
- `userId` (string, required if movieId not provided): User ID to fetch ratings by specific user
- `limit` (number, default: 20): Items per page (max 100)
- `skip` (number, default: 0): Items to skip (for pagination)

**Response for Movie Ratings (200):**
```json
{
  "ratings": [
    {
      "_id": "string",
      "userId": "string",
      "movieId": "string",
      "rating": 8,
      "review": "string",
      "createdAt": "string",
      "updatedAt": "string",
      "user": {
        "_id": "string",
        "username": "string",
        "firstName": "string",
        "lastName": "string",
        "avatar": "string"
      }
    }
  ],
  "averageRating": 7.5,
  "totalRatings": 42,
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 42,
    "totalPages": 3
  }
}
```

**Response for User Ratings (200):**
```json
{
  "ratings": [
    {
      "_id": "string",
      "userId": "string",
      "movieId": "string",
      "rating": 8,
      "review": "string",
      "createdAt": "string",
      "updatedAt": "string"
    }
  ],
  "user": {
    "_id": "string",
    "username": "string",
    "firstName": "string",
    "lastName": "string",
    "avatar": "string"
  },
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 25,
    "totalPages": 2
  }
}
```

### POST /api/ratings
Creates or updates a movie rating.

**Authentication Required:** Yes
**Request Body:**
```json
{
  "movieId": "string",
  "rating": 8,
  "review": "string (optional)"
}
```
**Validations:**
- Rating must be between 1 and 10 (inclusive)
- Movie ID (Trakt ID) is required
- Review is optional but limited to 2000 characters if provided
- User must be authenticated

**Behavior:**
- Ratings are stored locally in MongoDB
- Each user can only have one rating per movie
- If user has already rated the movie, updates existing rating
- If no existing rating, creates new rating
- Updates user profile statistics
- Calculates average rating for movies

**Response (201 for new, 200 for update):** Returns rating with user info

### DELETE /api/ratings?movieId=<id>
Deletes a movie rating.

**Authentication Required:** Yes
**Query Parameters:**
- `movieId` (string, required): Trakt Movie ID to remove rating for

**Behavior:**
- Users can only delete their own ratings
- Updates user profile statistics
- Recalculates average rating for the movie
- Rating is permanently removed from database

**Response (200):**
```json
{
  "message": "Rating deleted successfully"
}
```

---

## Watchlist API

### Base URL: `/api/watchlist`

### GET /api/watchlist
Retrieves user's watchlist with pagination.

**Authentication Required:** Yes
**Query Parameters:**
- `limit` (number, default: 20): Items per page (max 100)
- `skip` (number, default: 0): Items to skip (for pagination)
- `includeDetails` (boolean, default: false): Include full movie details

**Response (200):**
```json
{
  "watchlist": [
    {
      "_id": "string",
      "userId": "string",
      "movieId": "string",
      "notes": "string",
      "priority": "low|medium|high",
      "createdAt": "string",
      "updatedAt": "string",
      "movie": {
        // Full movie details when includeDetails=true
        "title": "string",
        "year": 2024,
        "overview": "string",
        "poster": "string",
        // ... other movie fields
      }
    }
  ],
  "pagination": {
    "limit": 20,
    "skip": 0,
    "totalCount": 25
  }
}
```

### POST /api/watchlist
Adds a movie to user's watchlist.

**Authentication Required:** Yes
**Request Body:**
```json
{
  "movieId": "string",
  "notes": "string (optional)",
  "priority": "low|medium|high (default: medium)"
}
```
**Validations:**
- Movie ID is required
- Priority must be one of: low, medium, high
- Movie cannot already be in watchlist

**Response (201):**
```json
{
  "message": "Movie added to watchlist successfully",
  "watchlistItemId": "string"
}
```

### PUT /api/watchlist
Updates an existing watchlist item.

**Authentication Required:** Yes
**Request Body:**
```json
{
  "movieId": "string",
  "notes": "string (optional)",
  "priority": "low|medium|high (optional)"
}
```
**Validations:**
- Movie ID is required
- At least one field (notes or priority) must be provided
- Movie must exist in watchlist
- Priority must be one of: low, medium, high

**Response (200):**
```json
{
  "message": "Watchlist item updated successfully"
}
```

### DELETE /api/watchlist?movieId=<id>
Removes a movie from user's watchlist.

**Authentication Required:** Yes
**Query Parameters:**
- `movieId` (string, required): Movie ID to remove from watchlist

**Response (200):**
```json
{
  "message": "Movie removed from watchlist successfully"
}
```

---

## API Logs

### Base URL: `/api/logs`

### GET /api/logs
Retrieves API usage logs with pagination.

**Authentication Required:** Yes
**Query Parameters:**
- `limit` (number, default: 50): Items per page
- `skip` (number, default: 0): Items to skip (for pagination)

**Response (200):**
```json
{
  "logs": [
    {
      "_id": "string",
      "method": "GET|POST|PUT|DELETE",
      "path": "/api/endpoint",
      "query": {},
      "statusCode": 200,
      "responseTime": 150,
      "userAgent": "string",
      "ip": "string",
      "timestamp": "string"
    }
  ],
  "pagination": {
    "limit": 50,
    "skip": 0,
    "totalCount": 1250
  }
}
```

---

## Error Responses

All endpoints return standardized error responses:

### 400 Bad Request
```json
{
  "error": "Validation error message"
}
```

### 401 Unauthorized
```json
{
  "error": "Authentication required" | "Invalid or expired token"
}
```

### 404 Not Found
```json
{
  "error": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error"
}
```

---

## Database Schema

### Users Collection
```typescript
{
  _id: ObjectId,
  email: string,
  username: string,
  password: string (hashed),
  firstName: string,
  lastName: string,
  bio: string,
  avatar: string,
  isActive: boolean,
  emailVerified: boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### User Sessions Collection
```typescript
{
  _id: ObjectId,
  userId: ObjectId,
  token: string,
  expiresAt: Date,
  createdAt: Date
}
```

### Movie Comments Collection
```typescript
{
  _id: ObjectId,
  userId: ObjectId,
  movieId: string,
  content: string,
  isSpoiler: boolean,
  likes: number,
  likedBy: ObjectId[],
  createdAt: Date,
  updatedAt: Date
}
```

### Movie Ratings Collection
```typescript
{
  _id: ObjectId,
  userId: ObjectId,
  movieId: string,
  rating: number,
  review: string,
  createdAt: Date,
  updatedAt: Date
}
```

### Watchlist Collection
```typescript
{
  _id: ObjectId,
  userId: ObjectId,
  movieId: string,
  notes: string,
  priority: "low"|"medium"|"high",
  createdAt: Date,
  updatedAt: Date
}
```

---

## Rate Limiting

Currently, no rate limiting is implemented. Consider adding rate limiting for production use.

## Security Considerations

- All passwords are hashed using bcrypt (12 rounds)
- JWT tokens expire in 7 days by default
- Sessions are tracked in MongoDB
- Input validation is performed on all endpoints
- CORS headers are configured for browser compatibility
- Database connections are properly managed with connection pooling