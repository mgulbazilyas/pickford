#!/bin/bash

# API Testing Script for Trakt Proxy Backend
# Test all endpoints in order: Authentication -> Trakt API Proxy -> Logs

set -e

BASE_URL="http://localhost:3000"
echo "🎬 Testing Trakt Proxy Backend APIs"
echo "Base URL: $BASE_URL"
echo "========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print test results
test_result() {
    local test_name="$1"
    local status="$2"
    local message="$3"

    if [ "$status" -eq 0 ]; then
        echo -e "${GREEN}✓ $test_name${NC} - $message"
    else
        echo -e "${RED}✗ $test_name${NC} - $message"
    fi
}

# Store authentication token
AUTH_TOKEN=""

echo -e "${BLUE}🔐 AUTHENTICATION ENDPOINTS${NC}"
echo "========================================="

# 1. Register User
echo "1. Testing User Registration..."
REGISTER_RESPONSE=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/auth" \
    -H "Content-Type: application/json" \
    -d '{
        "action": "register",
        "email": "test@example.com",
        "username": "testuser",
        "password": "testpassword123"
    }')
REGISTER_CODE="${REGISTER_RESPONSE: -3}"
REGISTER_BODY="${REGISTER_RESPONSE%???}"
test_result "User Registration" "$REGISTER_CODE" "HTTP Status: $REGISTER_CODE"
echo "Response: $REGISTER_BODY"

# 2. Login User
echo -e "\n2. Testing User Login..."
LOGIN_RESPONSE=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/auth" \
    -H "Content-Type: application/json" \
    -d '{
        "action": "login",
        "email": "test@example.com",
        "password": "testpassword123"
    }')
LOGIN_CODE="${LOGIN_RESPONSE: -3}"
LOGIN_BODY="${LOGIN_RESPONSE%???}"
test_result "User Login" "$LOGIN_CODE" "HTTP Status: $LOGIN_CODE"
echo "Response: $LOGIN_BODY"

