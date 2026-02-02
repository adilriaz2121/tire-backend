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
  
  // Format order items for email - Desktop table view
  const itemsTableHtml = orderItems.map((item, index) => `
    <tr>
      <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; vertical-align: top; color: #000000; font-size: 14px;">${index + 1}</td>
      <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; vertical-align: top;">
        <div style="font-weight: 600; color: #000000; margin-bottom: 4px; font-size: 14px;">${item.productName || 'Product'}</div>
        ${item.productSize ? `<div style="font-size: 13px; color: #000000;">Size: ${item.productSize}</div>` : ''}
        ${item.productBrand ? `<div style="font-size: 13px; color: #000000;">Brand: ${item.productBrand}</div>` : ''}
      </td>
      <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; text-align: center; vertical-align: top; color: #000000; font-size: 14px;">${item.productQuantity || 1}</td>
      <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; text-align: right; vertical-align: top; white-space: nowrap; color: #000000; font-size: 14px;">$${Number(item.productPrice || 0).toFixed(2)}</td>
      <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; text-align: right; vertical-align: top; white-space: nowrap; font-weight: 600; color: #000000; font-size: 14px;">$${Number(item.productTotal || 0).toFixed(2)}</td>
    </tr>
  `).join('');

  // Format order items for mobile - Card view
  const itemsCardHtml = orderItems.map((item, index) => `
    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
        <div style="flex: 1;">
          <div style="font-weight: 600; color: #000000; font-size: 15px; margin-bottom: 6px;">${item.productName || 'Product'}</div>
          ${item.productSize ? `<div style="font-size: 13px; color: #000000; margin-bottom: 4px;">Size: ${item.productSize}</div>` : ''}
          ${item.productBrand ? `<div style="font-size: 13px; color: #000000;">Brand: ${item.productBrand}</div>` : ''}
        </div>
        <div style="text-align: right; margin-left: 12px;">
          <div style="font-weight: 600; color: #000000; font-size: 16px;">$${Number(item.productTotal || 0).toFixed(2)}</div>
        </div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 12px; border-top: 1px solid #e2e8f0;">
        <div style="color: #000000; font-size: 13px;">
          <span style="font-weight: 500;">Quantity:</span> ${item.productQuantity || 1}
        </div>
        <div style="color: #000000; font-size: 13px;">
          <span style="font-weight: 500;">Unit Price:</span> $${Number(item.productPrice || 0).toFixed(2)}
        </div>
      </div>
    </div>
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
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <title>Order Confirmation</title>
      <style>
        @media only screen and (max-width: 600px) {
          .desktop-table { display: none !important; }
          .mobile-cards { display: block !important; }
          .container { padding: 16px !important; max-width: 100% !important; }
          .content-box { padding: 20px 16px !important; }
          .header-box { padding: 24px 16px !important; }
          .header-title { font-size: 24px !important; }
          .header-text { font-size: 14px !important; }
          .section-title { font-size: 18px !important; }
          .text-responsive { font-size: 14px !important; }
        }
        @media only screen and (min-width: 601px) {
          .desktop-table { display: table !important; }
          .mobile-cards { display: none !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #000000; background-color: #f1f5f9;">
      <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f1f5f9;">
        <tr>
          <td align="center" style="padding: 20px 0;">
            <div class="container" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
              
              <!-- Header -->
              <div class="header-box" style="background: #f1f5f9; padding: 32px 30px; text-align: center; border-bottom: 1px solid #e2e8f0;">
                <h1 class="header-title" style="color: #000000; margin: 0; font-size: 28px; font-weight: 700;">Order Confirmed</h1>
                <p class="header-text" style="color: #000000; margin: 8px 0 0; font-size: 16px; font-weight: 400;">Thank you for your purchase</p>
              </div>
              
              <!-- Content -->
              <div class="content-box" style="padding: 32px 30px;">
                <p class="text-responsive" style="font-size: 16px; color: #000000; margin: 0 0 20px; line-height: 1.6;">
                  Dear <strong>${customerName || 'Valued Customer'}</strong>,
                </p>
                
                <p class="text-responsive" style="font-size: 16px; color: #000000; margin: 0 0 28px; line-height: 1.6;">
                  We're pleased to confirm that your payment has been processed successfully. Your order is being prepared and will be shipped soon.
                </p>
                
                <!-- Order Details Card -->
                <div style="background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 0 0 28px;">
                  <h2 class="section-title" style="color: #000000; margin: 0 0 16px; font-size: 20px; font-weight: 700;">Order Details</h2>
                  <table role="presentation" style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 8px 0; color: #000000; font-size: 15px;"><strong>Order ID:</strong></td>
                      <td style="padding: 8px 0; text-align: right; color: #000000; font-size: 15px; font-weight: 600; font-family: monospace;">${orderId}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #000000; font-size: 15px;"><strong>Total Amount:</strong></td>
                      <td style="padding: 8px 0; text-align: right; color: #000000; font-size: 18px; font-weight: 700;">$${Number(totalAmount).toFixed(2)}</td>
                    </tr>
                  </table>
                </div>
                
                <!-- Order Items - Desktop Table -->
                <div style="margin: 0 0 28px;">
                  <h2 class="section-title" style="color: #000000; font-size: 20px; font-weight: 700; margin: 0 0 16px;">Order Items</h2>
                  
                  <!-- Desktop Table View -->
                  <table class="desktop-table" role="presentation" style="width: 100%; border-collapse: collapse; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                    <thead>
                      <tr style="background: #f1f5f9;">
                        <th style="padding: 12px 14px; text-align: left; border-bottom: 1px solid #e2e8f0; color: #000000; font-size: 12px; font-weight: 600; text-transform: uppercase;">#</th>
                        <th style="padding: 12px 14px; text-align: left; border-bottom: 1px solid #e2e8f0; color: #000000; font-size: 12px; font-weight: 600; text-transform: uppercase;">Product</th>
                        <th style="padding: 12px 14px; text-align: center; border-bottom: 1px solid #e2e8f0; color: #000000; font-size: 12px; font-weight: 600; text-transform: uppercase;">Qty</th>
                        <th style="padding: 12px 14px; text-align: right; border-bottom: 1px solid #e2e8f0; color: #000000; font-size: 12px; font-weight: 600; text-transform: uppercase;">Price</th>
                        <th style="padding: 12px 14px; text-align: right; border-bottom: 1px solid #e2e8f0; color: #000000; font-size: 12px; font-weight: 600; text-transform: uppercase;">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${itemsTableHtml}
                    </tbody>
                    <tfoot>
                      <tr style="background: #f1f5f9;">
                        <td colspan="4" style="padding: 14px; text-align: right; font-weight: 700; font-size: 15px; color: #000000; border-top: 1px solid #e2e8f0;">Total:</td>
                        <td style="padding: 14px; text-align: right; font-weight: 700; font-size: 16px; color: #000000; border-top: 1px solid #e2e8f0;">$${Number(totalAmount).toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  
                  <!-- Mobile Card View -->
                  <div class="mobile-cards" style="display: none;">
                    ${itemsCardHtml}
                    <div style="background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-top: 12px;">
                      <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 700; font-size: 16px; color: #000000;">Total:</span>
                        <span style="font-weight: 700; font-size: 18px; color: #000000;">$${Number(totalAmount).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                ${shippingAddress ? `
                  <!-- Shipping Address -->
                  <div style="background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 0 0 28px;">
                    <h2 class="section-title" style="color: #000000; margin: 0 0 12px; font-size: 20px; font-weight: 700;">Shipping Address</h2>
                    <p class="text-responsive" style="margin: 0; color: #000000; font-size: 15px; line-height: 1.6;">${shippingAddress}</p>
                  </div>
                ` : ''}
                
                <!-- Receipt Notice -->
                <div style="background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 0 0 28px;">
                  <p class="text-responsive" style="margin: 0; font-size: 15px; color: #000000; line-height: 1.6;">
                    <strong style="display: block; margin-bottom: 6px;">Receipt Available</strong>
                    Download your official receipt from Stripe using the button below.
                  </p>
                </div>
                
                <!-- CTA Button -->
                <div style="text-align: center; margin: 0 0 28px;">
                  <a href="${stripeReceiptUrl}" 
                     style="display: inline-block; background: #000000; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">
                    Download Receipt
                  </a>
                </div>
                
                <!-- Footer Message -->
                <div style="border-top: 1px solid #e2e8f0; padding-top: 20px;">
                  <p class="text-responsive" style="font-size: 15px; color: #000000; margin: 0 0 12px; line-height: 1.6;">
                    If you have any questions about your order, please don't hesitate to contact our support team.
                  </p>
                  
                  <p class="text-responsive" style="font-size: 15px; color: #000000; margin: 0; line-height: 1.6;">
                    Best regards,<br>
                    <strong>The Tire Deal Team</strong>
                  </p>
                </div>
              </div>
              
              <!-- Footer -->
              <div style="background: #f1f5f9; border-top: 1px solid #e2e8f0; padding: 20px 30px; text-align: center;">
                <p class="text-responsive" style="margin: 0; color: #000000; font-size: 13px; line-height: 1.6;">
                  This is an automated email. Please do not reply to this message.<br>
                  © ${new Date().getFullYear()} Tire Deal. All rights reserved.
                </p>
              </div>
            </div>
          </td>
        </tr>
      </table>
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

export const sendOrderStatusUpdateEmail = async ({
  to,
  customerName,
  orderId,
  status,
  orderItems = [],
  shippingInfo = {},
}) => {
  const transporter = createTransporter();
  
  if (!transporter) {
    console.error('Cannot send email: Email transporter not configured');
    return { success: false, error: 'Email service not configured' };
  }

  const statusMessages = {
    shipped: {
      title: 'Your Order Has Been Shipped',
      message: 'Great news! Your order has been shipped and is on its way to you.',
    },
    delivered: {
      title: 'Your Order Has Been Delivered',
      message: 'Your order has been successfully delivered. Thank you for your purchase!',
    },
    cancelled: {
      title: 'Order Cancellation Notice',
      message: 'We regret to inform you that your order has been cancelled. If you have any questions, please contact our support team.',
    },
    confirmed: {
      title: 'Order Confirmation Update',
      message: 'Your order has been confirmed and is being prepared for shipment.',
    },
  };

  const statusInfo = statusMessages[status] || statusMessages.confirmed;

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
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <title>Order Status Update</title>
      <style>
        @media only screen and (max-width: 600px) {
          .container { padding: 16px !important; max-width: 100% !important; }
          .content-box { padding: 20px 16px !important; }
          .header-box { padding: 24px 16px !important; }
          .header-title { font-size: 24px !important; }
          .header-text { font-size: 14px !important; }
          .section-title { font-size: 18px !important; }
          .text-responsive { font-size: 14px !important; }
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #000000; background-color: #f1f5f9;">
      <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f1f5f9;">
        <tr>
          <td align="center" style="padding: 20px 0;">
            <div class="container" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
              
              <!-- Header -->
              <div class="header-box" style="background: #f1f5f9; padding: 32px 30px; text-align: center; border-bottom: 1px solid #e2e8f0;">
                <h1 class="header-title" style="color: #000000; margin: 0; font-size: 28px; font-weight: 700;">${statusInfo.title}</h1>
                <p class="header-text" style="color: #000000; margin: 8px 0 0; font-size: 16px; font-weight: 400;">Order #${orderId}</p>
              </div>
              
              <!-- Content -->
              <div class="content-box" style="padding: 32px 30px;">
                <p class="text-responsive" style="font-size: 16px; color: #000000; margin: 0 0 20px; line-height: 1.6;">
                  Dear <strong>${customerName || 'Valued Customer'}</strong>,
                </p>
                
                <p class="text-responsive" style="font-size: 16px; color: #000000; margin: 0 0 28px; line-height: 1.6;">
                  ${statusInfo.message}
                </p>
                
                <!-- Order Details Card -->
                <div style="background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 0 0 28px;">
                  <h2 class="section-title" style="color: #000000; margin: 0 0 16px; font-size: 20px; font-weight: 700;">Order Details</h2>
                  <table role="presentation" style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 8px 0; color: #000000; font-size: 15px;"><strong>Order ID:</strong></td>
                      <td style="padding: 8px 0; text-align: right; color: #000000; font-size: 15px; font-weight: 600; font-family: monospace;">${orderId}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #000000; font-size: 15px;"><strong>Status:</strong></td>
                      <td style="padding: 8px 0; text-align: right; color: #000000; font-size: 15px; font-weight: 600; text-transform: capitalize;">${status}</td>
                    </tr>
                  </table>
                </div>
                
                ${orderItems && orderItems.length > 0 ? `
                  <!-- Order Items -->
                  <div style="margin: 0 0 28px;">
                    <h2 class="section-title" style="color: #000000; font-size: 20px; font-weight: 700; margin: 0 0 16px;">Order Items</h2>
                    <div style="background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px;">
                      ${orderItems.map((item, index) => `
                        <div style="padding: 12px 0; ${index < orderItems.length - 1 ? 'border-bottom: 1px solid #e2e8f0;' : ''}">
                          <div style="font-weight: 600; color: #000000; font-size: 15px; margin-bottom: 4px;">${item.productName || 'Product'}</div>
                          ${item.productSize ? `<div style="font-size: 13px; color: #000000;">Size: ${item.productSize}</div>` : ''}
                          ${item.productBrand ? `<div style="font-size: 13px; color: #000000;">Brand: ${item.productBrand}</div>` : ''}
                          <div style="margin-top: 8px; font-size: 14px; color: #000000;">
                            Quantity: ${item.productQuantity || 1} × $${Number(item.productPrice || 0).toFixed(2)} = $${Number(item.productTotal || 0).toFixed(2)}
                          </div>
                        </div>
                      `).join('')}
                    </div>
                  </div>
                ` : ''}
                
                ${shippingAddress ? `
                  <!-- Shipping Address -->
                  <div style="background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 0 0 28px;">
                    <h2 class="section-title" style="color: #000000; margin: 0 0 12px; font-size: 20px; font-weight: 700;">Shipping Address</h2>
                    <p class="text-responsive" style="margin: 0; color: #000000; font-size: 15px; line-height: 1.6;">${shippingAddress}</p>
                  </div>
                ` : ''}
                
                <!-- Footer Message -->
                <div style="border-top: 1px solid #e2e8f0; padding-top: 20px;">
                  <p class="text-responsive" style="font-size: 15px; color: #000000; margin: 0 0 12px; line-height: 1.6;">
                    If you have any questions about your order, please don't hesitate to contact our support team.
                  </p>
                  
                  <p class="text-responsive" style="font-size: 15px; color: #000000; margin: 0; line-height: 1.6;">
                    Best regards,<br>
                    <strong>The Tire Deal Team</strong>
                  </p>
                </div>
              </div>
              
              <!-- Footer -->
              <div style="background: #f1f5f9; border-top: 1px solid #e2e8f0; padding: 20px 30px; text-align: center;">
                <p class="text-responsive" style="margin: 0; color: #000000; font-size: 13px; line-height: 1.6;">
                  This is an automated email. Please do not reply to this message.<br>
                  © ${new Date().getFullYear()} Tire Deal. All rights reserved.
                </p>
              </div>
            </div>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const textContent = `
Order Status Update

Dear ${customerName || 'Valued Customer'},

${statusInfo.message}

Order Details:
- Order ID: ${orderId}
- Status: ${status}

${orderItems && orderItems.length > 0 ? `
Order Items:
${orderItems.map((item, index) => 
  `${index + 1}. ${item.productName || 'Product'} - Quantity: ${item.productQuantity || 1} - Price: $${Number(item.productPrice || 0).toFixed(2)} - Total: $${Number(item.productTotal || 0).toFixed(2)}`
).join('\n')}
` : ''}

${shippingAddress ? `Shipping Address: ${shippingAddress}` : ''}

If you have any questions about your order, please don't hesitate to contact our support team.

Best regards,
Tire Deal Team
  `;

  try {
    const info = await transporter.sendMail({
      from: `"Tire Deal" <${process.env.MAIL_USER}>`,
      to: to,
      subject: `${statusInfo.title} - Order #${orderId}`,
      text: textContent,
      html: htmlContent,
    });

    console.log('Order status update email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending order status update email:', error);
    return { success: false, error: error.message };
  }
};

