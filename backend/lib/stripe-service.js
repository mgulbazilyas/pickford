const Stripe = require('stripe');

class StripeService {
  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-10-28.acacia', // Use latest API version
      maxNetworkRetries: 3,
      timeout: 20000,
    });

    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  }

  /**
   * Create a Stripe customer
   */
  async createCustomer(userId, email, name = null, metadata = {}) {
    try {
      const customerData = {
        email,
        metadata: {
          userId: userId.toString(),
          ...metadata
        }
      };

      if (name) {
        customerData.name = name;
      }

      const customer = await this.stripe.customers.create(customerData);

      console.log(`[Stripe] Created customer ${customer.id} for user ${userId}`);
      return customer;
    } catch (error) {
      console.error('[Stripe] Error creating customer:', error);
      throw new Error(`Failed to create Stripe customer: ${error.message}`);
    }
  }

  /**
   * Get or create a Stripe customer for a user
   */
  async getOrCreateCustomer(userId, email, name = null, metadata = {}) {
    try {
      // First try to find existing customer by metadata
      const existingCustomers = await this.stripe.customers.list({
        limit: 100,
        metadata: { userId: userId.toString() }
      });

      if (existingCustomers.data.length > 0) {
        const customer = existingCustomers.data[0];
        console.log(`[Stripe] Found existing customer ${customer.id} for user ${userId}`);
        return customer;
      }

      // Create new customer if not found
      return await this.createCustomer(userId, email, name, metadata);
    } catch (error) {
      console.error('[Stripe] Error getting/creating customer:', error);
      throw new Error(`Failed to get/create Stripe customer: ${error.message}`);
    }
  }

  /**
   * Create a payment intent for one-time payments
   */
  async createPaymentIntent(userId, amount, currency = 'usd', metadata = {}) {
    try {
      const customer = await this.getOrCreateCustomer(userId, metadata.email || null, metadata.name || null);

      const paymentIntentData = {
        amount: Math.round(amount * 100), // Convert to cents
        currency,
        customer: customer.id,
        metadata: {
          userId: userId.toString(),
          ...metadata
        },
        automatic_payment_methods: {
          enabled: true,
        },
        payment_method_types: ['card', 'apple_pay', 'google_pay'],
      };

      const paymentIntent = await this.stripe.paymentIntents.create(paymentIntentData);

      console.log(`[Stripe] Created payment intent ${paymentIntent.id} for $${amount}`);
      return paymentIntent;
    } catch (error) {
      console.error('[Stripe] Error creating payment intent:', error);
      throw new Error(`Failed to create payment intent: ${error.message}`);
    }
  }

  /**
   * Create a subscription with multiple billing cycles
   */
  async createSubscription(userId, priceId, metadata = {}) {
    try {
      const customer = await this.getOrCreateCustomer(userId, metadata.email || null, metadata.name || null);

      const subscriptionData = {
        customer: customer.id,
        items: [{ price: priceId }],
        metadata: {
          userId: userId.toString(),
          ...metadata
        },
        payment_behavior: 'default_incomplete',
        payment_settings: {
          save_default_payment_method: 'on_subscription',
          payment_method_types: ['card', 'apple_pay', 'google_pay'],
        },
        expand: ['latest_invoice.payment_intent'],
      };

      const subscription = await this.stripe.subscriptions.create(subscriptionData);

      console.log(`[Stripe] Created subscription ${subscription.id} for user ${userId}`);
      return subscription;
    } catch (error) {
      console.error('[Stripe] Error creating subscription:', error);
      throw new Error(`Failed to create subscription: ${error.message}`);
    }
  }

  /**
   * Create a subscription with custom pricing
   */
  async createCustomSubscription(userId, amount, currency = 'usd', interval = 'month', intervalCount = 1, metadata = {}) {
    try {
      const customer = await this.getOrCreateCustomer(userId, metadata.email || null, metadata.name || null);

      // Create a one-time price for the subscription
      const priceData = {
        unit_amount: Math.round(amount * 100), // Convert to cents
        currency,
        recurring: {
          interval,
          interval_count: intervalCount,
        },
        product_data: {
          name: metadata.productName || 'Custom Subscription',
          metadata: {
            userId: userId.toString(),
            custom: 'true',
            ...metadata
          }
        }
      };

      const price = await this.stripe.prices.create(priceData);

      // Create subscription with the custom price
      return await this.createSubscription(userId, price.id, metadata);
    } catch (error) {
      console.error('[Stripe] Error creating custom subscription:', error);
      throw new Error(`Failed to create custom subscription: ${error.message}`);
    }
  }

  /**
   * Cancel a subscription
   */
  async cancelSubscription(subscriptionId, cancelImmediately = false) {
    try {
      if (cancelImmediately) {
        const canceledSubscription = await this.stripe.subscriptions.cancel(subscriptionId);
        console.log(`[Stripe] Immediately canceled subscription ${subscriptionId}`);
        return canceledSubscription;
      } else {
        // Cancel at period end
        const updatedSubscription = await this.stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        });
        console.log(`[Stripe] Scheduled cancellation of subscription ${subscriptionId} at period end`);
        return updatedSubscription;
      }
    } catch (error) {
      console.error('[Stripe] Error canceling subscription:', error);
      throw new Error(`Failed to cancel subscription: ${error.message}`);
    }
  }

  /**
   * Update a subscription
   */
  async updateSubscription(subscriptionId, updateData) {
    try {
      const updatedSubscription = await this.stripe.subscriptions.update(subscriptionId, updateData);
      console.log(`[Stripe] Updated subscription ${subscriptionId}`);
      return updatedSubscription;
    } catch (error) {
      console.error('[Stripe] Error updating subscription:', error);
      throw new Error(`Failed to update subscription: ${error.message}`);
    }
  }

  /**
   * Get customer portal session
   */
  async createCustomerPortalSession(customerId, returnUrl) {
    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      console.log(`[Stripe] Created portal session ${session.id} for customer ${customerId}`);
      return session;
    } catch (error) {
      console.error('[Stripe] Error creating portal session:', error);
      throw new Error(`Failed to create customer portal session: ${error.message}`);
    }
  }

  /**
   * Create a checkout session for subscriptions or one-time payments
   */
  async createCheckoutSession(userId, priceId, successUrl, cancelUrl, mode = 'subscription', metadata = {}) {
    try {
      const customer = await this.getOrCreateCustomer(userId, metadata.email || null, metadata.name || null);

      const sessionData = {
        customer: customer.id,
        payment_method_types: ['card', 'apple_pay', 'google_pay'],
        mode,
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          userId: userId.toString(),
          ...metadata
        },
        allow_promotion_codes: true,
        billing_address_collection: 'required',
      };

      const session = await this.stripe.checkout.sessions.create(sessionData);

      console.log(`[Stripe] Created checkout session ${session.id} for user ${userId}`);
      return session;
    } catch (error) {
      console.error('[Stripe] Error creating checkout session:', error);
      throw new Error(`Failed to create checkout session: ${error.message}`);
    }
  }

  /**
   * Retrieve a subscription
   */
  async retrieveSubscription(subscriptionId) {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['customer', 'latest_invoice', 'default_payment_method']
      });
      return subscription;
    } catch (error) {
      console.error('[Stripe] Error retrieving subscription:', error);
      throw new Error(`Failed to retrieve subscription: ${error.message}`);
    }
  }

  /**
   * List subscriptions for a customer
   */
  async listCustomerSubscriptions(customerId, status = 'all') {
    try {
      const subscriptions = await this.stripe.subscriptions.list({
        customer: customerId,
        status: status === 'all' ? undefined : status,
        limit: 100,
        expand: ['data.customer', 'data.default_payment_method']
      });
      return subscriptions.data;
    } catch (error) {
      console.error('[Stripe] Error listing subscriptions:', error);
      throw new Error(`Failed to list subscriptions: ${error.message}`);
    }
  }

  /**
   * Create a price for a product
   */
  async createPrice(productId, amount, currency = 'usd', interval = 'month', intervalCount = 1) {
    try {
      const priceData = {
        product: productId,
        unit_amount: Math.round(amount * 100), // Convert to cents
        currency,
        recurring: {
          interval,
          interval_count: intervalCount,
        },
      };

      const price = await this.stripe.prices.create(priceData);
      console.log(`[Stripe] Created price ${price.id} for product ${productId}`);
      return price;
    } catch (error) {
      console.error('[Stripe] Error creating price:', error);
      throw new Error(`Failed to create price: ${error.message}`);
    }
  }

  /**
   * Create a product
   */
  async createProduct(name, description = null, metadata = {}) {
    try {
      const productData = {
        name,
        description,
        metadata,
      };

      const product = await this.stripe.products.create(productData);
      console.log(`[Stripe] Created product ${product.id}: ${name}`);
      return product;
    } catch (error) {
      console.error('[Stripe] Error creating product:', error);
      throw new Error(`Failed to create product: ${error.message}`);
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload, signature) {
    try {
      if (!this.webhookSecret) {
        throw new Error('Webhook secret not configured');
      }

      const event = this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
      return event;
    } catch (error) {
      console.error('[Stripe] Webhook signature verification failed:', error);
      throw new Error(`Invalid webhook signature: ${error.message}`);
    }
  }

  /**
   * Handle incoming webhook events
   */
  async handleWebhookEvent(event) {
    console.log(`[Stripe] Processing webhook event: ${event.type}`);

    try {
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(event);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(event);
          break;
        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(event);
          break;
        case 'invoice.payment_failed':
          await this.handleInvoicePaymentFailed(event);
          break;
        case 'customer.subscription.created':
          await this.handleSubscriptionCreated(event);
          break;
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event);
          break;
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event);
          break;
        case 'invoice.finalized':
          await this.handleInvoiceFinalized(event);
          break;
        case 'customer.created':
          await this.handleCustomerCreated(event);
          break;
        case 'customer.updated':
          await this.handleCustomerUpdated(event);
          break;
        default:
          console.log(`[Stripe] Unhandled webhook event type: ${event.type}`);
      }

      return { success: true, event: event.type };
    } catch (error) {
      console.error(`[Stripe] Error handling webhook event ${event.type}:`, error);
      throw error;
    }
  }

  /**
   * Event handlers for webhooks
   */
  async handlePaymentIntentSucceeded(event) {
    const paymentIntent = event.data.object;
    console.log(`[Stripe] Payment succeeded: ${paymentIntent.id}`);
    // Store payment success in database
    await this.storeWebhookEvent(event, paymentIntent.metadata.userId);
  }

  async handlePaymentIntentFailed(event) {
    const paymentIntent = event.data.object;
    console.log(`[Stripe] Payment failed: ${paymentIntent.id}`);
    // Store payment failure in database
    await this.storeWebhookEvent(event, paymentIntent.metadata.userId);
  }

  async handleInvoicePaymentSucceeded(event) {
    const invoice = event.data.object;
    console.log(`[Stripe] Invoice payment succeeded: ${invoice.id}`);
    // Update subscription status in database
    if (invoice.subscription) {
      await this.storeWebhookEvent(event, null, invoice.subscription);
    }
  }

  async handleInvoicePaymentFailed(event) {
    const invoice = event.data.object;
    console.log(`[Stripe] Invoice payment failed: ${invoice.id}`);
    // Handle failed payment (email user, update status)
    if (invoice.subscription) {
      await this.storeWebhookEvent(event, null, invoice.subscription);
    }
  }

  async handleSubscriptionCreated(event) {
    const subscription = event.data.object;
    console.log(`[Stripe] Subscription created: ${subscription.id}`);
    // Store new subscription in database
    await this.storeWebhookEvent(event, subscription.metadata.userId, subscription.id);
  }

  async handleSubscriptionUpdated(event) {
    const subscriptionData = event.data.object;
    console.log(`[Stripe] Subscription updated: ${subscriptionData.id}`);
    // Update subscription in database
    await this.storeWebhookEvent(event, subscriptionData.metadata.userId, subscriptionData.id);
  }

  async handleSubscriptionDeleted(event) {
    const subscription = event.data.object;
    console.log(`[Stripe] Subscription deleted: ${subscription.id}`);
    // Mark subscription as canceled in database
    await this.storeWebhookEvent(event, subscription.metadata.userId, subscription.id);
  }

  async handleInvoiceFinalized(event) {
    const invoice = event.data.object;
    console.log(`[Stripe] Invoice finalized: ${invoice.id}`);
    // Store invoice in database
    await this.storeWebhookEvent(event, null, invoice.subscription);
  }

  async handleCustomerCreated(event) {
    const customer = event.data.object;
    console.log(`[Stripe] Customer created: ${customer.id}`);
    // Store customer in database
    await this.storeWebhookEvent(event, customer.metadata.userId);
  }

  async handleCustomerUpdated(event) {
    const customer = event.data.object;
    console.log(`[Stripe] Customer updated: ${customer.id}`);
    // Update customer in database
    await this.storeWebhookEvent(event, customer.metadata.userId);
  }

  /**
   * Store webhook event in database
   */
  async storeWebhookEvent(event, userId = null, subscriptionId = null) {
    try {
      const { db } = require('./db-mongodb');

      const eventData = {
        stripeEventId: event.id,
        eventType: event.type,
        userId: userId || event.data.object.metadata?.userId || null,
        subscriptionId: subscriptionId || null,
        stripeObjectId: event.data.object.id,
        data: event.data.object,
        processed: false,
        createdAt: new Date(),
        processedAt: null,
      };

      await db.insertStripeEvent(eventData);
      console.log(`[Stripe] Stored webhook event ${event.id} in database`);
    } catch (error) {
      console.error('[Stripe] Error storing webhook event:', error);
      // Don't throw error to avoid webhook processing failures
    }
  }

  /**
   * Get payment methods for a customer
   */
  async getCustomerPaymentMethods(customerId) {
    try {
      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: customerId,
        type: 'card',
        limit: 100,
      });
      return paymentMethods.data;
    } catch (error) {
      console.error('[Stripe] Error getting payment methods:', error);
      throw new Error(`Failed to get payment methods: ${error.message}`);
    }
  }

  /**
   * Set default payment method for customer
   */
  async setDefaultPaymentMethod(customerId, paymentMethodId) {
    try {
      const customer = await this.stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
      console.log(`[Stripe] Set default payment method ${paymentMethodId} for customer ${customerId}`);
      return customer;
    } catch (error) {
      console.error('[Stripe] Error setting default payment method:', error);
      throw new Error(`Failed to set default payment method: ${error.message}`);
    }
  }
}

// Create singleton instance
const stripeService = new StripeService();

module.exports = { StripeService: stripeService };