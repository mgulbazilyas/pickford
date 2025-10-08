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

2. **[STRIPE_API_DOCUMENTATION.md](./STRIPE_API_DOCUMENTATION.md)**
   - Comprehensive Stripe payment system documentation
   - Payment processing endpoints and workflows
   - Subscription management and billing cycles
   - Webhook handling and security considerations
   - Data models for payments and subscriptions

3. **[API_SUMMARY.md](./API_SUMMARY.md)**
   - Quick reference guide
   - Recently implemented features
   - Development status overview
   - Environment variables

4. **[README.md](./README.md)** (this file)
   - Documentation overview
   - Getting started information

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- MongoDB
- Trakt API Client ID
- Stripe Account (for payment processing)

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
# Trakt API Configuration
TRAKT_CLIENT_ID=your_trakt_client_id    # Required
TRAKT_BASE_URL=https://api.trakt.tv     # Optional
TRAKT_API_VERSION=2                     # Optional

# MongoDB Database
MONGODB_URI=mongodb://localhost:27017    # Optional
MONGODB_DB=trakt-proxy                   # Optional

# Application Configuration
PORT=3000                               # Optional

# Authentication & JWT
JWT_SECRET=your-super-secret-jwt-key    # Required
REFRESH_TOKEN_SECRET=your-refresh-key   # Required

# Email Configuration (for user verification)
EMAIL_HOST=smtp.gmail.com               # Required for email verification
EMAIL_PORT=587                          # Required for email verification
EMAIL_SECURE=false                      # Required for email verification
EMAIL_USER=your-email@gmail.com         # Required for email verification
EMAIL_PASS=your-app-password            # Required for email verification
EMAIL_FROM=Pickford <noreply@pickford.app>  # Optional
EMAIL_FROM_NAME=Pickford                 # Optional

# Email Verification Settings
EMAIL_VERIFICATION_REQUIRED=true        # Optional (default: true)
EMAIL_VERIFICATION_TOKEN_EXPIRES_IN=24h # Optional (default: 24h)

# Stripe Payment Configuration
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key      # Required for payments
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key # Required for frontend
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret      # Required for webhooks
STRIPE_WEBHOOK_ENDPOINT_URL=http://localhost:3000/api/webhooks/stripe # Required

# Application URLs for Stripe
APP_BASE_URL=http://localhost:3000                       # Required for Stripe redirects
SUCCESS_URL=http://localhost:3000/payment/success        # Required for checkout success
CANCEL_URL=http://localhost:3000/payment/canceled        # Required for checkout cancel
```

## 📚 API Features

### ✅ Complete CRUD Operations
- **Authentication**: Register, Login, Logout, Email Verification
- **User Profiles**: Get and update user information
- **Password Management**: Forgot password, reset password functionality
- **Movies & Shows**: Trakt API integration with caching
- **Comments**: Create, read, update, delete with likes
- **Ratings & Reviews**: 1-10 scale rating system
- **Watchlist**: Personal movie watchlist with priorities

### 🔐 Security Features
- JWT-based authentication with refresh tokens
- Password hashing with bcrypt
- Email verification for user registration
- User authorization checks
- Session management with token expiration
- Secure password reset functionality

### 🎯 Performance Features
- MongoDB caching layer
- TTL-based cache expiration
- API request logging
- Graceful error handling

## 🔄 Recently Implemented Features

### ✅ User Authentication with Email Verification
- Complete user registration system with email verification
- Login with JWT access and refresh tokens
- Email verification required for account activation
- Password reset functionality via email
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/auth/verify-email?token={token}` - Verify email
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password

### ✅ User Profile Management
- Get and update user profiles
- Secure profile endpoints with authentication
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile

### ✅ Rating Deletion API
- Users can now delete their own movie ratings
- `DELETE /api/ratings?movieId={movieId}`

### ✅ Comment Editing API
- Users can now edit their own comments
- `PUT /api/comments` with content update

### ✅ Enhanced Watchlist
- Watchlist now includes full movie details from Trakt API
- `GET /api/watchlist?includeDetails=true`

