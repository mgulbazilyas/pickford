const { StripeService } = require('./stripe-service');
const { AuthService } = require('./auth');

class SubscriptionService {
  constructor() {
    this.stripeService = StripeService;
    this.authService = AuthService;
  }

  /**
   * Create a new subscription package in the database and Stripe
   */
  async createPackage(packageData) {
    const { db } = require('./db-mongodb');

    // Validate required fields
    const requiredFields = ['name', 'price', 'currency', 'interval', 'features'];
    for (const field of requiredFields) {
      if (!packageData[field]) {
        throw new Error(`${field} is required`);
      }
    }

    // Validate billing interval
    const validIntervals = ['day', 'week', 'month', 'year'];
    if (!validIntervals.includes(packageData.interval)) {
      throw new Error(`Invalid interval. Must be one of: ${validIntervals.join(', ')}`);
    }

    try {
      // Create Stripe product first
      const stripeProduct = await this.stripeService.createProduct(
        packageData.name,
        packageData.description,
        {
          type: 'subscription_package',
          features: JSON.stringify(packageData.features),
          ...packageData.metadata
        }
      );

      // Create Stripe price
      const stripePrice = await this.stripeService.createPrice(
        stripeProduct.id,
        packageData.price,
        packageData.currency,
        packageData.interval,
        packageData.intervalCount || 1
      );

      // Store package in database
      const packageToStore = {
        name: packageData.name,
        description: packageData.description || '',
        price: packageData.price,
        currency: packageData.currency,
        interval: packageData.interval,
        intervalCount: packageData.intervalCount || 1,
        features: packageData.features,
        stripeProductId: stripeProduct.id,
        stripePriceId: stripePrice.id,
        status: 'active',
        sortOrder: packageData.sortOrder || 0,
        trialPeriodDays: packageData.trialPeriodDays || 0,
        metadata: packageData.metadata || {}
      };

      const packageId = await db.insertPackage(packageToStore);

      return {
        ...packageToStore,
        _id: packageId,
        stripeProduct,
        stripePrice
      };
    } catch (error) {
      console.error('Error creating package:', error);
      throw new Error(`Failed to create package: ${error.message}`);
    }
  }

  /**
   * Get all subscription packages
   */
  async getAllPackages(status = 'active') {
    const { db } = require('./db-mongodb');
    return await db.getAllPackages(status);
  }

  /**
   * Get package by ID
   */
  async getPackageById(packageId) {
    const { db } = require('./db-mongodb');
    return await db.getPackageById(packageId);
  }