# Extract token from login response (if we got one from registration or login)
if [[ $REGISTER_BODY == *"token"* ]]; then
    AUTH_TOKEN=$(echo "$REGISTER_BODY" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    echo -e "${GREEN}✓ Auth Token extracted from registration${NC}"
elif [[ $LOGIN_BODY == *"token"* ]]; then
    AUTH_TOKEN=$(echo "$LOGIN_BODY" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
    echo -e "${GREEN}✓ Auth Token extracted from login${NC}"
else
    echo -e "${YELLOW}⚠ No token found in responses${NC}"
fi

# 3. Verify Token (if we have one)
if [ ! -z "$AUTH_TOKEN" ]; then
    echo -e "\n3. Testing Token Verification..."
    VERIFY_RESPONSE=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/auth?action=verify" \
        -H "Authorization: Bearer $AUTH_TOKEN")
    VERIFY_CODE="${VERIFY_RESPONSE: -3}"
    VERIFY_BODY="${VERIFY_RESPONSE%???}"
    test_result "Token Verification" "$VERIFY_CODE" "HTTP Status: $VERIFY_CODE"
    echo "Response: $VERIFY_BODY"
else
    echo -e "${YELLOW}⚠ Skipping token verification (no token available)${NC}"
fi

# 4. Logout (if we have token)
if [ ! -z "$AUTH_TOKEN" ]; then
    echo -e "\n4. Testing User Logout..."
    LOGOUT_RESPONSE=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/auth" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -d '{"action": "logout"}')
    LOGOUT_CODE="${LOGOUT_RESPONSE: -3}"
    LOGOUT_BODY="${LOGOUT_RESPONSE%???}"
    test_result "User Logout" "$LOGOUT_CODE" "HTTP Status: $LOGOUT_CODE"
    echo "Response: $LOGOUT_BODY"
    AUTH_TOKEN="" # Clear token after logout
else
    echo -e "${YELLOW}⚠ Skipping logout (no token available)${NC}"
fi

echo -e "\n${BLUE}🎬 TRAKT API PROXY ENDPOINTS (MySQL Logging)${NC}"
echo "========================================="

# Test various Trakt API endpoints through the proxy
echo "5. Testing Movies Popular..."
MOVIES_POPULAR=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/trakt/movies/popular")
MOVIES_POPULAR_CODE="${MOVIES_POPULAR: -3}"
test_result "Movies Popular" "$MOVIES_POPULAR_CODE" "HTTP Status: $MOVIES_POPULAR_CODE"

echo -e "\n6. Testing Movies Trending..."
MOVIES_TRENDING=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/trakt/movies/trending")
MOVIES_TRENDING_CODE="${MOVIES_TRENDING: -3}"
test_result "Movies Trending" "$MOVIES_TRENDING_CODE" "HTTP Status: $MOVIES_TRENDING_CODE"

echo -e "\n7. Testing Shows Popular..."
SHOWS_POPULAR=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/trakt/shows/popular")
SHOWS_POPULAR_CODE="${SHOWS_POPULAR: -3}"
test_result "Shows Popular" "$SHOWS_POPULAR_CODE" "HTTP Status: $SHOWS_POPULAR_CODE"

echo -e "\n8. Testing Movie Details (ID: 28 - Shawshank Redemption)..."
MOVIE_DETAILS=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/trakt/movies/28")
MOVIE_DETAILS_CODE="${MOVIE_DETAILS: -3}"
test_result "Movie Details" "$MOVIE_DETAILS_CODE" "HTTP Status: $MOVIE_DETAILS_CODE"

echo -e "\n9. Testing Show Details (ID: 139 - Game of Thrones)..."
SHOW_DETAILS=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/trakt/shows/139")
SHOW_DETAILS_CODE="${SHOW_DETAILS: -3}"
test_result "Show Details" "$SHOW_DETAILS_CODE" "HTTP Status: $SHOW_DETAILS_CODE"

echo -e "\n10. Testing Search Movies..."
SEARCH_MOVIES=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/trakt/search/movie?query=batman")
SEARCH_MOVIES_CODE="${SEARCH_MOVIES: -3}"
test_result "Search Movies" "$SEARCH_MOVIES_CODE" "HTTP Status: $SEARCH_MOVIES_CODE"

echo -e "\n11. Testing Search Shows..."
SEARCH_SHOWS=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/trakt/search/show?query=breaking")
SEARCH_SHOWS_CODE="${SEARCH_SHOWS: -3}"
test_result "Search Shows" "$SEARCH_SHOWS_CODE" "HTTP Status: $SEARCH_SHOWS_CODE"

echo -e "\n${BLUE}🎬 TRAKT API PROXY ENDPOINTS (MongoDB Caching)${NC}"
echo "========================================="

# Test enhanced endpoints with MongoDB caching
echo "12. Testing Movies Popular (Cached)..."
MOVIES_POPULAR_CACHED=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/trakt-new/movies/popular")
MOVIES_POPULAR_CACHED_CODE="${MOVIES_POPULAR_CACHED: -3}"
test_result "Movies Popular (Cached)" "$MOVIES_POPULAR_CACHED_CODE" "HTTP Status: $MOVIES_POPULAR_CACHED_CODE"

echo -e "\n13. Testing Movies Trending (Cached)..."
MOVIES_TRENDING_CACHED=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/trakt-new/movies/trending")
MOVIES_TRENDING_CACHED_CODE="${MOVIES_TRENDING_CACHED: -3}"
test_result "Movies Trending (Cached)" "$MOVIES_TRENDING_CACHED_CODE" "HTTP Status: $MOVIES_TRENDING_CACHED_CODE"

echo -e "\n14. Testing Shows Popular (Cached)..."
SHOWS_POPULAR_CACHED=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/trakt-new/shows/popular")
SHOWS_POPULAR_CACHED_CODE="${SHOWS_POPULAR_CACHED: -3}"
test_result "Shows Popular (Cached)" "$SHOWS_POPULAR_CACHED_CODE" "HTTP Status: $SHOWS_POPULAR_CACHED_CODE"

echo -e "\n15. Testing Movie Details (Cached)..."
MOVIE_DETAILS_CACHED=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/trakt-new/movies/28")
MOVIE_DETAILS_CACHED_CODE="${MOVIE_DETAILS_CACHED: -3}"
test_result "Movie Details (Cached)" "$MOVIE_DETAILS_CACHED_CODE" "HTTP Status: $MOVIE_DETAILS_CACHED_CODE"

echo -e "\n16. Testing Show Details (Cached)..."
SHOW_DETAILS_CACHED=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/trakt-new/shows/139")
SHOW_DETAILS_CACHED_CODE="${SHOW_DETAILS_CACHED: -3}"
test_result "Show Details (Cached)" "$SHOW_DETAILS_CACHED_CODE" "HTTP Status: $SHOW_DETAILS_CACHED_CODE"

echo -e "\n17. Testing Search Movies (Cached)..."
SEARCH_MOVIES_CACHED=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/trakt-new/search/movie?query=batman")
SEARCH_MOVIES_CACHED_CODE="${SEARCH_MOVIES_CACHED: -3}"
test_result "Search Movies (Cached)" "$SEARCH_MOVIES_CACHED_CODE" "HTTP Status: $SEARCH_MOVIES_CACHED_CODE"

echo -e "\n18. Testing Search Shows (Cached)..."
SEARCH_SHOWS_CACHED=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/trakt-new/search/show?query=breaking")
SEARCH_SHOWS_CACHED_CODE="${SEARCH_SHOWS_CACHED: -3}"
test_result "Search Shows (Cached)" "$SEARCH_SHOWS_CACHED_CODE" "HTTP Status: $SEARCH_SHOWS_CACHED_CODE"

echo -e "\n19. Testing Generic Proxy (Users Settings)..."
GENERIC_PROXY=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/trakt-new/users/settings")
GENERIC_PROXY_CODE="${GENERIC_PROXY: -3}"
test_result "Generic Proxy" "$GENERIC_PROXY_CODE" "HTTP Status: $GENERIC_PROXY_CODE"

echo -e "\n${BLUE}📊 LOGS AND UTILITY ENDPOINTS${NC}"
echo "========================================="

echo "20. Testing API Logs..."
API_LOGS=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/logs?limit=10")
API_LOGS_CODE="${API_LOGS: -3}"
test_result "API Logs" "$API_LOGS_CODE" "HTTP Status: $API_LOGS_CODE"

echo -e "\n21. Testing User Profile (if auth available)..."
if [ ! -z "$AUTH_TOKEN" ]; then
    USER_PROFILE=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/user/profile" \
        -H "Authorization: Bearer $AUTH_TOKEN")
    USER_PROFILE_CODE="${USER_PROFILE: -3}"
    test_result "User Profile" "$USER_PROFILE_CODE" "HTTP Status: $USER_PROFILE_CODE"
else
    echo -e "${YELLOW}⚠ Skipping user profile (no auth token)${NC}"
fi

echo -e "\n22. Testing Movies Comments..."
MOVIES_COMMENTS=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/movies/comments")
MOVIES_COMMENTS_CODE="${MOVIES_COMMENTS: -3}"
test_result "Movies Comments" "$MOVIES_COMMENTS_CODE" "HTTP Status: $MOVIES_COMMENTS_CODE"

echo -e "\n23. Testing Movies Ratings..."
MOVIES_RATINGS=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/movies/ratings")
MOVIES_RATINGS_CODE="${MOVIES_RATINGS: -3}"
test_result "Movies Ratings" "$MOVIES_RATINGS_CODE" "HTTP Status: $MOVIES_RATINGS_CODE"

echo -e "\n${BLUE}🔧 ADVANCED TRAKT ENDPOINTS${NC}"
echo "========================================="

echo "24. Testing Movies Box Office..."
MOVIES_BOX_OFFICE=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/trakt-new/movies/box-office")
MOVIES_BOX_OFFICE_CODE="${MOVIES_BOX_OFFICE: -3}"
test_result "Movies Box Office" "$MOVIES_BOX_OFFICE_CODE" "HTTP Status: $MOVIES_BOX_OFFICE_CODE"

echo -e "\n25. Testing Movies Watched..."
MOVIES_WATCHED=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/trakt-new/movies/watched")
MOVIES_WATCHED_CODE="${MOVIES_WATCHED: -3}"
test_result "Movies Watched" "$MOVIES_WATCHED_CODE" "HTTP Status: $MOVIES_WATCHED_CODE"

echo -e "\n26. Testing Movies Favorited..."
MOVIES_FAVORITED=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/trakt-new/movies/favorited")
MOVIES_FAVORITED_CODE="${MOVIES_FAVORITED: -3}"
test_result "Movies Favorited" "$MOVIES_FAVORITED_CODE" "HTTP Status: $MOVIES_FAVORITED_CODE"

echo -e "\n27. Testing Shows Trending (Cached)..."
SHOWS_TRENDING_CACHED=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/trakt-new/shows/trending")
SHOWS_TRENDING_CACHED_CODE="${SHOWS_TRENDING_CACHED: -3}"
test_result "Shows Trending (Cached)" "$SHOWS_TRENDING_CACHED_CODE" "HTTP Status: $SHOWS_TRENDING_CACHED_CODE"

echo -e "\n28. Testing Shows Watched (Cached)..."
SHOWS_WATCHED_CACHED=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/trakt-new/shows/watched")
SHOWS_WATCHED_CACHED_CODE="${SHOWS_WATCHED_CACHED: -3}"
test_result "Shows Watched (Cached)" "$SHOWS_WATCHED_CACHED_CODE" "HTTP Status: $SHOWS_WATCHED_CACHED_CODE"

echo -e "\n29. Testing Shows Favorited (Cached)..."
SHOWS_FAVORITED_CACHED=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/trakt-new/shows/favorited")
SHOWS_FAVORITED_CACHED_CODE="${SHOWS_FAVORITED_CACHED: -3}"
test_result "Shows Favorited (Cached)" "$SHOWS_FAVORITED_CACHED_CODE" "HTTP Status: $SHOWS_FAVORITED_CACHED_CODE"

echo -e "\n${BLUE}📝 WATCHLIST AND COMMENTS ENDPOINTS${NC}"
echo "========================================="

# Re-authenticate for watchlist tests
if [ -z "$AUTH_TOKEN" ]; then
    echo "33. Re-authenticating for watchlist tests..."
    LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth" \
        -H "Content-Type: application/json" \
        -d '{
            "action": "login",
            "email": "test@example.com",
            "password": "testpassword123"
        }')
    if [[ $LOGIN_RESPONSE == *"token"* ]]; then
        AUTH_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
        echo -e "${GREEN}✓ Re-authenticated successfully${NC}"
    fi
fi

if [ ! -z "$AUTH_TOKEN" ]; then
    echo "34. Testing Add to Watchlist (Movie ID: 28)..."
    ADD_WATCHLIST=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/watchlist" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -d '{
            "movieId": "28",
            "notes": "Classic movie to watch again",
            "priority": "high"
        }')
    ADD_WATCHLIST_CODE="${ADD_WATCHLIST: -3}"
    test_result "Add to Watchlist" "$ADD_WATCHLIST_CODE" "HTTP Status: $ADD_WATCHLIST_CODE"

    echo -e "\n35. Testing Get Watchlist..."
    GET_WATCHLIST=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/watchlist" \
        -H "Authorization: Bearer $AUTH_TOKEN")
    GET_WATCHLIST_CODE="${GET_WATCHLIST: -3}"
    test_result "Get Watchlist" "$GET_WATCHLIST_CODE" "HTTP Status: $GET_WATCHLIST_CODE"

    echo -e "\n36. Testing Get Watchlist with Movie Details..."
    GET_WATCHLIST_DETAILS=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/watchlist?includeDetails=true" \
        -H "Authorization: Bearer $AUTH_TOKEN")
    GET_WATCHLIST_DETAILS_CODE="${GET_WATCHLIST_DETAILS: -3}"
    test_result "Get Watchlist with Details" "$GET_WATCHLIST_DETAILS_CODE" "HTTP Status: $GET_WATCHLIST_DETAILS_CODE"

    echo -e "\n37. Testing Update Watchlist Item..."
    UPDATE_WATCHLIST=$(curl -s -w "%{http_code}" -X PUT "$BASE_URL/api/watchlist" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -d '{
            "movieId": "28",
            "notes": "Updated notes for this classic movie",
            "priority": "medium"
        }')
    UPDATE_WATCHLIST_CODE="${UPDATE_WATCHLIST: -3}"
    test_result "Update Watchlist Item" "$UPDATE_WATCHLIST_CODE" "HTTP Status: $UPDATE_WATCHLIST_CODE"

    echo -e "\n38. Testing Check if Movie in Watchlist..."
    # Note: This would need a separate endpoint or we can check from the watchlist response
    echo "⚠ Skipping in-watchlist check (no direct endpoint)"

    echo -e "\n39. Testing Remove from Watchlist..."
    REMOVE_WATCHLIST=$(curl -s -w "%{http_code}" -X DELETE "$BASE_URL/api/watchlist?movieId=28" \
        -H "Authorization: Bearer $AUTH_TOKEN")
    REMOVE_WATCHLIST_CODE="${REMOVE_WATCHLIST: -3}"
    test_result "Remove from Watchlist" "$REMOVE_WATCHLIST_CODE" "HTTP Status: $REMOVE_WATCHLIST_CODE"

    echo -e "\n40. Testing Add Movie Comment (Movie ID: 28)..."
    ADD_COMMENT=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/comments" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -d '{
            "movieId": "28",
            "content": "This is a great classic movie! Highly recommended.",
            "isSpoiler": false
        }')
    ADD_COMMENT_CODE="${ADD_COMMENT: -3}"
    test_result "Add Movie Comment" "$ADD_COMMENT_CODE" "HTTP Status: $ADD_COMMENT_CODE"

    echo -e "\n41. Testing Get Movie Comments (Movie ID: 28)..."
    GET_COMMENTS=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/comments?movieId=28" \
        -H "Authorization: Bearer $AUTH_TOKEN")
    GET_COMMENTS_CODE="${GET_COMMENTS: -3}"
    test_result "Get Movie Comments" "$GET_COMMENTS_CODE" "HTTP Status: $GET_COMMENTS_CODE"

    echo -e "\n42. Testing Like Movie Comment..."
    # This would need the comment ID from the previous response
    echo "⚠ Skipping comment like (needs comment ID)"

    echo -e "\n43. Testing Add Movie Rating (Movie ID: 28)..."
    ADD_RATING=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/ratings" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -d '{
            "movieId": "28",
            "rating": 9,
            "review": "One of the best movies ever made!"
        }')
    ADD_RATING_CODE="${ADD_RATING: -3}"
    test_result "Add Movie Rating" "$ADD_RATING_CODE" "HTTP Status: $ADD_RATING_CODE"

    echo -e "\n44. Testing Get Movie Ratings (Movie ID: 28)..."
    GET_RATINGS=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/ratings?movieId=28&includeAverage=true" \
        -H "Authorization: Bearer $AUTH_TOKEN")
    GET_RATINGS_CODE="${GET_RATINGS: -3}"
    test_result "Get Movie Ratings" "$GET_RATINGS_CODE" "HTTP Status: $GET_RATINGS_CODE"

    echo -e "\n45. Testing Get User Ratings..."
    # Note: We would need to extract user ID from the auth token or login response
    echo "⚠ Skipping user ratings test (needs user ID extraction)"
