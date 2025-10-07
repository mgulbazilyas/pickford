# Pickford Backend API Documentation

## Base URL
```
http://localhost:3000 (development)
```

## Authentication
The API uses JWT tokens with a refresh token system for enhanced security.

### Token Types
- **Access Token**: Short-lived token (7 days) for API requests
- **Refresh Token**: Long-lived token (90 days) for obtaining new access tokens

### Authentication Headers
Include the access token in the Authorization header:
```
Authorization: Bearer <your-access-token>
```

## Response Format
All APIs return JSON responses with the following structure:
- Success: `200` status code with data
- Error: `4xx` or `5xx` status code with error message

## Table of Contents

1. [Authentication](#authentication)
2. [User Profile](#user-profile)
3. [Movies & Shows](#movies--shows)
4. [Watchlist](#watchlist)
5. [Comments](#comments)
6. [Ratings & Reviews](#ratings--reviews)
7. [API Logs](#api-logs)

### Show Endpoints
- **Watchlist**: `/api/shows/watchlist` (GET, POST, PUT, DELETE)
- **Comments**: `/api/shows/comments` (GET, POST, PUT, DELETE)
- **Ratings**: `/api/shows/ratings` (GET, POST, DELETE)

---

## Authentication

### Register New User
```http
POST /api/auth
```

**Request Body:**
```json
{
  "action": "register",
  "email": "user@example.com",
  "username": "username",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe"
}
```

**Response (201):**
```json
{
  "user": {
    "_id": "user_id",
    "email": "user@example.com",
    "username": "username",
    "firstName": "John",
    "lastName": "Doe",
    "createdAt": "2024-01-01T00:00:00.000Z"
  },
  "accessToken": "jwt_access_token_here",
  "refreshToken": "jwt_refresh_token_here",
  "expiresIn": 604800,
  "tokenType": "Bearer"
}
```

**Validation:**
- Email, username, and password are required
- Username must be at least 3 characters
- Password must be at least 6 characters

### Login User
```http
POST /api/auth
```

**Request Body:**
```json
{
  "action": "login",
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "user": {
    "_id": "user_id",
    "email": "user@example.com",
    "username": "username",
    "firstName": "John",
    "lastName": "Doe"
  },
  "accessToken": "jwt_access_token_here",
  "refreshToken": "jwt_refresh_token_here",
  "expiresIn": 604800,
  "tokenType": "Bearer"
}
```

### Logout User
```http
POST /api/auth
```

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "action": "logout"
}
```

**Response (200):**
```json
{
  "message": "Logged out successfully"
}
```

### Verify Token
```http
GET /api/auth?action=verify
```
or
```http
POST /api/auth
```

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body (POST):**
```json
{
  "action": "verify"
}
```

**Response (200):**
```json
{
  "_id": "user_id",
  "email": "user@example.com",
  "username": "username",
  "firstName": "John",
  "lastName": "Doe"
}
```

### Refresh Access Token
```http
POST /api/auth/refresh
```

**Request Body:**
```json
{
  "refreshToken": "jwt_refresh_token_here"
}
```

**Response (200):**
```json
{
  "accessToken": "new_jwt_access_token_here",
  "expiresIn": 604800,
  "tokenType": "Bearer"
}
```

**Error Response (401):**
```json
{
  "error": "Invalid or expired refresh token"
}
```

### Refresh Access Token (Alternative Method)
```http
POST /api/auth
```

**Request Body:**
```json
{
  "action": "refresh",
  "refreshToken": "jwt_refresh_token_here"
}
```

**Response (200):**
```json
{
  "accessToken": "new_jwt_access_token_here",
  "expiresIn": 604800,
  "tokenType": "Bearer"
}
```

---

## User Profile

### Get User Profile
```http
GET /api/user/profile
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "_id": "user_id",
  "email": "user@example.com",
  "username": "username",
  "firstName": "John",
  "lastName": "Doe",
  "bio": "User biography",
  "avatar": "avatar_url",
  "stats": {
    "ratingsCount": 25,
    "commentsCount": 10
  },
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### Update User Profile
```http
PUT /api/user/profile
```

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "bio": "Updated biography",
  "avatar": "new_avatar_url"
}
```

**Response (200):**
```json
{
  "_id": "user_id",
  "email": "user@example.com",
  "username": "username",
  "firstName": "John",
  "lastName": "Doe",
  "bio": "Updated biography",
  "avatar": "new_avatar_url"
}
```

---

## Movies & Shows

The application uses Trakt API as a data source. Movie and show data is accessed through proxy endpoints.

### Get Movie Details
```http
GET /api/trakt/movies/{id}
```

**Query Parameters:**
- `extended` (optional): Extension level (full, full,images, etc.)

**Response (200):**
```json
{
  "title": "Movie Title",
  "year": 2024,
  "ids": {
    "trakt": 12345,
    "slug": "movie-title-2024",
    "imdb": "tt1234567",
    "tmdb": 76543
  },
  "tagline": "Movie tagline",
  "overview": "Movie overview",
  "released": "2024-01-01",
  "runtime": 120,
  "country": "us",
  "genres": ["Action", "Drama"],
  "rating": 8.5,
  "votes": 1000,
  "language": "en"
}
```

### Get Show Details
```http
GET /api/trakt/shows/{id}
```

**Query Parameters:**
- `extended` (optional): Extension level (full, full,images, etc.)

**Response (200):**
```json
{
  "title": "Show Title",
  "year": 2024,
  "ids": {
    "trakt": 67890,
    "slug": "show-title-2024",
    "tvdb": 45678,
    "imdb": "tt7654321",
    "tmdb": 98765
  },
  "overview": "Show overview",
  "first_aired": "2024-01-01T10:00:00.000Z",
  "airs": {
    "day": "Monday",
    "time": "20:00",
    "timezone": "America/New_York"
  },
  "runtime": 60,
  "country": "us",
  "network": "HBO",
  "genres": ["Drama", "Thriller"],
  "status": "returning series",
  "rating": 9.0,
  "votes": 2000,
  "language": "en"
}
```

### Get Season Details
```http
GET /api/trakt/shows/{id}/seasons/{season_number}
```

**Query Parameters:**
- `extended` (optional): Extension level (full, full,images, etc.)

**Response (200):**
```json
{
  "number": 1,
  "title": "Season 1",
  "ids": {
    "trakt": 11111,
    "tmdb": 22222
  },
  "rating": 8.7,
  "votes": 500,
  "episode_count": 10,
  "aired_episodes": 10,
  "overview": "Season overview",
  "first_aired": "2024-01-01T10:00:00.000Z",
  "episodes": [
    {
      "season": 1,
      "number": 1,
      "title": "Episode Title",
      "ids": {
        "trakt": 33333,
        "imdb": "tt11223344"
      },
      "rating": 8.5,
      "votes": 100,
      "overview": "Episode overview",
      "first_aired": "2024-01-01T10:00:00.000Z"
    }
  ]
}
```

### Search Movies/Shows
```http
GET /api/trakt/search/{type}
```

**Path Parameters:**
- `type`: Search type (movie, show, person, all)

**Query Parameters:**
- `query` (required): Search query
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page (default: 10)
- `extended` (optional): Extension level

**Example:**
```http
GET /api/trakt/search/movie?query=inception&extended=full
```

**Response (200):**
```json
[
  {
    "type": "movie",
    "score": 46.58,
    "movie": {
      "title": "Inception",
      "year": 2010,
      "ids": {
        "trakt": 1,
        "slug": "inception-2010",
        "imdb": "tt1375666",
        "tmdb": 27205
      }
    }
  }
]
```

### Get Trending Movies
```http
GET /api/trakt/movies/trending
```

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Results per page
- `extended` (optional): Extension level

### Get Popular Movies
```http
GET /api/trakt/movies/popular
```

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Results per page
- `extended` (optional): Extension level

### Get Trending Shows
```http
GET /api/trakt/shows/trending
```

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Results per page
- `extended` (optional): Extension level

### Get Popular Shows
```http
GET /api/trakt/shows/popular
```

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Results per page
- `extended` (optional): Extension level

---

## Watchlist

### Get User Watchlist
```http
GET /api/watchlist
```

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `limit` (optional): Number of items per page (default: 20, max: 100)
- `skip` (optional): Number of items to skip (default: 0)
- `includeDetails` (optional): Include full movie details (true/false, default: false)

**Response (200):**
```json
{
  "watchlist": [
    {
      "_id": "watchlist_item_id",
      "userId": "user_id",
      "movieId": "movie_trakt_id",
      "notes": "Looking forward to watching this",
      "priority": "high",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "movie": {
        "title": "Movie Title",
        "year": 2024,
        "ids": {
          "trakt": 12345,
          "slug": "movie-title-2024",
          "imdb": "tt1234567"
        },
        "tagline": "Movie tagline",
        "overview": "Movie overview",
        "released": "2024-01-01",
        "runtime": 120,
        "genres": ["Action", "Drama"],
        "rating": 8.5,
        "votes": 1000
      }
    }
  ],
  "pagination": {
    "limit": 20,
    "skip": 0,
    "totalCount": 5
  }
}
```

**Note:** When `includeDetails=true`, the response includes full movie details from the Trakt API. If the Trakt API is unavailable, it falls back to basic watchlist data.

### Get User Show Watchlist
```http
GET /api/shows/watchlist
```

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `limit` (optional): Number of items per page (default: 20, max: 100)
- `skip` (optional): Number of items to skip (default: 0)
- `includeDetails` (optional): Include full show details (true/false, default: false)

**Response (200):**
```json
{
  "watchlist": [
    {
      "_id": "watchlist_item_id",
      "userId": "user_id",
      "showId": "show_trakt_id",
      "notes": "Can't wait to start this series",
      "priority": "high",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "show": {
        "title": "Show Title",
        "year": 2024,
        "ids": {
          "trakt": 67890,
          "slug": "show-title-2024",
          "tvdb": 45678,
          "imdb": "tt7654321",
          "tmdb": 98765
        },
        "overview": "Show overview",
        "first_aired": "2024-01-01T10:00:00.000Z",
        "airs": {
          "day": "Monday",
          "time": "20:00",
          "timezone": "America/New_York"
        },
        "runtime": 60,
        "country": "us",
        "network": "HBO",
        "genres": ["Drama", "Thriller"],
        "status": "returning series",
        "rating": 9.0,
        "votes": 2000
      }
    }
  ],
  "pagination": {
    "limit": 20,
    "skip": 0,
    "totalCount": 3
  }
}
```

### Add Movie to Watchlist
```http
POST /api/watchlist
```

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "movieId": "movie_trakt_id",
  "notes": "Optional notes about the movie",
  "priority": "high"
}
```

**Priority Options:** `low`, `medium`, `high` (default: `medium`)

**Response (201):**
```json
{
  "message": "Movie added to watchlist successfully",
  "watchlistItemId": "watchlist_item_id"
}
```

### Add Show to Watchlist
```http
POST /api/shows/watchlist
```

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "showId": "show_trakt_id",
  "notes": "Optional notes about the show",
  "priority": "high"
}
```

**Priority Options:** `low`, `medium`, `high` (default: `medium`)

**Response (201):**
```json
{
  "message": "Show added to watchlist successfully",
  "watchlistItemId": "watchlist_item_id"
}
```

### Update Watchlist Item
```http
PUT /api/watchlist
```

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "movieId": "movie_trakt_id",
  "notes": "Updated notes",
  "priority": "medium"
}
```

**Response (200):**
```json
{
  "message": "Watchlist item updated successfully"
}
```

### Update Show Watchlist Item
```http
PUT /api/shows/watchlist
```

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "showId": "show_trakt_id",
  "notes": "Updated notes",
  "priority": "medium"
}
```

**Response (200):**
```json
{
  "message": "Show watchlist item updated successfully"
}
```

### Remove Movie from Watchlist
```http
DELETE /api/watchlist?movieId={movieId}
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "message": "Movie removed from watchlist successfully"
}
```

### Remove Show from Watchlist
```http
DELETE /api/shows/watchlist?showId={showId}
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "message": "Show removed from watchlist successfully"
}
```

---

## Comments

### Get Movie Comments
```http
GET /api/comments?movieId={movieId}
```

**Query Parameters:**
- `movieId` (required): Trakt movie ID
- `limit` (optional): Number of comments per page (default: 20, max: 100)
- `skip` (optional): Number of comments to skip (default: 0)

**Response (200):**
```json
{
  "comments": [
    {
      "_id": "comment_id",
      "movieId": "movie_trakt_id",
      "userId": "user_id",
      "content": "Great movie! Highly recommended.",
      "isSpoiler": false,
      "likes": 5,
      "likedBy": ["user_id1", "user_id2"],
      "isLikedByCurrentUser": false,
      "user": {
        "_id": "user_id",
        "username": "username",
        "firstName": "John",
        "lastName": "Doe"
      },
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 15,
    "totalPages": 1
  }
}
```

### Get User Comments
```http
GET /api/comments?userId={userId}
```

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `userId` (required): User ID (must match authenticated user)
- `limit` (optional): Number of comments per page (default: 20, max: 100)
- `skip` (optional): Number of comments to skip (default: 0)

**Response (200):**
```json
{
  "comments": [
    {
      "_id": "comment_id",
      "movieId": "movie_trakt_id",
      "userId": "user_id",
      "content": "My comment about this movie",
      "isSpoiler": false,
      "likes": 3,
      "likedBy": ["user_id1", "user_id2"],
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 10,
    "totalPages": 1
  }
}
```

### Create Movie Comment
```http
POST /api/comments
```

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "movieId": "movie_trakt_id",
  "content": "This movie was amazing! Great acting and storyline.",
  "isSpoiler": false
}
```

**Validation:**
- `movieId` is required
- `content` is required and must be 1-2000 characters
- `isSpoiler` is optional (default: false)

**Response (201):**
```json
{
  "message": "Comment created successfully",
  "commentId": "comment_id"
}
```

### Update Comment (Like/Unlike or Edit)
```http
PUT /api/comments
```

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body (Like/Unlike):**
```json
{
  "commentId": "comment_id",
  "action": "toggleLike"
}
```

**Response (200):**
```json
{
  "message": "Comment liked successfully",
  "action": "liked",
  "likes": 6
}
```

**Request Body (Edit Comment):**
```json
{
  "commentId": "comment_id",
  "content": "Updated comment content with new thoughts"
}
```

**Response (200):**
```json
{
  "message": "Comment updated successfully"
}
```

**Validation:**
- `commentId` is required
- `content` must be 1-2000 characters for editing
- Users can only edit their own comments

### Delete Comment
```http
DELETE /api/comments?commentId={commentId}
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "message": "Comment deleted successfully"
}
```

### Get Show Comments
```http
GET /api/shows/comments?showId={showId}
```

**Query Parameters:**
- `showId` (required): Trakt show ID
- `limit` (optional): Number of comments per page (default: 20, max: 100)
- `skip` (optional): Number of comments to skip (default: 0)

**Response (200):**
```json
{
  "comments": [
    {
      "_id": "comment_id",
      "showId": "show_trakt_id",
      "userId": "user_id",
      "content": "Great show! Highly recommended.",
      "isSpoiler": false,
      "likes": 5,
      "likedBy": ["user_id1", "user_id2"],
      "isLikedByCurrentUser": false,
      "user": {
        "_id": "user_id",
        "username": "username",
        "firstName": "John",
        "lastName": "Doe"
      },
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 15,
    "totalPages": 1
  }
}
```

### Get User Show Comments
```http
GET /api/shows/comments?userId={userId}
```

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `userId` (required): User ID (must match authenticated user)
- `limit` (optional): Number of comments per page (default: 20, max: 100)
- `skip` (optional): Number of comments to skip (default: 0)

**Response (200):**
```json
{
  "comments": [
    {
      "_id": "comment_id",
      "showId": "show_trakt_id",
      "userId": "user_id",
      "content": "My comment about this show",
      "isSpoiler": false,
      "likes": 3,
      "likedBy": ["user_id1", "user_id2"],
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 10,
    "totalPages": 1
  }
}
```

### Create Show Comment
```http
POST /api/shows/comments
```

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "showId": "show_trakt_id",
  "content": "This show was amazing! Great acting and storyline.",
  "isSpoiler": false
}
```

**Validation:**
- `showId` is required
- `content` is required and must be 1-2000 characters
- `isSpoiler` is optional (default: false)

**Response (201):**
```json
{
  "message": "Comment created successfully",
  "commentId": "comment_id"
}
```

### Update Show Comment (Like/Unlike or Edit)
```http
PUT /api/shows/comments
```

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body (Like/Unlike):**
```json
{
  "commentId": "comment_id",
  "action": "toggleLike"
}
```

**Response (200):**
```json
{
  "message": "Comment liked successfully",
  "action": "liked",
  "likes": 6
}
```

**Request Body (Edit Comment):**
```json
{
  "commentId": "comment_id",
  "content": "Updated comment content with new thoughts"
}
```

**Response (200):**
```json
{
  "message": "Comment updated successfully"
}
```

**Validation:**
- `commentId` is required
- `content` must be 1-2000 characters for editing
- Users can only edit their own comments

### Delete Show Comment
```http
DELETE /api/shows/comments?commentId={commentId}
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "message": "Comment deleted successfully"
}
```

---

## Ratings & Reviews

### Get Movie Ratings
```http
GET /api/ratings?movieId={movieId}&includeAverage={true/false}
```

**Query Parameters:**
- `movieId` (required): Trakt movie ID
- `includeAverage` (optional): Include average rating (true/false, default: false)
- `limit` (optional): Number of ratings per page (default: 20, max: 100)
- `skip` (optional): Number of ratings to skip (default: 0)

**Response (200):**
```json
{
  "ratings": [
    {
      "_id": "rating_id",
      "movieId": "movie_trakt_id",
      "userId": "user_id",
      "rating": 9,
      "review": "Excellent movie with great performances",
      "user": {
        "_id": "user_id",
        "username": "username",
        "firstName": "John",
        "lastName": "Doe"
      },
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 25,
    "totalPages": 2
  },
  "average": 8.2,
  "userRating": {
    "_id": "user_rating_id",
    "rating": 9,
    "review": "My review of this movie"
  }
}
```

### Get User Ratings
```http
GET /api/ratings?userId={userId}
```

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `userId` (required): User ID (must match authenticated user)
- `limit` (optional): Number of ratings per page (default: 20, max: 100)
- `skip` (optional): Number of ratings to skip (default: 0)

**Response (200):**
```json
{
  "ratings": [
    {
      "_id": "rating_id",
      "movieId": "movie_trakt_id",
      "userId": "user_id",
      "rating": 8,
      "review": "Good movie, worth watching",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 15,
    "totalPages": 1
  }
}
```

### Create/Update Movie Rating
```http
POST /api/ratings
```

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "movieId": "movie_trakt_id",
  "rating": 9,
  "review": "Excellent movie with outstanding performances and a gripping storyline. Highly recommended!"
}
```

**Validation:**
- `movieId` is required
- `rating` is required and must be a number between 1-10
- `review` is optional (max 2000 characters)

**Response (201 for new rating, 200 for update):**
```json
{
  "message": "Rating created successfully",
  "ratingId": "rating_id"
}
```

### Delete Movie Rating
```http
DELETE /api/ratings?movieId={movieId}
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "message": "Rating deleted successfully"
}
```

**Error Response (404):**
```json
{
  "error": "Rating not found or you do not have permission to delete it"
}
```

**Note:** Users can only delete their own ratings.

### Get Show Ratings
```http
GET /api/shows/ratings?showId={showId}&includeAverage={true/false}
```

**Query Parameters:**
- `showId` (required): Trakt show ID
- `includeAverage` (optional): Include average rating (true/false, default: false)
- `limit` (optional): Number of ratings per page (default: 20, max: 100)
- `skip` (optional): Number of ratings to skip (default: 0)

**Response (200):**
```json
{
  "ratings": [
    {
      "_id": "rating_id",
      "showId": "show_trakt_id",
      "userId": "user_id",
      "rating": 9,
      "review": "Excellent show with great performances",
      "user": {
        "_id": "user_id",
        "username": "username",
        "firstName": "John",
        "lastName": "Doe"
      },
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 25,
    "totalPages": 2
  },
  "average": 8.2,
  "userRating": {
    "_id": "user_rating_id",
    "rating": 9,
    "review": "My review of this show"
  }
}
```

### Get User Show Ratings
```http
GET /api/shows/ratings?userId={userId}
```

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `userId` (required): User ID (must match authenticated user)
- `limit` (optional): Number of ratings per page (default: 20, max: 100)
- `skip` (optional): Number of ratings to skip (default: 0)

**Response (200):**
```json
{
  "ratings": [
    {
      "_id": "rating_id",
      "showId": "show_trakt_id",
      "userId": "user_id",
      "rating": 8,
      "review": "Good show, worth watching",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 15,
    "totalPages": 1
  }
}
```

### Create/Update Show Rating
```http
POST /api/shows/ratings
```

**Headers:**
```
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "showId": "show_trakt_id",
  "rating": 9,
  "review": "Excellent show with outstanding performances and a gripping storyline. Highly recommended!"
}
```

**Validation:**
- `showId` is required
- `rating` is required and must be a number between 1-10
- `review` is optional (max 2000 characters)

**Response (201 for new rating, 200 for update):**
```json
{
  "message": "Rating created successfully",
  "ratingId": "rating_id"
}
```

### Delete Show Rating
```http
DELETE /api/shows/ratings?showId={showId}
```

**Headers:**
```
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "message": "Rating deleted successfully"
}
```

**Error Response (404):**
```json
{
  "error": "Rating not found or you do not have permission to delete it"
}
```

**Note:** Users can only delete their own ratings.

---

## API Logs

### Get API Usage Logs
```http
GET /api/logs
```

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
- `limit` (optional): Number of logs per page (default: 20, max: 100)
- `skip` (optional): Number of logs to skip (default: 0)

**Response (200):**
```json
{
  "logs": [
    {
      "method": "GET",
      "path": "/movies/trending",
      "query": "{\"limit\":10,\"page\":1}",
      "ip": "::1",
      "timestamp": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "limit": 20,
    "skip": 0,
    "totalCount": 50
  }
}
```

---

## Trakt API Proxy

### Proxy Endpoints

The application provides proxy endpoints to access Trakt API data:

#### Standard Proxy (with logging)
```http
/api/trakt/*
```

#### Enhanced Proxy (with caching)
```http
/api/trakt-new/*
```

Both endpoints support all Trakt API methods and paths. The enhanced version includes intelligent caching for better performance.

**Example Usage:**
```http
GET /api/trakt/movies/12345?extended=full
GET /api/trakt-new/movies/12345?extended=full
GET /api/trakt/search/movie?query=inception
GET /api/trakt/shows/67890/seasons
GET /api/trakt/movies/trending
```

**Caching Behavior:**
- Movie/show details: 24-hour cache
- Search results: 30-minute cache
- Popular/trending lists: 2-hour cache
- Translations: 7-day cache

**Response Headers:**
- `x-proxied-by: trakt-proxy`: Indicates request was proxied
- `x-cache: HIT/MISS`: Cache status (only for `/api/trakt-new/*` endpoints)

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error message description"
}
```

### Common HTTP Status Codes

- `200`: Success
- `201`: Created
- `204`: No Content
- `400`: Bad Request (validation errors, missing required fields)
- `401`: Unauthorized (missing/invalid token)
- `404`: Not Found
- `409`: Conflict (duplicate resource)
- `500`: Internal Server Error
- `502`: Bad Gateway (upstream API failure)

### Common Error Messages

- `"Authorization header required"`
- `"Invalid or expired token"`
- `"Email, username, and password are required"`
- `"Movie ID is required"`
- `"Rating must be a number between 1 and 10"`
- `"Comment content must be less than 2000 characters"`
- `"Movie is already in watchlist"`

---

## Rate Limiting

Currently, no rate limiting is implemented, but it's recommended for production use.

---

## Data Models

### User Model
```json
{
  "_id": "ObjectId",
  "email": "string",
  "username": "string",
  "password": "string (hashed)",
  "firstName": "string",
  "lastName": "string",
  "bio": "string (optional)",
  "avatar": "string (optional)",
  "isActive": "boolean",
  "emailVerified": "boolean",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

### Comment Model
```json
{
  "_id": "ObjectId",
  "movieId": "string (for movie comments)",
  "showId": "string (for show comments)",
  "userId": "ObjectId",
  "content": "string",
  "isSpoiler": "boolean",
  "likes": "number",
  "likedBy": ["ObjectId"],
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

### Rating Model
```json
{
  "_id": "ObjectId",
  "movieId": "string (for movie ratings)",
  "showId": "string (for show ratings)",
  "userId": "ObjectId",
  "rating": "number (1-10)",
  "review": "string (optional)",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

### Watchlist Model
```json
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "movieId": "string (for movie watchlist)",
  "showId": "string (for show watchlist)",
  "notes": "string (optional)",
  "priority": "string (low|medium|high)",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

---

## Notes

- All timestamps are in ISO 8601 format
- Movie and show IDs refer to Trakt IDs
- The API uses MongoDB for data storage and caching
- Trakt API proxy requires `TRAKT_CLIENT_ID` environment variable
- Cache TTL varies by endpoint type (see caching section)
- Access tokens expire after 7 days
- Refresh tokens expire after 90 days
- Users must use refresh tokens to obtain new access tokens after expiration