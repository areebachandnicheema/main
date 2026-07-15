import { Request, Response } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import { env } from '../config/env';
import { pool } from '../config/db';
import { AuthedRequest } from '../middleware/auth';
import { grantCredits } from '../services/credits.service';
import { ApiError } from '../middleware/errorHandler';

const stripe = new Stripe(env.STRIPE_SECRET_KEY);

const PLAN_PRICE_IDS: Record<string, string> = {
  studio: 'price_studio_monthly',
  enterprise: 'price_enterprise_monthly',
};

const PLAN_CREDIT_GRANTS: Record<string, number> = {
  studio: 5000,
  enterprise: 50000,
};

export async function createCheckoutSession(req: AuthedRequest, res: Response) {
  const schema = z.object({ workspaceId: z.string().uuid(), plan: z.enum(['studio', 'enterprise']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(400, 'invalid_body', 'workspaceId and plan are required.');

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: PLAN_PRICE_IDS[parsed.data.plan], quantity: 1 }],
    success_url: `${env.CLIENT_ORIGIN}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.CLIENT_ORIGIN}/billing/cancelled`,
    client_reference_id: parsed.data.workspaceId,
    metadata: { workspaceId: parsed.data.workspaceId, plan: parsed.data.plan },
  });

  res.json({ checkoutUrl: session.url });
}

/**
 * Stripe webhook. Mounted with the raw body parser (see index.ts) because
 * signature verification needs the exact bytes Stripe sent, not the
 * JSON-parsed object.
 */
export async function handleStripeWebhook(req: Request, res: Response) {
  const signature = req.headers['stripe-signature'];
  if (!signature) return res.status(400).send('Missing signature');

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed: ${(err as Error).message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const workspaceId = session.metadata?.workspaceId;
      const plan = session.metadata?.plan;
      if (workspaceId && plan) {
        await pool.query(
          `INSERT INTO subscriptions (workspace_id, plan, stripe_customer_id, stripe_subscription_id, status)
           VALUES ($1, $2, $3, $4, 'active')
           ON CONFLICT (workspace_id) DO UPDATE
           SET plan = EXCLUDED.plan, status = 'active', stripe_subscription_id = EXCLUDED.stripe_subscription_id`,
          [workspaceId, plan, session.customer, session.subscription],
        );
        await grantCredits({ workspaceId, amount: PLAN_CREDIT_GRANTS[plan] ?? 0, reason: 'subscription_start' });
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await pool.query(
        `UPDATE subscriptions SET status = 'cancelled' WHERE stripe_subscription_id = $1`,
        [sub.id],
      );
      break;
    }
    default:
      break;
  }

  res.json({ received: true });
}
