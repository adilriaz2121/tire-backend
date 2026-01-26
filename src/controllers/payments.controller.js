import Stripe from 'stripe';
import { sendOrderConfirmationEmail } from '../utils/email.service.js';



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
		const discount = pricingInfo?.discount;
		const couponCode = pricingInfo?.couponCode;
		const shippingPrice = pricingInfo?.shippingPrice;

		const metadata = {};
		metadata.isCouponApplied = String(isCouponApplied);
		if (totalPrice !== undefined) metadata.totalPrice = String(totalPrice);
		if (discountedPrice !== undefined) metadata.discountedPrice = String(discountedPrice);
		if (discount !== undefined) metadata.discount = String(discount);
		if (couponCode) metadata.couponCode = String(couponCode);
		if (shippingPrice !== undefined) metadata.shippingPrice = String(shippingPrice);
		if (Array.isArray(productInfo) && productInfo.length > 0) {
			try { metadata.products = productInfo.map(p => `${p.productId}:${p.quantity}`).join(','); } catch { }
		}

		// Validate required fields
		if (!email) {
			return res.status(400).json({ error: 'Email is required in userInfo' });
		}
		if (!name) {
			return res.status(400).json({ error: 'Name is required in userInfo' });
		}
		if (!Array.isArray(productInfo) || productInfo.length === 0) {
			return res.status(400).json({ error: 'productInfo array is required with at least one product' });
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
		if (!process.env.STRIPE_SECRET_KEY) {
			return res.status(500).json({ error: 'Stripe secret key not configured' });
		}
		if (!sig) {
			return res.status(400).send('Missing stripe-signature header');
		}

		const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);

		if (event.type === 'payment_intent.succeeded') {
			const pi = event.data.object;
			console.log('Payment succeeded:', pi.id);

			// Attempt to parse description back into structured payload
			let expanded = {};
			try {
				expanded = pi.description ? JSON.parse(pi.description) : {};
			} catch (error) {
				console.error('Failed to parse payment intent description:', error);
			}
			console.log("🚀 ~ stripeWebhook ~ expanded:", expanded)

			// Persist order using Prisma
			// Import Prisma lazily to avoid circular deps; use dynamic import
			const { PrismaClient } = await import('@prisma/client');
			const prisma = new PrismaClient();

			const userInfo = expanded.userInfo || {};
			const shippingInfo = expanded.shippingInfo || {};
			const pricingInfo = expanded.pricingInfo || {};
			const productInfo = Array.isArray(expanded.productInfo) ? expanded.productInfo : [];

			const totalAmount = Number(pi.amount_received) / 100;

			// Map shipping location from metadata or default
			let shippingLocation = 'MobileInstaller'; // default
			if (shippingInfo?.shippingLocation) {
				const loc = shippingInfo.shippingLocation;
				if (['MobileInstaller', 'LocalInstaller', 'ShipToMe', 'FedExPickup'].includes(loc)) {
					shippingLocation = loc;
				}
			}

			try {
				// Extract discount and coupon code from pricing info
				const discount = pricingInfo?.discount ? Number(pricingInfo.discount) : null;
				const couponCode = pricingInfo?.couponCode ? String(pricingInfo.couponCode).trim().toUpperCase() : null;

				// Increment coupon usage count if coupon was applied
				if (couponCode) {
					try {
						await prisma.coupons.updateMany({
							where: { code: couponCode },
							data: {
								usedCount: { increment: 1 }
							}
						});
						console.log(`Coupon ${couponCode} usage count incremented`);
					} catch (couponError) {
						console.error('Failed to increment coupon usage count:', couponError);
						// Don't fail the order creation if coupon update fails
					}
				}

				// Create order with order items
				const order = await prisma.orders.create({
					data: {
						userName: String(userInfo.name || userInfo.userName || ''),
						email: String(userInfo.email || ''),
						phone: String(userInfo.phone || ''),
						totalAmount,
						address: String(shippingInfo.address || ''),
						city: String(shippingInfo.city || ''),
						state: String(shippingInfo.state || ''),
						zip: String(shippingInfo.zip || ''),
						country: String(shippingInfo.country || 'US'),
						shippingLocation,
						discount: discount && discount > 0 ? discount : null,
						couponCode: couponCode || null,
						orderItems: {
							create: productInfo.map((p) => ({
								productName: String(p.productName || p.name || p.title || ''),
								productPrice: Number(p.price || p.productPrice || 0),
								productQuantity: Number(p.quantity || 1),
								productTotal: Number((p.price || p.productPrice || 0) * (p.quantity || 1)),
								productImage: String(p.image || p.productImage || ''),
								productBrand: String(p.brand || p.productBrand || ''),
								productModel: String(p.model || p.productModel || ''),
								productYear: String(p.year || p.productYear || ''),
								productTrim: String(p.trim || p.productTrim || ''),
								productSize: String(p.size || p.productSize || ''),
								productMfg: String(p.mfg || p.productMfg || p.brand || ''),
								productDescription: String(p.description || p.productDescription || '')
							}))
						}
					},
					include: {
						orderItems: true
					}
				});
				console.log('Order created successfully:', order.id);

				// Send order confirmation email with receipt
				if (userInfo.email) {
					try {
						const emailResult = await sendOrderConfirmationEmail({
							to: userInfo.email,
							customerName: userInfo.name || userInfo.userName || 'Valued Customer',
							orderId: order.id,
							paymentIntentId: pi.id,
							totalAmount,
							orderItems: order.orderItems,
							shippingInfo: {
								address: shippingInfo.address,
								city: shippingInfo.city,
								state: shippingInfo.state,
								zip: shippingInfo.zip,
								country: shippingInfo.country || 'US',
							},
						});

						if (emailResult.success) {
							console.log('Order confirmation email sent successfully:', emailResult.messageId);
						} else {
							console.error('Failed to send order confirmation email:', emailResult.error);
							// Don't fail the webhook if email fails, just log it
						}
					} catch (emailError) {
						console.error('Error sending order confirmation email:', emailError);
						// Don't fail the webhook if email fails, just log it
					}
				}
			} catch (dbError) {
				console.error('Failed to create order:', dbError);
				return res.status(500).json({ error: 'Failed to create order' });
			} finally {
				await prisma.$disconnect();
			}
		} else {
			console.log('Unhandled event type:', event.type);
		}

		return res.json({ received: true });
	} catch (err) {
		return res.status(400).send(`Webhook Error: ${err.message}`);
	}
};


