const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const LIPIA_API_KEY = process.env.LIPIA_API_KEY;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper delay to control throughput (30 req/min = 2000ms delay)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Single STK Push Helper
const triggerStkPush = async (phone_number, amount, external_reference) => {
  try {
    const response = await fetch('https://lipia-api.kreativelabske.com/api/v2/payments/stk-push', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LIPIA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        phone_number,
        amount: Number(amount),
        external_reference
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      return {
        phone: phone_number,
        status: 'FAILED',
        error: result.customerMessage || result.message || `HTTP ${response.status}`
      };
    }

    return {
      phone: phone_number,
      status: 'SUCCESS',
      reference: result.data.TransactionReference
    };
  } catch (err) {
    return {
      phone: phone_number,
      status: 'FAILED',
      error: err.message
    };
  }
};

// Bulk Endpoint (Server-Sent Events for Real-Time Logging)
app.post('/api/bulk-stk', async (req, res) => {
  const { phoneNumbers, amount, reference } = req.body;

  if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
    return res.status(400).json({ error: 'Valid phone numbers array required.' });
  }

  // Set headers for Streaming Response to client
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  for (let i = 0; i < phoneNumbers.length; i++) {
    const phone = phoneNumbers[i].trim();
    if (!phone) continue;

    const ref = reference ? `${reference}_${i + 1}` : `bulk_${Date.now()}_${i + 1}`;
    
    // Process request
    const logResult = await triggerStkPush(phone, amount, ref);

    // Stream log entry to frontend
    res.write(`data: ${JSON.stringify(logResult)}\n\n`);

    // Maintain 30 req/min (2-second delay between calls)
    if (i < phoneNumbers.length - 1) {
      await sleep(2000);
    }
  }

  res.write(`data: ${JSON.stringify({ status: 'COMPLETE' })}\n\n`);
  res.end();
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
