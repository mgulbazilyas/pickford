# Stripe Payment API Documentation

## Overview

This document describes the complete Stripe payment integration system for the Pickford backend application. The system supports one-time payments, recurring subscriptions, customer portal management, and comprehensive webhook handling.

## Authentication

All payment and subscription endpoints require JWT authentication. Include the access token in the Authorization header:

```
Authorization: Bearer <access_token>
```

## Payment Endpoints

### Create Payment Intent

Creates a payment intent for one-time payments.

**Endpoint:** `POST /api/payments/create-intent`

**Request Body:**
```json
{
  "amount": 49.99,
  "currency": "usd",
  "metadata": {
    "productName": "Premium Feature",
    "description": "Access to premium features"
  }
}
```

**Response:**
```json
{
  "success": true,
  "paymentIntent": {
    "id": "pi_1234567890",
    "client_secret": "pi_1234567890_secret_12345",
    "amount": 4999,
    "currency": "usd",
    "status": "requires_payment_method"
  }
}
```

### Create Payment Checkout

Creates a Stripe checkout session for one-time payments.

**Endpoint:** `POST /api/payments/checkout`

**Request Body:**
```json
{
  "amount": 49.99,
  "currency": "usd",
  "successUrl": "http://localhost:3000/payment/success",
  "cancelUrl": "http://localhost:3000/payment/canceled",
  "metadata": {
    "productName": "Premium Feature"
  }
}
```

**Response:**
```json
{
  "success": true,
  "checkoutSession": {
    "id": "cs_1234567890",
    "url": "https://checkout.stripe.com/pay/cs_1234567890",
    "payment_status": "unpaid"
  }
}
```

### Get Payment Methods

Retrieves saved payment methods for the authenticated user.

**Endpoint:** `GET /api/payments/methods`

**Response:**
```json
{
  "success": true,
  "paymentMethods": [
    {
      "id": "pm_1234567890",
      "type": "card",
      "card": {
        "brand": "visa",
        "last4": "4242",
        "exp_month": 12,
        "exp_year": 2025
      },
      "created": 1640995200
    }
  ]
}
```

## Subscription Package Endpoints

### Create Subscription Package

Creates a new subscription package (admin only).

**Endpoint:** `POST /api/subscriptions/packages`

**Request Body:**
```json
{
  "name": "Premium Monthly",
  "description": "Full access to all premium features",
  "price": 19.99,
  "currency": "usd",
  "interval": "month",
  "intervalCount": 1,
  "features": [
    "HD streaming",
    "Offline downloads",
    "Multiple profiles",
    "Priority support"
  ],
  "trialPeriodDays": 14,
  "sortOrder": 1,
  "metadata": {
    "tier": "premium"
  }
}
```

