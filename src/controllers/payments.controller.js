import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
	apiVersion: '2024-06-20',
});

export const createPaymentIntent = async (req, res, next) => {
	try {
		const {
			amount, // decimal dollars or integer cents; we will normalize to cents integer
			currency = 'usd',
			userInfo = {},
			shippingInfo = {},
			pricingInfo = {},
			productInfo = []
		} = req.body || {};

		if (!process.env.STRIPE_SECRET_KEY) {
			return res.status(500).json({ error: 'Stripe secret key not configured' });
		}

		// Normalize amount to integer cents
		let amountInCents = 0;
		if (typeof amount === 'number') {
			amountInCents = Math.round(amount * 100);
		} else if (typeof amount === 'string' && amount.trim() !== '') {
			const parsed = Number(amount);
			if (!Number.isFinite(parsed)) {
				return res.status(400).json({ error: 'Invalid amount' });
			}
			amountInCents = Math.round(parsed * 100);
		} else {
			return res.status(400).json({ error: 'amount is required' });
		}

		if (!Number.isInteger(amountInCents) || amountInCents <= 0) {
			return res.status(400).json({ error: 'amount must be a positive number' });
		}


		// Build minimal metadata and full expanded data in description for dashboard readability
		const email = userInfo?.email;
		const name = userInfo?.name;
		const phone = userInfo?.phone;
		const address = shippingInfo?.address;
		const city = shippingInfo?.city;
		const state = shippingInfo?.state;
		const zip = shippingInfo?.zip;
		const country = shippingInfo?.country;

		const isCouponApplied = Boolean(pricingInfo?.isCouponApplied);
		const totalPrice = pricingInfo?.totalPrice;
		const discountedPrice = pricingInfo?.discountedPrice;
		const shippingPrice = pricingInfo?.shippingPrice;

		const metadata = {};
		metadata.isCouponApplied = String(isCouponApplied);
		if (totalPrice !== undefined) metadata.totalPrice = String(totalPrice);
		if (discountedPrice !== undefined) metadata.discountedPrice = String(discountedPrice);
		if (shippingPrice !== undefined) metadata.shippingPrice = String(shippingPrice);
		if (Array.isArray(productInfo) && productInfo.length > 0) {
			try { metadata.products = productInfo.map(p => `${p.productId}:${p.quantity}`).join(','); } catch {}
		}

		const paymentIntent = await stripe.paymentIntents.create({
			amount: amountInCents,
			currency: (currency || 'usd').toLowerCase(),
			receipt_email: email || undefined,
			shipping: name || address || city || country ? {
				name: name || undefined,
				phone: phone || undefined,
				address: {
					line1: address || undefined,
					city: city || undefined,
					state: state || undefined,
					postal_code: zip || undefined,
					country: country || undefined
				}
			} : undefined,
			metadata,
			description: (() => {
				try {
					return JSON.stringify({ userInfo, shippingInfo, pricingInfo, productInfo }).slice(0, 5000);
				} catch { return undefined; }
			})(),
			automatic_payment_methods: { enabled: true }
		});

		return res.status(200).json({
			clientSecret: paymentIntent.client_secret,
			paymentIntentId: paymentIntent.id
		});
	} catch (error) {
		return next(error);
	}
};

export const stripeWebhook = async (req, res, next) => {
	try {
		const sig = req.headers['stripe-signature'];
		if (!process.env.STRIPE_WEBHOOK_SECRET) {
			return res.status(500).json({ error: 'Stripe webhook secret not configured' });
		}
		if (!sig) {
			return res.status(400).send('Missing stripe-signature header');
		}

		const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);

		if (event.type === 'payment_intent.succeeded') {
			const pi = event.data.object;
			// Attempt to parse description back into structured payload
			let expanded = {};
			try { expanded = pi.description ? JSON.parse(pi.description) : {}; } catch {}

			// Persist order using Prisma
			// Import Prisma lazily to avoid circular deps; use dynamic import
			const { PrismaClient } = await import('@prisma/client');
			const prisma = new PrismaClient();

			const userInfo = expanded.userInfo || {};
			const shippingInfo = expanded.shippingInfo || {};
			const pricingInfo = expanded.pricingInfo || {};
			const productInfo = Array.isArray(expanded.productInfo) ? expanded.productInfo : [];

			const productIds = productInfo.map(p => String(p.productId));
			const totalAmount = Number(pi.amount_received) / 100;

			await prisma.order.create({
				data: {
					name: String(userInfo.name || ''),
					email: String(userInfo.email || ''),
					phone: String(userInfo.phone || ''),
					totalAmount,
					productIds,
					address: String(shippingInfo.address || ''),
					city: String(shippingInfo.city || ''),
					state: shippingInfo.state ? String(shippingInfo.state) : null,
					zip: shippingInfo.zip ? String(shippingInfo.zip) : null,
					country: String(shippingInfo.country || ''),
					total: Number(pricingInfo.totalPrice ?? totalAmount),
					status: 'delivered',
					paymentIntentId: pi.id,
					currency: String(pi.currency || 'usd'),
					userInfo,
					shippingInfo,
					pricingInfo,
					productInfo
				}
			});
		}

		return res.json({ received: true });
	} catch (err) {
		return res.status(400).send(`Webhook Error: ${err.message}`);
	}
};


