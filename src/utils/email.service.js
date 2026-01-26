import nodemailer from 'nodemailer';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
	apiVersion: '2024-06-20',
});

// Create reusable transporter
const createTransporter = () => {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASSWORD) {
    console.warn('Email credentials not configured. Email sending will be disabled.');
    return null;
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASSWORD,
    },
  });
};


export const sendOrderConfirmationEmail = async ({
  to,
  customerName,
  orderId,
  paymentIntentId,
  totalAmount,
  orderItems = [],
  shippingInfo = {},
}) => {
  const transporter = createTransporter();
  
  if (!transporter) {
    console.error('Cannot send email: Email transporter not configured');
    return { success: false, error: 'Email service not configured' };
  }

  // Get Stripe receipt URL from payment intent
  let stripeReceiptUrl = `https://dashboard.stripe.com/test/payments/${paymentIntentId}`;
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    // Try to get the latest charge and its receipt URL
    if (paymentIntent.latest_charge) {
      const charge = await stripe.charges.retrieve(paymentIntent.latest_charge);
      if (charge.receipt_url) {
        stripeReceiptUrl = charge.receipt_url;
      }
    }
  } catch (error) {
    console.warn('Could not retrieve Stripe receipt URL, using dashboard link:', error.message);
  }
  
  // Format order items for email
  const itemsHtml = orderItems.map((item, index) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${index + 1}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.productName || 'Product'}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.productQuantity || 1}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">$${Number(item.productPrice || 0).toFixed(2)}</td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">$${Number(item.productTotal || 0).toFixed(2)}</td>
    </tr>
  `).join('');

  const shippingAddress = [
    shippingInfo.address,
    shippingInfo.city,
    shippingInfo.state,
    shippingInfo.zip,
  ].filter(Boolean).join(', ');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order Confirmation</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Order Confirmation</h1>
      </div>
      
      <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
        <p style="font-size: 16px; margin-bottom: 20px;">
          Dear ${customerName || 'Valued Customer'},
        </p>
        
        <p style="font-size: 16px; margin-bottom: 20px;">
          Thank you for your order! We're excited to confirm that your payment has been processed successfully.
        </p>
        
        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h2 style="color: #16a34a; margin-top: 0; font-size: 20px;">Order Details</h2>
          <p style="margin: 8px 0;"><strong>Order ID:</strong> ${orderId}</p>
          <p style="margin: 8px 0;"><strong>Payment Intent:</strong> ${paymentIntentId}</p>
          <p style="margin: 8px 0;"><strong>Total Amount:</strong> $${Number(totalAmount).toFixed(2)}</p>
        </div>
        
        <h2 style="color: #16a34a; font-size: 20px; margin-top: 30px;">Order Items</h2>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">#</th>
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Product</th>
              <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">Quantity</th>
              <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Price</th>
              <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e5e7eb;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4" style="padding: 12px; text-align: right; font-weight: bold; border-top: 2px solid #e5e7eb;">Total:</td>
              <td style="padding: 12px; text-align: right; font-weight: bold; border-top: 2px solid #e5e7eb;">$${Number(totalAmount).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        
        ${shippingAddress ? `
          <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #16a34a; margin-top: 0; font-size: 20px;">Shipping Address</h2>
            <p style="margin: 0;">${shippingAddress}</p>
          </div>
        ` : ''}
        
        <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0; font-size: 14px;">
            <strong>📧 Receipt Available:</strong> You can download your official receipt from Stripe using the link below.
          </p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${stripeReceiptUrl}" 
             style="display: inline-block; background: #16a34a; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
            Download Receipt from Stripe
          </a>
        </div>
        
        <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
          If you have any questions about your order, please don't hesitate to contact our support team.
        </p>
        
        <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
          Best regards,<br>
          <strong>Tire Deal Team</strong>
        </p>
      </div>
      
      <div style="text-align: center; margin-top: 20px; padding: 20px; color: #6b7280; font-size: 12px;">
        <p style="margin: 0;">This is an automated email. Please do not reply to this message.</p>
      </div>
    </body>
    </html>
  `;

  const textContent = `
Order Confirmation

Dear ${customerName || 'Valued Customer'},

Thank you for your order! We're excited to confirm that your payment has been processed successfully.

Order Details:
- Order ID: ${orderId}
- Payment Intent: ${paymentIntentId}
- Total Amount: $${Number(totalAmount).toFixed(2)}

Order Items:
${orderItems.map((item, index) => 
  `${index + 1}. ${item.productName || 'Product'} - Quantity: ${item.productQuantity || 1} - Price: $${Number(item.productPrice || 0).toFixed(2)} - Total: $${Number(item.productTotal || 0).toFixed(2)}`
).join('\n')}

Total: $${Number(totalAmount).toFixed(2)}

${shippingAddress ? `Shipping Address: ${shippingAddress}` : ''}

Receipt Available: You can download your official receipt from Stripe using this link:
${stripeReceiptUrl}

If you have any questions about your order, please don't hesitate to contact our support team.

Best regards,
Tire Deal Team
  `;

  try {
    const info = await transporter.sendMail({
      from: `"Tire Deal" <${process.env.MAIL_USER}>`,
      to: to,
      subject: `Order Confirmation - Order #${orderId}`,
      text: textContent,
      html: htmlContent,
    });

    console.log('Order confirmation email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending order confirmation email:', error);
    return { success: false, error: error.message };
  }
};
