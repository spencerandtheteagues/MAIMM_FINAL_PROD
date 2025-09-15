import { Router } from "express";
import Stripe from "stripe";
import { storage } from "./storage";
import { TRIAL_ALLOCATIONS } from "../shared/credits";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-11-20.acacia" as Stripe.LatestApiVersion,
  typescript: true,
});

const router = Router();

// Helper function to get user ID from request
function getUserId(req: any): string | null {
  if (req.session?.userId) return req.session.userId;
  if (req.user?.id) return req.user.id;
  if (req.user?.claims?.sub) return req.user.claims.sub;
  return null;
}

// Simple authentication middleware that works with both auth systems
const requireAuth = async (req: any, res: any, next: any) => {
  const userId = getUserId(req);
  if (!userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
};

// Get the base URL for redirects
function getBaseUrl(req: any): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.BASE_URL) return process.env.BASE_URL;
  if (process.env.REPLIT_DOMAINS) {
    const firstDomain = process.env.REPLIT_DOMAINS.split(',')[0];
    return `https://${firstDomain}`;
  }
  const host = req.get?.('host');
  const proto = req.get?.('x-forwarded-proto') || req.protocol || 'http';
  if (host) return `${proto}://${host}`;
  return `http://localhost:${process.env.PORT || 5000}`;
}

// Define pricing for plans (in cents)
const PLAN_PRICES = {
  starter: {
    price: 1900, // $19
    name: "Starter Plan",
    description: "190 credits per month",
    credits: 190
  },
  professional: {
    price: 4900, // $49
    name: "Professional Plan", 
    description: "500 credits per month",
    credits: 500
  },
  business: {
    price: 19900, // $199
    name: "Business Plan",
    description: "2000 credits per month",
    credits: 2000
  }
};

// Helper function to get tier priority for comparison
function getTierPriority(tier?: string) {
  switch (tier) {
    case "business": return 4;
    case "professional": return 3;
    case "starter": return 2;
    case "free": return 1;
    default: return 0;
  }
}

// Create a Stripe-hosted checkout session for subscription
router.post("/create-checkout-session", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { planId } = req.body;
    
    if (!planId || !PLAN_PRICES[planId as keyof typeof PLAN_PRICES]) {
      return res.status(400).json({ message: "Invalid plan selected" });
    }
    
    const plan = PLAN_PRICES[planId as keyof typeof PLAN_PRICES];
    const user = await storage.getUser(userId!);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Check if this is a downgrade
    const currentPriority = getTierPriority(user.tier);
    const selectedPriority = getTierPriority(planId);
    
    if (selectedPriority < currentPriority) {
      return res.status(400).json({ 
        message: "Downgrades are not allowed through self-service. Please contact support." 
      });
    }
    
    if (selectedPriority === currentPriority) {
      return res.status(400).json({ 
        message: "You are already on this plan." 
      });
    }

    // Create or retrieve Stripe customer
    let customerId = user.stripeCustomerId;
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        name: user.fullName || undefined,
        metadata: {
          userId: user.id
        }
      });
      customerId = customer.id;
      await storage.updateUser(userId!, { stripeCustomerId: customerId });
    }

    const baseUrl = getBaseUrl(req);
    
    // Create Stripe checkout session with mode=subscription for recurring payments
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: plan.name,
            description: plan.description,
          },
          unit_amount: plan.price,
          recurring: {
            interval: 'month',
          },
        },
        quantity: 1,
      }],
      success_url: `${baseUrl}/checkout-return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing`,
      metadata: {
        userId: user.id,
        planId: planId,
        credits: plan.credits.toString()
      }
    });

    res.json({ url: session.url });
  } catch (error: any) {
    console.error("Error creating checkout session:", error);
    res.status(500).json({ message: "Error creating checkout session: " + error.message });
  }
});