const FEEDBACK_RECIPIENT = 'saifarshad3344@gmail.com';

export const sendFeedbackEmail = async ({ name, email, subject = 'Product feedback', message }) => {
  const transporter = createTransporter();

  if (!transporter) {
    console.error('Cannot send feedback email: Email transporter not configured');
    return { success: false, error: 'Email service not configured' };
  }

  const subjectLine = String(subject || 'Product feedback').trim() || 'Product feedback';
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Feedback from Tire Deal</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #000000; background-color: #f1f5f9;">
      <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f1f5f9;">
        <tr>
          <td align="center" style="padding: 20px 0;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);">
              <div style="background: #f1f5f9; padding: 24px 24px; border-bottom: 1px solid #e2e8f0;">
                <h1 style="color: #000000; margin: 0; font-size: 22px; font-weight: 700;">New feedback</h1>
                <p style="color: #000000; margin: 8px 0 0; font-size: 14px;">Tire Deal website</p>
              </div>
              <div style="padding: 24px;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #000000; font-size: 14px;"><strong>From:</strong></td>
                    <td style="padding: 8px 0; color: #000000; font-size: 14px;">${escapeHtml(name)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #000000; font-size: 14px;"><strong>Email:</strong></td>
                    <td style="padding: 8px 0; color: #000000; font-size: 14px;">${escapeHtml(email)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #000000; font-size: 14px;"><strong>Subject:</strong></td>
                    <td style="padding: 8px 0; color: #000000; font-size: 14px;">${escapeHtml(subjectLine)}</td>
                  </tr>
                </table>
                <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                  <p style="margin: 0 0 8px; font-size: 14px; font-weight: 600; color: #000000;">Message:</p>
                  <p style="margin: 0; font-size: 15px; color: #000000; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(message)}</p>
                </div>
              </div>
              <div style="background: #f1f5f9; border-top: 1px solid #e2e8f0; padding: 16px 24px; text-align: center;">
                <p style="margin: 0; color: #000000; font-size: 12px;">Sent at ${new Date().toISOString()}</p>
              </div>
            </div>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const textContent = `
New feedback – Tire Deal

From: ${name}
Email: ${email}
Subject: ${subjectLine}

Message:
${message}

---
Sent at ${new Date().toISOString()}
  `.trim();

  try {
    const info = await transporter.sendMail({
      from: `"Tire Deal" <${process.env.MAIL_USER}>`,
      to: FEEDBACK_RECIPIENT,
      replyTo: email,
      subject: `[Tire Deal Feedback] ${subjectLine} – from ${name}`,
      text: textContent,
      html: htmlContent,
    });

    console.log('Feedback email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending feedback email:', error);
    return { success: false, error: error.message };
  }
};

function escapeHtml(str) {
  if (str == null) return '';
  const s = String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