  /**
   * Create a subscription for a user
   */
  async createUserSubscription(userId, packageId, paymentMethodId = null) {
    const { db } = require('./db-mongodb');

    // Get package details
    const package_ = await this.getPackageById(packageId);
    if (!package_) {
      throw new Error('Package not found');
    }

    try {
      // Get user details for Stripe customer creation
      const user = await db.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Create Stripe subscription
      const stripeSubscription = await this.stripeService.createSubscription(
        userId,
        package_.stripePriceId,
        {
          email: user.email,
          name: `${user.firstName} ${user.lastName}`.trim(),
          packageName: package_.name,
          packageId: packageId.toString()
        }
      );

      // Store subscription in database
      const subscriptionData = {
        userId,
        packageId,
        stripeSubscriptionId: stripeSubscription.id,
        stripeCustomerId: stripeSubscription.customer,
        status: stripeSubscription.status,
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        trialStart: stripeSubscription.trial_start ? new Date(stripeSubscription.trial_start * 1000) : null,
        trialEnd: stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000) : null,
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
        canceledAt: stripeSubscription.canceled_at ? new Date(stripeSubscription.canceled_at * 1000) : null,
        endedAt: stripeSubscription.ended_at ? new Date(stripeSubscription.ended_at * 1000) : null,
        metadata: stripeSubscription.metadata || {}
      };

      const subscriptionId = await db.insertSubscription(subscriptionData);

      console.log(`[Subscription] Created subscription ${subscriptionId} for user ${userId}`);

      return {
        ...subscriptionData,
        _id: subscriptionId,
        stripeSubscription,
        package: package_
      };
    } catch (error) {
      console.error('Error creating user subscription:', error);
      throw new Error(`Failed to create subscription: ${error.message}`);
    }
  }

  /**
   * Create a custom subscription with flexible pricing
   */
  async createCustomSubscription(userId, subscriptionData) {
    const { db } = require('./db-mongodb');

    // Validate required fields
    const requiredFields = ['amount', 'currency', 'interval', 'productName'];
    for (const field of requiredFields) {
      if (!subscriptionData[field]) {
        throw new Error(`${field} is required`);
      }
    }

    try {
      // Get user details
      const user = await db.getUserById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Create custom subscription in Stripe
      const stripeSubscription = await this.stripeService.createCustomSubscription(
        userId,
        subscriptionData.amount,
        subscriptionData.currency,
        subscriptionData.interval,
        subscriptionData.intervalCount || 1,
        {
          email: user.email,
          name: `${user.firstName} ${user.lastName}`.trim(),
          productName: subscriptionData.productName,
          description: subscriptionData.description || '',
          features: JSON.stringify(subscriptionData.features || []),
          custom: 'true'
        }
      );

      // Store subscription in database
      const dbSubscriptionData = {
        userId,
        stripeSubscriptionId: stripeSubscription.id,
        stripeCustomerId: stripeSubscription.customer,
        status: stripeSubscription.status,
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        trialStart: stripeSubscription.trial_start ? new Date(stripeSubscription.trial_start * 1000) : null,
        trialEnd: stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000) : null,
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
        canceledAt: stripeSubscription.canceled_at ? new Date(stripeSubscription.canceled_at * 1000) : null,
        endedAt: stripeSubscription.ended_at ? new Date(stripeSubscription.ended_at * 1000) : null,
        customPlan: true,
        customPlanData: {
          amount: subscriptionData.amount,
          currency: subscriptionData.currency,
          interval: subscriptionData.interval,
          intervalCount: subscriptionData.intervalCount || 1,
          productName: subscriptionData.productName,
          description: subscriptionData.description,
          features: subscriptionData.features || []
        },
        metadata: stripeSubscription.metadata || {}
      };

      const subscriptionId = await db.insertSubscription(dbSubscriptionData);

      console.log(`[Subscription] Created custom subscription ${subscriptionId} for user ${userId}`);

      return {
        ...dbSubscriptionData,
        _id: subscriptionId,
        stripeSubscription
      };
    } catch (error) {
      console.error('Error creating custom subscription:', error);
      throw new Error(`Failed to create custom subscription: ${error.message}`);
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId, userId, cancelImmediately = false) {
    const { db } = require('./db-mongodb');

    // Get subscription from database
    const subscription = await db.getSubscriptionByStripeId(subscriptionId);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    // Verify user owns the subscription
    if (subscription.userId.toString() !== userId.toString()) {
      throw new Error('Access denied');
    }

    try {
      // Cancel in Stripe
      const canceledStripeSubscription = await this.stripeService.cancelSubscription(
        subscriptionId,
        cancelImmediately
      );

      // Update in database
      await db.updateSubscription(subscriptionId, {
        status: canceledStripeSubscription.status,
        cancelAtPeriodEnd: canceledStripeSubscription.cancel_at_period_end,
        canceledAt: canceledStripeSubscription.canceled_at ? new Date(canceledStripeSubscription.canceled_at * 1000) : null,
        endedAt: canceledStripeSubscription.ended_at ? new Date(canceledStripeSubscription.ended_at * 1000) : null
      });

      console.log(`[Subscription] Canceled subscription ${subscriptionId} for user ${userId}`);

      return canceledStripeSubscription;
    } catch (error) {
      console.error('Error canceling subscription:', error);
      throw new Error(`Failed to cancel subscription: ${error.message}`);
    }
  }

  /**
   * Get all subscriptions for a user
   */
  async getUserSubscriptions(userId, status = null) {
    const { db } = require('./db-mongodb');
    return await db.getUserSubscriptions(userId, status);
  }

  /**
   * Get active subscription for a user
   */
  async getUserActiveSubscription(userId) {
    const { db } = require('./db-mongodb');
    return await db.getUserActiveSubscription(userId);
  }

  /**
   * Create customer portal session
   */
  async createCustomerPortalSession(userId, returnUrl) {
    const { db } = require('./db-mongodb');

    // Get user's active subscription
    const subscription = await this.getUserActiveSubscription(userId);
    if (!subscription) {
      throw new Error('No active subscription found');
    }

    try {
      // Create portal session
      const portalSession = await this.stripeService.createCustomerPortalSession(
        subscription.stripeCustomerId,
        returnUrl
      );

      // Store portal session in database
      await db.insertPortalSession({
        userId,
        stripeSessionId: portalSession.id,
        returnUrl,
        createdAt: new Date()
      });

      console.log(`[Subscription] Created portal session ${portalSession.id} for user ${userId}`);

      return portalSession;
    } catch (error) {
      console.error('Error creating portal session:', error);
      throw new Error(`Failed to create portal session: ${error.message}`);
    }
  }

  /**
   * Create a checkout session for one-time payment
   */
  async createPaymentCheckout(userId, amount, currency = 'usd', successUrl, cancelUrl, metadata = {}) {
    const { db } = require('./db-mongodb');

    // Get user details
    const user = await db.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    try {
      // Create a one-time price
      const product = await this.stripeService.createProduct(
        metadata.productName || 'Payment',
        metadata.description
      );

      const price = await this.stripeService.createPrice(
        product.id,
        amount,
        currency
      );

      // Create checkout session
      const checkoutSession = await this.stripeService.createCheckoutSession(
        userId,
        price.id,
        successUrl,
        cancelUrl,
        'payment',
        {
          email: user.email,
          name: `${user.firstName} ${user.lastName}`.trim(),
          ...metadata
        }
      );

      console.log(`[Subscription] Created payment checkout session ${checkoutSession.id} for user ${userId}`);

      return checkoutSession;
    } catch (error) {
      console.error('Error creating payment checkout:', error);
      throw new Error(`Failed to create payment checkout: ${error.message}`);
    }
  }

  /**
   * Create a checkout session for subscription
   */
  async createSubscriptionCheckout(userId, packageId, successUrl, cancelUrl, metadata = {}) {
    const { db } = require('./db-mongodb');

    // Get package details
    const package_ = await this.getPackageById(packageId);
    if (!package_) {
      throw new Error('Package not found');
    }

    // Get user details
    const user = await db.getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    try {
      // Create checkout session
      const checkoutSession = await this.stripeService.createCheckoutSession(
        userId,
        package_.stripePriceId,
        successUrl,
        cancelUrl,
        'subscription',
        {
          email: user.email,
          name: `${user.firstName} ${user.lastName}`.trim(),
          packageId: packageId.toString(),
          packageName: package_.name,
          ...metadata
        }
      );

      console.log(`[Subscription] Created subscription checkout session ${checkoutSession.id} for user ${userId}`);

      return checkoutSession;
    } catch (error) {
      console.error('Error creating subscription checkout:', error);
      throw new Error(`Failed to create subscription checkout: ${error.message}`);
    }
  }

  /**
   * Get payment methods for a user
   */
  async getUserPaymentMethods(userId) {
    const { db } = require('./db-mongodb');

    // Get user's active subscription to find Stripe customer
    const subscription = await this.getUserActiveSubscription(userId);
    if (!subscription) {
      return [];
    }

    try {
      return await this.stripeService.getCustomerPaymentMethods(subscription.stripeCustomerId);
    } catch (error) {
      console.error('Error getting payment methods:', error);
      throw new Error(`Failed to get payment methods: ${error.message}`);
    }
  }

  /**
   * Update subscription status based on webhook events
   */
  async updateSubscriptionFromWebhook(event) {
    const { db } = require('./db-mongodb');

    try {
      const subscription = event.data.object;

      // Update subscription in database
      await db.updateSubscription(subscription.id, {
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
        trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: subscription.canceled_at ? new Date(subscription.canceled_at * 1000) : null,
        endedAt: subscription.ended_at ? new Date(subscription.ended_at * 1000) : null,
        metadata: subscription.metadata || {}
      });

      console.log(`[Subscription] Updated subscription ${subscription.id} from webhook ${event.type}`);
    } catch (error) {
      console.error('Error updating subscription from webhook:', error);
      throw error;
    }
  }
}

// Create singleton instance
const subscriptionService = new SubscriptionService();

module.exports = { SubscriptionService: subscriptionService };