// Create a one-time payment checkout session for credit packs
router.post("/create-credit-checkout", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const { credits } = req.body;
    
    if (!credits || credits < 10) {
      return res.status(400).json({ message: "Minimum 10 credits required" });
    }
    
    const user = await storage.getUser(userId!);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Create or retrieve Stripe customer
    let customerId = user.stripeCustomerId;
    
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        name: user.fullName || undefined,
        metadata: {
          userId: user.id
        }
      });
      customerId = customer.id;
      await storage.updateUser(userId!, { stripeCustomerId: customerId });
    }

    const baseUrl = getBaseUrl(req);
    const pricePerCredit = 10; // 10 cents per credit
    
    // Create Stripe checkout session with mode=payment for one-time purchase
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${credits} AI Credits`,
            description: `One-time purchase of ${credits} credits for AI content generation`,
          },
          unit_amount: credits * pricePerCredit,
        },
        quantity: 1,
      }],
      success_url: `${baseUrl}/checkout-return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/billing`,
      metadata: {
        userId: user.id,
        type: 'credits',
        credits: credits.toString()
      }
    });

    res.json({ url: session.url });
  } catch (error: any) {
    console.error("Error creating credit checkout session:", error);
    res.status(500).json({ message: "Error creating checkout session: " + error.message });
  }
});

// Retrieve checkout session status
router.get("/session-status/:sessionId", requireAuth, async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    
    res.json({
      status: session.payment_status,
      customer_email: session.customer_details?.email,
      amount_total: session.amount_total,
      currency: session.currency
    });
  } catch (error: any) {
    console.error("Error retrieving session:", error);
    res.status(500).json({ message: "Error retrieving session: " + error.message });
  }
});

// Webhook endpoint moved to separate file (stripe-webhook.ts) 
// to handle raw body parsing before JSON middleware

// Cancel subscription
router.post("/cancel-subscription", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const user = await storage.getUser(userId!);
    
    if (!user || !user.stripeSubscriptionId) {
      return res.status(400).json({ message: "No active subscription found" });
    }
    
    // Cancel the subscription at period end (or immediately based on request)
    const { immediate } = req.body;
    const subscription = immediate 
      ? await stripe.subscriptions.cancel(user.stripeSubscriptionId)
      : await stripe.subscriptions.update(
          user.stripeSubscriptionId,
          { cancel_at_period_end: true }
        );
    
    res.json({ 
      message: immediate 
        ? "Subscription cancelled immediately"
        : "Subscription will be cancelled at the end of the billing period",
      cancelAt: subscription.cancel_at,
      status: subscription.status
    });
  } catch (error: any) {
    console.error("Error cancelling subscription:", error);
    res.status(500).json({ message: "Error cancelling subscription: " + error.message });
  }
});

// Resume a cancelled subscription (remove cancellation)
router.post("/resume-subscription", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const user = await storage.getUser(userId!);
    
    if (!user || !user.stripeSubscriptionId) {
      return res.status(400).json({ message: "No subscription found" });
    }
    
    // Resume subscription by removing cancellation
    const subscription = await stripe.subscriptions.update(
      user.stripeSubscriptionId,
      { cancel_at_period_end: false }
    );
    
    res.json({ 
      message: "Subscription resumed successfully",
      status: subscription.status
    });
  } catch (error: any) {
    console.error("Error resuming subscription:", error);
    res.status(500).json({ message: "Error resuming subscription: " + error.message });
  }
});

// Create customer portal session for subscription management
router.post("/create-portal-session", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const user = await storage.getUser(userId!);
    
    if (!user || !user.stripeCustomerId) {
      return res.status(400).json({ message: "No customer account found" });
    }
    
    const baseUrl = getBaseUrl(req);
    const { returnUrl } = req.body;
    
    // Create customer portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl || `${baseUrl}/billing`,
    });
    
    res.json({ url: session.url });
  } catch (error: any) {
    console.error("Error creating portal session:", error);
    res.status(500).json({ message: "Error creating portal session: " + error.message });
  }
});

// Get subscription status with detailed information
router.get("/subscription-status", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const user = await storage.getUser(userId!);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    if (!user.stripeCustomerId) {
      return res.json({ 
        hasSubscription: false,
        status: 'no_subscription',
        credits: user.credits || 0
      });
    }
    
    // Get all subscriptions for the customer
    const subscriptions = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: 'all',
      expand: ['data.default_payment_method'],
      limit: 1
    });
    
    if (subscriptions.data.length === 0) {
      return res.json({ 
        hasSubscription: false,
        status: 'no_subscription',
        credits: user.credits || 0
      });
    }
    
    const subscription = subscriptions.data[0];
    const planId = subscription.metadata.planId;
    const plan = planId ? PLAN_PRICES[planId as keyof typeof PLAN_PRICES] : null;
    
    res.json({
      hasSubscription: true,
      subscriptionId: subscription.id,
      status: subscription.status,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
      plan: plan ? {
        id: planId,
        name: plan.name,
        credits: plan.credits,
        price: plan.price / 100
      } : null,
      credits: user.credits || 0
    });
  } catch (error: any) {
    console.error("Error getting subscription status:", error);
    res.status(500).json({ message: "Error getting subscription status: " + error.message });
  }
});

// Get subscription plans with trial info
router.get("/plans", async (req, res) => {
  try {
    const userId = getUserId(req);
    let userTrialPlan = null;
    
    if (userId) {
      const user = await storage.getUser(userId);
      userTrialPlan = user?.trialPlan || null;
    }
    
    const plans = Object.entries(PLAN_PRICES).map(([id, details]) => ({
      id,
      name: details.name,
      price: details.price / 100, // Convert to dollars
      credits: details.credits,
      description: details.description,
      trialCredits: userTrialPlan === id ? TRIAL_ALLOCATIONS[id as keyof typeof TRIAL_ALLOCATIONS] : null
    }));
    
    res.json(plans);
  } catch (error: any) {
    res.status(500).json({ message: "Error fetching plans: " + error.message });
  }
});

// Update payment method
router.post("/update-payment-method", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    const user = await storage.getUser(userId!);
    
    if (!user || !user.stripeCustomerId) {
      return res.status(400).json({ message: "No customer account found" });
    }
    
    const baseUrl = getBaseUrl(req);
    
    // Create setup session for updating payment method
    const session = await stripe.checkout.sessions.create({
      customer: user.stripeCustomerId,
      payment_method_types: ['card'],
      mode: 'setup',
      success_url: `${baseUrl}/billing?payment_updated=true`,
      cancel_url: `${baseUrl}/billing`,
    });
    
    res.json({ url: session.url });
  } catch (error: any) {
    console.error("Error creating payment update session:", error);
    res.status(500).json({ message: "Error updating payment method: " + error.message });
  }
});

// Create $1 Pro Trial (14 days) checkout session
router.post("/create-pro-trial", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const user = await storage.getUser(userId!);
    const baseUrl = getBaseUrl(req);
    const priceId = process.env.STRIPE_PRO_TRIAL_PRODUCT;
    if (!priceId) return res.status(500).json({ message: "Missing STRIPE_PRO_TRIAL_PRODUCT" });

    let customerId = user?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user?.email || undefined });
      customerId = customer.id;
      if (user) await storage.updateUser(user.id, { stripeCustomerId: customerId });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId || undefined,
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/trial/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/choose-trial?canceled=1`,
      payment_intent_data: { metadata: { purpose: 'pro_trial_1usd', userId: userId! } },
      metadata: { purpose: 'pro_trial_1usd', userId: userId! }
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error("Error creating pro trial checkout:", err);
// Create $1 Pro Trial (14 days) checkout session
router.post("/create-pro-trial", requireAuth, async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Not authenticated" });

    const user = await storage.getUser(userId!);
    const baseUrl = getBaseUrl(req);
    const priceId = process.env.STRIPE_PRO_TRIAL_PRODUCT;
    if (!priceId) return res.status(500).json({ message: "Missing STRIPE_PRO_TRIAL_PRODUCT" });

    let customerId = user?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user?.email || undefined });
      customerId = customer.id;
      if (user) await storage.updateUser(user.id, { stripeCustomerId: customerId });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/trial/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/choose-trial?canceled=1`,
      payment_intent_data: { metadata: { purpose: 'pro_trial_1usd', userId } },
      metadata: { purpose: 'pro_trial_1usd', userId }
    });

    res.json({ url: session.url });
  } catch (err: any) {
    console.error("Error creating pro trial checkout:", err);
    res.status(500).json({ message: "Error creating pro trial checkout: " + err.message });
  }
});

    res.status(500).json({ message: "Error creating pro trial checkout: " + err.message });
  }
});

export default router;