### ✅ Stripe Payment Integration System
- Complete payment processing with Stripe API integration
- Support for one-time payments and recurring subscriptions
- Multiple billing cycles: daily, weekly, monthly, quarterly, yearly
- Payment methods: Credit cards, Apple Pay, Google Pay
- Subscription tier management with custom packages
- Customer portal for subscription self-service
- Comprehensive webhook handling and audit trail

**Payment Endpoints:**
- `POST /api/payments/create-intent` - Create payment intent for one-time payments
- `POST /api/payments/checkout` - Create Stripe checkout session
- `POST /api/payments/methods` - Get user payment methods

**Subscription Endpoints:**
- `POST /api/subscriptions/packages` - Create subscription package
- `GET /api/subscriptions/packages` - Get all subscription packages
- `POST /api/subscriptions/create` - Create user subscription
- `GET /api/subscriptions/active` - Get user's active subscription
- `GET /api/subscriptions/all` - Get all user subscriptions
- `POST /api/subscriptions/portal` - Create customer portal session
- `POST /api/subscriptions/cancel` - Cancel subscription
- `POST /api/subscriptions/custom` - Create custom subscription

**Webhook Endpoints:**
- `POST /api/webhooks/stripe` - Handle Stripe webhook events

## 📊 Database Schema

### Collections
- `users` - User accounts and profiles with email verification status
- `comments` - Movie/show comments with likes (supports both movies and shows)
- `ratings` - Movie/show ratings and reviews (supports both movies and shows)
- `watchlist` - User watchlists with priorities (supports both movies and shows)
- `sessions` - Authentication sessions with JWT tokens
- `api_logs` - API request logs
- `cache` - Trakt API response cache with TTL
- `packages` - Subscription tier details and pricing
- `subscriptions` - User subscription records and status
- `stripe_events` - Stripe webhook event audit log
- `stripe_portal_sessions` - Customer portal session records

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
- Authentication access tokens expire after 7 days, refresh tokens after 90 days
- Email verification tokens expire after 24 hours (configurable)
- Password reset tokens expire after 1 hour
- Email verification is required if EMAIL_VERIFICATION_REQUIRED is set to true

## 📧 Email Setup

To enable email verification and password reset:

1. **Gmail SMTP Setup:**
   ```bash
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_SECURE=false
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-app-password  # Use app password, not regular password
   ```

2. **Enable 2-Factor Authentication** on your Google Account
3. **Generate App Password:**
   - Go to Google Account settings → Security
   - Enable 2-Step Verification
   - Go to App passwords → Generate new app password
   - Use the generated password in EMAIL_PASS

4. **Other Email Providers:**
   - Update EMAIL_HOST, EMAIL_PORT, and EMAIL_SECURE accordingly
   - Most providers support port 587 with TLS (EMAIL_SECURE=false)

## 💳 Stripe Payment Setup

To enable payment processing and subscriptions:

1. **Create Stripe Account:**
   - Sign up at [Stripe](https://stripe.com)
   - Get your API keys from the Stripe Dashboard

2. **Configure Webhooks:**
   - In Stripe Dashboard → Developers → Webhooks
   - Add endpoint: `http://your-domain.com/api/webhooks/stripe`
   - Select events to listen for:
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.finalized`
     - `customer.created`
     - `customer.updated`

3. **Environment Variables:**
   ```bash
   STRIPE_SECRET_KEY=sk_test_...  # From Stripe Dashboard
   STRIPE_PUBLISHABLE_KEY=pk_test_... # From Stripe Dashboard
   STRIPE_WEBHOOK_SECRET=whsec_... # From webhook configuration
   ```

4. **Payment Flow:**
   - Use `POST /api/payments/create-intent` for one-time payments
   - Use `POST /api/subscriptions/create` for recurring subscriptions
   - Use `POST /api/subscriptions/portal` for customer management

## 🤝 Contributing

When adding new features:
1. Update the API documentation
2. Follow the existing code patterns
3. Add proper error handling
4. Update this README if needed

## 📄 License

This project is part of the Pickford application.