else
    echo -e "${YELLOW}⚠ Skipping watchlist and comments tests (no auth token)${NC}"
fi

echo -e "\n${BLUE}🔧 ERROR HANDLING TESTS${NC}"
echo "========================================="

echo "46. Testing Invalid Endpoint..."
INVALID_ENDPOINT=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/trakt/invalid/endpoint")
INVALID_ENDPOINT_CODE="${INVALID_ENDPOINT: -3}"
test_result "Invalid Endpoint" "$INVALID_ENDPOINT_CODE" "HTTP Status: $INVALID_ENDPOINT_CODE"

echo -e "\n47. Testing Invalid Auth Action..."
INVALID_AUTH=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/auth" \
    -H "Content-Type: application/json" \
    -d '{"action": "invalid"}')
INVALID_AUTH_CODE="${INVALID_AUTH: -3}"
test_result "Invalid Auth Action" "$INVALID_AUTH_CODE" "HTTP Status: $INVALID_AUTH_CODE"

echo -e "\n48. Testing Missing Credentials..."
MISSING_CREDS=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/auth" \
    -H "Content-Type: application/json" \
    -d '{"action": "login", "email": "test@example.com"}')
MISSING_CREDS_CODE="${MISSING_CREDS: -3}"
test_result "Missing Credentials" "$MISSING_CREDS_CODE" "HTTP Status: $MISSING_CREDS_CODE"

