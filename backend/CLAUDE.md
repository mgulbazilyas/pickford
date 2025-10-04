# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Trakt API proxy application built with Next.js 15 and Express.js. It serves as a middleware service that proxies requests to the Trakt.tv API with intelligent caching and logging using MongoDB. The project includes both a standalone Express server (`app.js`) and Next.js API routes for the same functionality.

**Key Architecture:**
- **Dual Server Setup**: Both Express.js (`app.js`) and Next.js App Router (`app/api/`) implement the same proxy functionality
- **MongoDB Caching**: Intelligent caching layer for API responses with TTL-based expiration
- **MongoDB Logging**: All API requests are logged to MongoDB for analytics and monitoring
- **Frontend Dashboard**: React-based UI for testing API endpoints and viewing usage statistics
- **Docker Support**: Full containerization with MongoDB database

## Development Commands

**Primary Commands (from package.json):**
- `npm run dev` - Start Next.js development server (port 3000)
- `npm run build` - Build Next.js application for production
- `npm run start` - Start Next.js production server
- `npm run lint` - Run ESLint on the codebase

**Database Setup:**
- Docker: `docker-compose up -d` - Starts MongoDB and application containers
- Manual: MongoDB connection is established automatically on first request

**Testing Trakt API:**
- Access the web interface at `http://localhost:3000` to test various Trakt endpoints
- Use the new cached endpoints at `/api/trakt-new/*` for MongoDB-enabled caching
- Use the original endpoints at `/api/trakt/*` for MySQL logging
- Use the Usage tab to view API request logs

## Environment Variables

**Required:**
- `TRAKT_CLIENT_ID` - Your Trakt.tv API client ID (required for all requests)

**Optional:**
- `TRAKT_BASE_URL` - Base URL for Trakt API (defaults to `https://api.trakt.tv`)
- `TRAKT_API_VERSION` - API version (defaults to `"2"`)

**MongoDB Database (for caching and logging):**
- **MongoDB URI**: `MONGODB_URI` (default: `mongodb://localhost:27017`)
- **MongoDB Database**: `MONGODB_DB` (default: `trakt-proxy`)
- **MongoDB Root Username**: `MONGO_ROOT_USERNAME` (default: `admin`)
- **MongoDB Root Password**: `MONGO_ROOT_PASSWORD` (default: `password`)

## Code Architecture

### Database Layers

**MongoDB Database (`lib/db-mongodb.ts`)**
- Unified database solution for both caching and API logging
- Intelligent caching layer for Trakt API responses with TTL-based expiration
- API request logging for analytics and monitoring
- Automatic index creation for optimal query performance
- Lazy connection initialization for serverless compatibility
- Schema flexibility with automatic collection creation
- Separate collections for movies, shows, translations, search results, lists, and API logs
- Graceful fallback to direct API calls when MongoDB is unavailable

### API Proxy Layer

**Implementation (MongoDB Caching and Logging):**
- **Next.js API Routes (`app/api/trakt/[[...path]]/route.ts`):** Modern Next.js 15 App Router implementation with MongoDB logging
- **Next.js API Routes (`app/api/trakt-new/[[...path]]/route.ts`):** Enhanced implementation with intelligent MongoDB caching
- **Express Server (`app.js`):** Standalone Express.js server with MongoDB logging, compatible with Passenger
- **Trakt API Service (`lib/trakt-api.ts`):** Centralized service with caching logic and extended=images parameter support

**Caching Behavior:**
- Movie/show details: 24-hour TTL
- Translations: 7-day TTL
- Search results: 30-minute TTL
- Popular/trending lists: 2-hour TTL
- Automatic cache invalidation via TTL indexes
- Graceful fallback to direct API calls when cache is empty

**Image Handling:**
- Basic data and images are fetched separately to preserve all details
- Images are cached separately from basic metadata
- Automatic image fetching and merging for cached items without images
- Optimized image responses with best-quality URL pre-selection
- Graceful degradation when image fetching fails

### Frontend Dashboard (`app/page.tsx`)
- Comprehensive testing interface for Trakt API endpoints
- Organized by categories: Search, Movies, TV Shows, Calendar, Seasons
- Real-time API usage tracking and logs display
- Built with shadcn/ui components and Tailwind CSS

### Request Flow

**Logging Flow (`/api/trakt/*`):**
1. Client request → API proxy endpoint (`/api/trakt/*`)
2. Extract path and query parameters from wildcard route
3. Build upstream request with proper headers (including `trakt-api-key`)
4. Log request details to MongoDB database (non-blocking)
5. Forward request to Trakt API and stream response back
6. Add `x-proxied-by: trakt-proxy` header to response

**Caching Flow (`/api/trakt-new/*`):**
1. Client request → API proxy endpoint (`/api/trakt-new/*`)
2. Extract path and query parameters from wildcard route
3. Check MongoDB cache for existing response (if applicable endpoint)
4. If cache hit:
   - If cached item has images: Return complete response with `x-cache: HIT` header
   - If cached item lacks images: Fetch images separately, merge with cached data, update cache, return with `x-cache: HIT` header
5. If cache miss:
   - Fetch basic data from Trakt API (without extended=images)
   - Fetch images separately using `?extended=images` parameter
   - Merge basic data with images
   - Cache basic data and images separately
   - Return complete response with `x-cache: MISS` header
6. Add `x-proxied-by: trakt-proxy` header to response
7. Images are optimized for client consumption with best-quality URLs pre-selected

## Key Files

**Core Implementation:**
- `app.js` - Express proxy server (can run standalone)
- `app/api/trakt/[[...path]]/route.ts` - Next.js proxy API routes with MongoDB logging
- `app/api/trakt-new/[[...path]]/route.ts` - Next.js proxy API routes with MongoDB caching
- `app/api/logs/route.ts` - API usage logs endpoint
- `lib/db-mongodb.ts` - MongoDB database abstraction and caching layer
- `lib/trakt-api.ts` - Trakt API service with caching logic
- `lib/image-utils.ts` - Image extraction and merging utilities
- `lib/db-mysql.ts` - Legacy compatibility layer (redirects to MongoDB)

**Frontend & Configuration:**
- `app/page.tsx` - Frontend testing interface
- `docker-compose.yml` - Container orchestration (MongoDB only)

## Development Notes

**Database Configuration:**
- MongoDB is used for both caching and API logging
- Connection is established automatically on first request
- Automatic schema creation and index optimization
- Graceful fallback when MongoDB is unavailable

**API Proxy Behavior:**
- All requests to `/api/trakt/*` are proxied to the Trakt API
- Original query parameters and request bodies are preserved
- Response headers are filtered to remove hop-by-hop headers
- CORS headers are added for browser compatibility

**Error Handling:**
- Database connection failures are gracefully handled (logging is optional)
- Upstream API failures return structured error responses
- Missing `TRAKT_CLIENT_ID` returns appropriate error messages

**Performance Considerations:**
- Database logging is non-blocking to avoid affecting response times
- Intelligent caching reduces external API calls
- Lazy initialization of database connections for serverless environments
- Automatic index optimization for query performance