import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import productsRouter from './routes/products.js';
import ordersRouter from './routes/orders.js';
import paymentRouter from './routes/payment.js';
import adminRouter from './routes/admin.js';

dotenv.config();
const app = express();

app.use(helmet());
app.use(morgan('dev'));
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));

// Rate-limit checkout & payment endpoints specifically (crude velocity guard
// at the network layer, on top of the ML/rules velocity feature)
const paymentLimiter = rateLimit({ windowMs: 60 * 1000, max: 15 });
app.use('/api/orders/checkout', paymentLimiter);
app.use('/api/payment', paymentLimiter);

// Paystack webhook needs the RAW body for HMAC signature verification -
// must be registered BEFORE express.json() for this specific path.
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'sug-fraud-ecommerce-backend' }));

app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/payment', paymentRouter);
app.use('/api/admin', adminRouter);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
