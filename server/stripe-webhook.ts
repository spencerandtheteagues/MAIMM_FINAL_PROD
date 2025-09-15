import { Router, type Request, type Response } from "express";
import express from "express";
import Stripe from "stripe";
import { storage } from "./storage";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required Stripe secret: STRIPE_SECRET_KEY');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2024-11-20.acacia" as Stripe.LatestApiVersion,
  typescript: true,
});

const router = Router();

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

// IMPORTANT: This webhook handler MUST use express.raw() for body parsing
// and MUST be registered BEFORE any express.json() middleware
router.post("/webhook", 
  express.raw({ type: "application/json" }), 
  async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("STRIPE_WEBHOOK_SECRET not configured");
      // Still return 200 to prevent retries
      return res.sendStatus(200);
    }

    let event: Stripe.Event;

    try {
      // Verify the webhook signature using the raw body
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: any) {
      console.error(`Webhook signature verification failed: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          
          // Fulfill the purchase
          const userId = session.metadata?.userId;
          const type = session.metadata?.type;
          const credits = parseInt(session.metadata?.credits || '0');
          const planId = session.metadata?.planId;
          
          if (userId) {
            const user = await storage.getUser(userId);
            if (user) {
              if (type === 'credits') {
                // One-time credit purchase
                await storage.updateUser(userId, {
                  credits: (user.credits || 0) + credits
                });
                
                // Log the transaction
                await storage.createCreditTransaction({
                  userId,
                  amount: credits,
                  type: 'purchase',
                  description: `Purchased ${credits} credits`,
                  stripeSessionId: session.id
                });
                
                console.log(`✅ Fulfilled credit purchase for user ${userId}: ${credits} credits`);
              } else if (planId) {
                // Subscription purchase
                const subscriptionId = session.subscription as string;
                
                await storage.updateUser(userId, {
                  tier: planId as any,
                  stripeSubscriptionId: subscriptionId,
                  credits: (user.credits || 0) + credits,
                  monthlyCredits: credits
                });
                
                // Log the transaction
                await storage.createCreditTransaction({
                  userId,
                  amount: credits,
                  type: 'purchase',
                  description: `${PLAN_PRICES[planId as keyof typeof PLAN_PRICES].name} subscription`,
                  stripeSessionId: session.id
                });
                
                console.log(`✅ Activated subscription for user ${userId}: ${planId} plan`);
              }
            }
          }
          break;
        }
        
        case 'invoice.paid': {
          const invoice = event.data.object as Stripe.Invoice;
          console.log(`✅ Invoice paid: ${invoice.id}`);
          
          // Handle successful recurring payment - refresh monthly credits
          const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
          const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
          
          if (subscriptionId) {
            // Find user by customer ID
            const users = await storage.getAllUsers();
            const user = users.find(u => u.stripeCustomerId === customerId);
            
            if (user && user.monthlyCredits) {
              // Refresh monthly credits on successful payment
              await storage.updateUser(user.id, {
                credits: (user.credits || 0) + user.monthlyCredits
              });
              
              await storage.createCreditTransaction({
                userId: user.id,
                amount: user.monthlyCredits,
                type: 'purchase',
                description: 'Monthly subscription credits',
                stripeSessionId: invoice.id
              });
              
              console.log(`✅ Refreshed ${user.monthlyCredits} credits for user ${user.id}`);
            }
          }
          break;
        }
        
        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          console.log(`❌ Invoice payment failed: ${invoice.id}`);
          // Handle failed recurring payment
          break;
        }
        
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = subscription.customer as string;
          
          // Find user by Stripe customer ID
          const users = await storage.getAllUsers();
          const user = users.find(u => u.stripeCustomerId === customerId);
          
          if (user) {
            if (event.type === 'customer.subscription.deleted') {
              // Subscription cancelled
              await storage.updateUser(user.id, {
                tier: 'free',
                stripeSubscriptionId: null,
                monthlyCredits: 0
              });
              console.log(`❌ Subscription cancelled for user ${user.id}`);
            } else {
              console.log(`✅ Subscription updated for user ${user.id}`);
            }
          }
          break;
        }
        
case 'checkout.session.completed': {
  const session = event.data.object as Stripe.Checkout.Session;

  if ((session as any)?.metadata?.purpose === 'pro_trial_1usd') {
    try {
      const userId = (session as any).metadata.userId as string | undefined;
      let user: any = null;
      if (userId) user = await storage.getUser(userId);
      else if ((session as any).customer_email) user = await storage.getUserByEmail((session as any).customer_email);

      if (user) {
        const now = new Date();
        const end = new Date(now.getTime() + 14 * 24 * 3600 * 1000);
        await storage.updateUser(user.id, {
          subscriptionStatus: 'trial',
          trialVariant: 'pro14_1usd',
          trialStartedAt: now,
          trialEndsAt: end,
          needsTrialSelection: false
        });
        if ((storage as any).addCreditTransaction) {
          await (storage as any).addCreditTransaction({
            userId: user.id,
            amount: 210,
            type: 'trial_grant',
            description: 'Pro Trial credits (14d, $1)',
            stripeSessionId: (session as any).id
          });
        }
      }
    } catch (e) {
      console.error('Error applying $1 pro trial:', e);
    }
  }
  break;
}

        default:
          console.log(`⚠️ Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      console.error(`Error processing webhook event ${event.type}:`, error);
      // Still return 200 to prevent retries for processing errors
    }

    // Return 200 immediately to acknowledge receipt
    res.sendStatus(200);
  }
);

export default router;
