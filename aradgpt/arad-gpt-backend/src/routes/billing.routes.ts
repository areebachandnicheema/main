import { Router, raw } from 'express';
import { requireAuth } from '../middleware/auth';
import { createCheckoutSession, handleStripeWebhook } from '../controllers/billing.controller';
import { asyncHandler } from '../utils/asyncHandler';

export const billingRouter = Router();

billingRouter.post('/checkout', requireAuth, asyncHandler(createCheckoutSession));

// Raw body required for Stripe signature verification — do not apply express.json() to this route.
billingRouter.post('/webhook', raw({ type: 'application/json' }), asyncHandler(handleStripeWebhook));