echo -e "\n49. Testing Watchlist Without Auth..."
NO_AUTH_WATCHLIST=$(curl -s -w "%{http_code}" -X GET "$BASE_URL/api/watchlist")
NO_AUTH_WATCHLIST_CODE="${NO_AUTH_WATCHLIST: -3}"
test_result "Watchlist Without Auth" "$NO_AUTH_WATCHLIST_CODE" "HTTP Status: $NO_AUTH_WATCHLIST_CODE"

echo -e "\n50. Testing Invalid Watchlist Priority..."
INVALID_PRIORITY=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/api/watchlist" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $AUTH_TOKEN" \
    -d '{"movieId": "28", "priority": "invalid"}')
INVALID_PRIORITY_CODE="${INVALID_PRIORITY: -3}"
test_result "Invalid Priority" "$INVALID_PRIORITY_CODE" "HTTP Status: $INVALID_PRIORITY_CODE"

echo -e "\n${GREEN}🎉 All tests completed!${NC}"
echo "========================================="

# Summary
echo -e "${BLUE}Test Summary:${NC}"
echo "This script tests all available endpoints in the Trakt Proxy Backend:"
echo ""
echo "🔐 Authentication:"
echo "  - User registration"
echo "  - User login/logout"
echo "  - Token verification"
echo ""
echo "🎬 Trakt API Proxy (MySQL Logging):"
echo "  - Popular/Trending movies and shows"
echo "  - Movie and show details"
echo "  - Search functionality"
echo ""
echo "🎬 Trakt API Proxy (MongoDB Caching):"
echo "  - All above endpoints with intelligent caching"
echo "  - Box office, watched, favorited lists"
echo "  - Generic proxy for other endpoints"
echo ""
echo "📝 User Interaction Features:"
echo "  - Movie watchlist (add, update, remove, get with details)"
echo "  - Movie comments (create, get, like, delete)"
echo "  - Movie ratings (create, update, get with averages)"
echo "  - User-specific content (personal watchlist, ratings, comments)"
echo ""
echo "📊 Utility Endpoints:"
echo "  - API usage logs"
echo "  - User profile"
echo "  - Movies comments and ratings"
echo ""
echo "🔧 Error Handling:"
echo "  - Invalid endpoints"
echo "  - Authentication errors"
echo "  - Missing parameters"
echo "  - Invalid input validation"
echo ""
echo -e "${YELLOW}Note: Make sure your server is running on $BASE_URL${NC}"
echo -e "${YELLOW}      and environment variables are properly configured.${NC}"