**Response:**
```json
{
  "success": true,
  "package": {
    "_id": "507f1f77bcf86cd799439011",
    "name": "Premium Monthly",
    "price": 19.99,
    "currency": "usd",
    "interval": "month",
    "features": ["HD streaming", "Offline downloads"],
    "stripeProductId": "prod_1234567890",
    "stripePriceId": "price_1234567890",
    "status": "active",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Get All Subscription Packages

Retrieves all active subscription packages.

**Endpoint:** `GET /api/subscriptions/packages`

**Query Parameters:**
- `status` (optional): Filter by status (`active`, `inactive`, `all`). Default: `active`

**Response:**
```json
{
  "success": true,
  "packages": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "Basic Monthly",
      "price": 9.99,
      "currency": "usd",
      "interval": "month",
      "features": ["SD streaming", "Single profile"],
      "trialPeriodDays": 7,
      "sortOrder": 0
    },
    {
      "_id": "507f1f77bcf86cd799439012",
      "name": "Premium Monthly",
      "price": 19.99,
      "currency": "usd",
      "interval": "month",
      "features": ["HD streaming", "Offline downloads", "Multiple profiles"],
      "trialPeriodDays": 14,
      "sortOrder": 1
    }
  ]
}
```

## Subscription Management Endpoints

### Create User Subscription

Creates a subscription for the authenticated user.

**Endpoint:** `POST /api/subscriptions/create`

**Request Body:**
```json
{
  "packageId": "507f1f77bcf86cd799439011",
  "paymentMethodId": "pm_1234567890"
}
```

**Response:**
```json
{
  "success": true,
  "subscription": {
    "_id": "507f1f77bcf86cd799439013",
    "userId": "507f1f77bcf86cd799439014",
    "packageId": "507f1f77bcf86cd799439011",
    "stripeSubscriptionId": "sub_1234567890",
    "status": "active",
    "currentPeriodStart": "2024-01-01T00:00:00.000Z",
    "currentPeriodEnd": "2024-02-01T00:00:00.000Z",
    "trialStart": "2024-01-01T00:00:00.000Z",
    "trialEnd": "2024-01-15T00:00:00.000Z",
    "cancelAtPeriodEnd": false,
    "package": {
      "name": "Premium Monthly",
      "price": 19.99,
      "features": ["HD streaming", "Offline downloads"]
    }
  }
}
```

### Create Custom Subscription

Creates a custom subscription with flexible pricing.

**Endpoint:** `POST /api/subscriptions/custom`

**Request Body:**
```json
{
  "amount": 29.99,
  "currency": "usd",
  "interval": "month",
  "intervalCount": 1,
  "productName": "Enterprise Plan",
  "description": "Custom enterprise solution",
  "features": [
    "API access",
    "Custom integrations",
    "Dedicated support"
  ]
}
```

**Response:**
```json
{
  "success": true,
  "subscription": {
    "_id": "507f1f77bcf86cd799439013",
    "userId": "507f1f77bcf86cd799439014",
    "stripeSubscriptionId": "sub_1234567890",
    "status": "active",
    "customPlan": true,
    "customPlanData": {
      "amount": 29.99,
      "currency": "usd",
      "interval": "month",
      "productName": "Enterprise Plan",
      "features": ["API access", "Custom integrations"]
    },
    "currentPeriodStart": "2024-01-01T00:00:00.000Z",
    "currentPeriodEnd": "2024-02-01T00:00:00.000Z"
  }
}
```

### Get User Active Subscription

Retrieves the currently active subscription for the authenticated user.

**Endpoint:** `GET /api/subscriptions/active`

**Response:**
```json
{
  "success": true,
  "subscription": {
    "_id": "507f1f77bcf86cd799439013",
    "userId": "507f1f77bcf86cd799439014",
    "packageId": "507f1f77bcf86cd799439011",
    "status": "active",
    "currentPeriodStart": "2024-01-01T00:00:00.000Z",
    "currentPeriodEnd": "2024-02-01T00:00:00.000Z",
    "trialEnd": "2024-01-15T00:00:00.000Z",
    "package": {
      "name": "Premium Monthly",
      "price": 19.99,
      "features": ["HD streaming", "Offline downloads"]
    }
  }
}
```

### Get All User Subscriptions

Retrieves all subscriptions for the authenticated user.

**Endpoint:** `GET /api/subscriptions/all`

**Query Parameters:**
- `status` (optional): Filter by status (`active`, `canceled`, `past_due`, `unpaid`, `all`). Default: `all`

**Response:**
```json
{
  "success": true,
  "subscriptions": [
    {
      "_id": "507f1f77bcf86cd799439013",
      "status": "active",
      "currentPeriodStart": "2024-01-01T00:00:00.000Z",
      "currentPeriodEnd": "2024-02-01T00:00:00.000Z",
      "package": {
        "name": "Premium Monthly",
        "price": 19.99
      }
    },
    {
      "_id": "507f1f77bcf86cd799439015",
      "status": "canceled",
      "canceledAt": "2023-12-15T00:00:00.000Z",
      "endedAt": "2023-12-31T23:59:59.000Z",
      "package": {
        "name": "Basic Monthly",
        "price": 9.99
      }
    }
  ]
}
```

### Create Customer Portal Session

Creates a Stripe customer portal session for subscription management.

**Endpoint:** `POST /api/subscriptions/portal`

**Request Body:**
```json
{
  "returnUrl": "http://localhost:3000/account/billing"
}
```

**Response:**
```json
{
  "success": true,
  "portalSession": {
    "id": "bps_1234567890",
    "url": "https://billing.stripe.com/session/bs_1234567890",
    "return_url": "http://localhost:3000/account/billing",
    "created": 1640995200
  }
}
```

### Cancel Subscription

Cancels a user's subscription.

**Endpoint:** `POST /api/subscriptions/cancel`

**Request Body:**
```json
{
  "subscriptionId": "sub_1234567890",
  "cancelImmediately": false,
  "reason": "No longer needed"
}
```

**Response:**
```json
{
  "success": true,
  "subscription": {
    "id": "sub_1234567890",
    "status": "active",
    "cancel_at_period_end": true,
    "canceled_at": 1640995200,
    "current_period_end": 1643587200
  },
  "message": "Subscription will be canceled at the end of the billing period"
}
```

### Create Subscription Checkout

Creates a Stripe checkout session for subscription purchases.

**Endpoint:** `POST /api/subscriptions/checkout`

**Request Body:**
```json
{
  "packageId": "507f1f77bcf86cd799439011",
  "successUrl": "http://localhost:3000/subscription/success",
  "cancelUrl": "http://localhost:3000/subscription/canceled"
}
```

**Response:**
```json
{
  "success": true,
  "checkoutSession": {
    "id": "cs_1234567890",
    "url": "https://checkout.stripe.com/pay/cs_1234567890",
    "subscription": null,
    "mode": "subscription"
  }
}
```

## Webhook Endpoints

### Stripe Webhook Handler

Processes incoming webhook events from Stripe.

**Endpoint:** `POST /api/webhooks/stripe`

**Headers:**
- `Stripe-Signature`: Stripe signature for webhook verification

**Request Body:** Raw webhook event payload from Stripe

**Response:**
```json
{
  "success": true,
  "event": "payment_intent.succeeded",
  "message": "Webhook processed successfully"
}
```

**Supported Events:**
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

## Data Models

### Subscription Package Model

```json
{
  "_id": "ObjectId",
  "name": "string",
  "description": "string",
  "price": "number",
  "currency": "string",
  "interval": "string (day|week|month|year)",
  "intervalCount": "number",
  "features": ["string"],
  "stripeProductId": "string",
  "stripePriceId": "string",
  "status": "string (active|inactive)",
  "sortOrder": "number",
  "trialPeriodDays": "number",
  "metadata": "object",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

### Subscription Model

```json
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "packageId": "ObjectId (optional)",
  "stripeSubscriptionId": "string",
  "stripeCustomerId": "string",
  "status": "string",
  "currentPeriodStart": "Date",
  "currentPeriodEnd": "Date",
  "trialStart": "Date (optional)",
  "trialEnd": "Date (optional)",
  "cancelAtPeriodEnd": "boolean",
  "canceledAt": "Date (optional)",
  "endedAt": "Date (optional)",
  "customPlan": "boolean",
  "customPlanData": "object (optional)",
  "metadata": "object",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

### Stripe Event Model

```json
{
  "_id": "ObjectId",
  "stripeEventId": "string",
  "eventType": "string",
  "userId": "ObjectId (optional)",
  "subscriptionId": "string (optional)",
  "stripeObjectId": "string",
  "data": "object",
  "processed": "boolean",
  "createdAt": "Date",
  "processedAt": "Date (optional)"
}
```

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": "Additional error details (optional)"
}
```

### Common Error Codes

- `UNAUTHORIZED`: Invalid or missing authentication token
- `FORBIDDEN`: User does not have permission for the requested action
- `NOT_FOUND`: Requested resource does not exist
- `VALIDATION_ERROR`: Invalid request data
- `STRIPE_ERROR`: Stripe API error
- `SUBSCRIPTION_REQUIRED`: User must have an active subscription
- `PAYMENT_REQUIRED`: Payment is required to proceed

## Billing Intervals

The system supports multiple billing intervals:

- **day**: Daily billing
- **week**: Weekly billing
- **month**: Monthly billing
- **year**: Yearly billing

Each interval can be customized with `intervalCount`:
- `interval: "month", intervalCount: 3` = Quarterly billing
- `interval: "month", intervalCount: 6` = Semi-annual billing

## Payment Methods

The system supports multiple payment methods:

- **Credit/Debit Cards**: Visa, Mastercard, American Express, Discover
- **Digital Wallets**: Apple Pay, Google Pay
- **Other Methods**: Based on Stripe's supported payment methods

## Security Considerations

1. **Webhook Verification**: All webhook signatures are verified using Stripe's webhook secret
2. **Authentication**: All endpoints require valid JWT tokens
3. **Authorization**: Users can only access their own subscriptions and payment methods
4. **Data Encryption**: All sensitive data is encrypted at rest and in transit
5. **Audit Trail**: All Stripe events are logged for audit purposes

## Testing

Use Stripe's test environment for development:

- Use test API keys (starting with `sk_test_` and `pk_test_`)
- Use Stripe's test card numbers: https://stripe.com/docs/testing
- Test webhooks using Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`

## Rate Limiting

All endpoints are subject to rate limiting to prevent abuse:

- Payment endpoints: 10 requests per minute per user
- Subscription endpoints: 20 requests per minute per user
- Webhook endpoints: 1000 requests per minute per IP

## Currency Support

The system supports all currencies supported by Stripe. Default currency is USD. When creating prices or payment intents, specify the 3-letter currency code (e.g., 'usd', 'eur', 'gbp').