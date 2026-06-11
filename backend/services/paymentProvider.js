// services/paymentProvider.js — salary disbursement gateway.
//
// Stripe TEST mode when STRIPE_SECRET_KEY (sk_test_...) is set in env;
// otherwise a built-in simulated provider so the salary module works
// out-of-the-box with zero external accounts. Real money never moves:
// test-mode PaymentIntents are confirmed with Stripe's official test card
// so each payout shows up in the Stripe test dashboard.

const crypto = require('crypto');
const logger = require('../utils/logger');

const stripeKey = process.env.STRIPE_SECRET_KEY;
let stripe = null;
if (stripeKey) {
  try {
    stripe = require('stripe')(stripeKey);
    logger.info('Stripe payment provider initialized (test mode expected)');
  } catch (e) {
    logger.error('Stripe init failed — falling back to simulated payouts', { error: e.message });
  }
}

const providerName = () => (stripe ? 'stripe_test' : 'simulated');

/**
 * Dispatch a single payout. Returns { method, ref, status } where status is
 * 'paid' or 'failed'. Never throws for provider-side declines — the caller
 * records the failure on the ledger instead.
 */
const dispatchPayment = async ({ amount, currency = 'INR', description, metadata = {} }) => {
  if (stripe) {
    try {
      const intent = await stripe.paymentIntents.create({
        amount: Math.round(Number(amount) * 100), // smallest currency unit
        currency: String(currency).toLowerCase(),
        description,
        metadata,
        payment_method: 'pm_card_visa', // Stripe's official test payment method
        confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      });
      return {
        method: 'stripe_test',
        ref: intent.id,
        status: intent.status === 'succeeded' ? 'paid' : 'failed',
      };
    } catch (e) {
      logger.warn('Stripe payout failed', { error: e.message });
      return { method: 'stripe_test', ref: null, status: 'failed', error: e.message };
    }
  }

  // Simulated provider — instant success with a traceable reference
  return { method: 'simulated', ref: `sim_${crypto.randomUUID()}`, status: 'paid' };
};

module.exports = { dispatchPayment, providerName };
