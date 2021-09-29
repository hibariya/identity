const express = require('express');
const app = express();
const { resolve } = require('path');
// Replace if using a different env file or config
const env = require('dotenv').config({ path: './.env' });

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2020-08-27',
  appInfo: { // For sample support and debugging, not required for production:
    name: "stripe-samples/identity/redirect",
    version: "0.0.1",
    url: "https://github.com/stripe-samples"
  }
});

app.use(express.static(process.env.STATIC_DIR));
app.use(
  express.json({
    // We need the raw body to verify webhook signatures.
    // Let's compute it only when hitting the Stripe webhook endpoint.
    verify: function(req, res, buf) {
      if (req.originalUrl.startsWith('/webhook')) {
        req.rawBody = buf.toString();
      }
    }
  })
);

app.get('/', (req, res) => {
  const path = resolve(process.env.STATIC_DIR + '/index.html');
  res.sendFile(path);
});

app.get('/config', (req, res) => {
  res.send({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  });
});

app.post('/create-payment-intent', async (req, res) => {
  const { currency } = req.body;

  // Create a PaymentIntent with the amount, currency, and a payment method type.
  //
  // See the documentation [0] for the full list of supported parameters.
  //
  // [0] https://stripe.com/docs/api/payment_intents/create
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 1999,
      currency: currency,
    });

    // Send publishable key and PaymentIntent details to client
    res.send({
      clientSecret: paymentIntent.client_secret
    });

  } catch(e) {
    return res.status(400).send({
      error: {
        message: e.message
      }
    });
  }
});

// Expose a endpoint as a webhook handler for asynchronous events.
// Configure your webhook in the stripe developer dashboard
// https://dashboard.stripe.com/test/webhooks
app.post('/webhook', async (req, res) => {
  let data, eventType;

  // Check if webhook signing is configured.
  if (process.env.STRIPE_WEBHOOK_SECRET) {
    // Retrieve the event by verifying the signature using the raw body and secret.
    let event;
    let signature = req.headers['stripe-signature'];
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log(`⚠️  Webhook signature verification failed.`);
      return res.sendStatus(400);
    }
    data = event.data;
    eventType = event.type;
  } else {
    // Webhook signing is recommended, but if the secret is not configured in `config.js`,
    // we can retrieve the event data directly from the request body.
    data = req.body.data;
    eventType = req.body.type;
  }
  // Successfully constructed event
  switch (eventType) {
    case 'identity.verification_session.verified': {
      // All the verification checks passed
      const verificationSession = data.object;
      break;
    }
    case 'identity.verification_session.requires_input': {
      // At least one of the verification checks failed
      const verificationSession = data.object;

      console.log('Verification check failed: ' + verificationSession.last_error.reason);

      // Handle specific failure reasons
      switch (verificationSession.last_error.code) {
        case 'document_unverified_other': {
          // The document was invalid
          break;
        }
        case 'document_expired': {
          // The document was expired
          break;
        }
        case 'document_type_not_supported': {
          // document type not supported
          break;
        }
        default: {
          // ...
        }
      }
    }
  }

  res.sendStatus(200);
});

app.listen(4242, () => console.log(`Node server listening at http://localhost:4242`));
