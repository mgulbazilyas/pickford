# Pickford Backend API Summary

## Overview
This document provides a quick summary of all available APIs in the Pickford backend application.

## Base URL
```
http://localhost:3000 (development)
```

## Authentication Required
All endpoints except health check and token verification require JWT authentication.

## API Endpoints Summary

### Authentication (`/api/auth`)
- **POST** `/api/auth` - Register, Login, Logout, Verify
- **GET** `/api/auth?action=verify` - Verify JWT token

### User Profile (`/api/user/profile`)
- **GET** `/api/user/profile` - Get user profile with stats
- **PUT** `/api/user/profile` - Update user profile

### Movies & Shows (Trakt Proxy)
- **GET** `/api/trakt/*` - Standard proxy with logging
- **GET** `/api/trakt-new/*` - Enhanced proxy with caching
  - Movies: `/movies/{id}`, `/movies/trending`, `/movies/popular`, `/search/movie`
  - Shows: `/shows/{id}`, `/shows/trending`, `/shows/popular`, `/shows/{id}/seasons/{season}`
  - Search: `/search/{type}` (movie, show, person, all)

### Watchlist (`/api/watchlist`)
- **GET** `/api/watchlist` - Get user's watchlist
- **POST** `/api/watchlist` - Add movie to watchlist
- **PUT** `/api/watchlist` - Update watchlist item
- **DELETE** `/api/watchlist` - Remove movie from watchlist

### Comments (`/api/comments`)
- **GET** `/api/comments` - Get movie or user comments
- **POST** `/api/comments` - Create movie comment
- **PUT** `/api/comments` - Like/unlike or edit comment
- **DELETE** `/api/comments` - Delete comment

### Ratings & Reviews (`/api/ratings`)
- **GET** `/api/ratings` - Get movie or user ratings
- **POST** `/api/ratings` - Create or update movie rating
- **DELETE** `/api/ratings` - Delete movie rating ✅ **NEWLY IMPLEMENTED**

### System (`/api/logs`)
- **GET** `/api/logs` - Get API usage logs

### Health Check
- **GET** `/` - Server health check

## Recently Implemented Features

### ✅ Rating Deletion API
```http
DELETE /api/ratings?movieId={movieId}
```
- Deletes a user's rating for a specific movie
- Requires authentication
- Users can only delete their own ratings

### ✅ Comment Editing API
```http
PUT /api/comments
```
```json
{
  "commentId": "comment_id",
  "content": "Updated comment content"
}
```
- Edits an existing comment
- Requires authentication
- Users can only edit their own comments
- Content validation (1-2000 characters)

### ✅ Enhanced Watchlist with Movie Details
```http
GET /api/watchlist?includeDetails=true
```
- Returns watchlist with full movie details from Trakt API
- Includes movie metadata (title, year, overview, ratings, etc.)
- Fallback to basic watchlist if Trakt API is unavailable

## Key Features

### 🔐 Authentication
- JWT-based authentication
- User registration and login
- Token verification and logout
- Session management

### 📊 Movie/Show Data
- Trakt API integration
- Intelligent caching with MongoDB
- Movie, show, and season details
- Search functionality
- Trending and popular content

### 📝 User Interactions
- Comments with likes and spoiler warnings
- Ratings with reviews (1-10 scale)
- Personal watchlist with priorities
- User profiles and statistics

### 🎯 Performance Features
- MongoDB caching layer
- TTL-based cache expiration
- API request logging
- Graceful error handling

## Data Storage

### Collections
- `users` - User accounts and profiles
- `movie_comments` - Movie comments with likes
- `movie_ratings` - Movie ratings and reviews
- `watchlist` - User watchlists
- `sessions` - Authentication sessions
- `api_logs` - API request logs
- `cache` - Trakt API response cache

### Cache TTL
- Movie/show details: 24 hours
- Search results: 30 minutes
- Popular/trending: 2 hours
- Translations: 7 days

## Error Handling
- Consistent JSON error responses
- Authentication and authorization checks
- Input validation
- Graceful degradation for external API failures

## Environment Variables
- `TRAKT_CLIENT_ID` - Trakt API client ID (required)
- `TRAKT_BASE_URL` - Trakt API base URL (default: https://api.trakt.tv)
- `TRAKT_API_VERSION` - API version (default: 2)
- `MONGODB_URI` - MongoDB connection URI
- `MONGODB_DB` - Database name (default: trakt-proxy)
- `PORT` - Server port (default: 3000)

## Development Status
✅ All core features implemented
✅ Full CRUD operations for user content
✅ Authentication and authorization
✅ API documentation complete
✅ Error handling implemented
✅ Database integration complete