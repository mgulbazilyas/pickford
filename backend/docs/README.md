# Pickford Backend API Documentation

## 📁 Documentation Files

This folder contains comprehensive API documentation for the Pickford backend application.

### Files Overview

1. **[API_DOCUMENTATION.md](./API_DOCUMENTATION.md)**
   - Complete API documentation with detailed endpoints
   - Request/response examples
   - Authentication details
   - Error handling information
   - Data models

2. **[API_SUMMARY.md](./API_SUMMARY.md)**
   - Quick reference guide
   - Recently implemented features
   - Development status overview
   - Environment variables

3. **[README.md](./README.md)** (this file)
   - Documentation overview
   - Getting started information

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- MongoDB
- Trakt API Client ID

### Setup
1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. Start the server:
   ```bash
   npm run dev
   ```

### Environment Variables
```bash
TRAKT_CLIENT_ID=your_trakt_client_id    # Required
TRAKT_BASE_URL=https://api.trakt.tv     # Optional
TRAKT_API_VERSION=2                     # Optional
MONGODB_URI=mongodb://localhost:27017    # Optional
MONGODB_DB=trakt-proxy                   # Optional
PORT=3000                               # Optional
```

## 📚 API Features

### ✅ Complete CRUD Operations
- **Authentication**: Register, Login, Logout, Verify
- **User Profiles**: Get and update user information
- **Movies & Shows**: Trakt API integration with caching
- **Comments**: Create, read, update, delete with likes
- **Ratings & Reviews**: 1-10 scale rating system
- **Watchlist**: Personal movie watchlist with priorities

### 🔐 Security Features
- JWT-based authentication
- Password hashing with bcrypt
- User authorization checks
- Session management

### 🎯 Performance Features
- MongoDB caching layer
- TTL-based cache expiration
- API request logging
- Graceful error handling

## 🔄 Recently Implemented Features

### ✅ Rating Deletion API
- Users can now delete their own movie ratings
- `DELETE /api/ratings?movieId={movieId}`

### ✅ Comment Editing API
- Users can now edit their own comments
- `PUT /api/comments` with content update

### ✅ Enhanced Watchlist
- Watchlist now includes full movie details from Trakt API
- `GET /api/watchlist?includeDetails=true`

## 📊 Database Schema

### Collections
- `users` - User accounts and profiles
- `movie_comments` - Movie comments with likes
- `movie_ratings` - Movie ratings and reviews
- `watchlist` - User watchlists
- `sessions` - Authentication sessions
- `api_logs` - API request logs
- `cache` - Trakt API response cache

## 🛠 Development

### API Testing
Use the built-in web interface at `http://localhost:3000` to test API endpoints.

### Database Management
```bash
# View database contents
npm run view-db

# Start MongoDB with Docker
docker-compose up -d
```

## 📝 Notes

- All timestamps are in ISO 8601 format
- Movie and show IDs refer to Trakt IDs
- Cache TTL varies by endpoint type (see API_DOCUMENTATION.md)
- Authentication tokens expire after 24 hours

## 🤝 Contributing

When adding new features:
1. Update the API documentation
2. Follow the existing code patterns
3. Add proper error handling
4. Update this README if needed

## 📄 License

This project is part of the Pickford application.