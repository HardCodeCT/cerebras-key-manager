// ============================================================================
// CEREBRAS API KEY MANAGER - Ready to Deploy
// ============================================================================
// 
// INSTRUCTIONS:
// 1. Replace the placeholder keys below with your real Cerebras API keys
// 2. Get keys from: https://cloud.cerebras.ai/
// 3. Keep this file in: api/cerebras-key.js
// 4. Deploy to Vercel
//
// ============================================================================

// 👇 PASTE YOUR CEREBRAS API KEYS HERE (Get them from https://cloud.cerebras.ai/)
let keysData = {
  keys: [
    {
      key: "REPLACE_WITH_YOUR_FIRST_KEY_HERE",  // 👈 Key 1: Paste your first csk-xxxxx key
      name: "Primary Key",
      active: true,
      dailyTokenLimit: 1000000,
      tokensUsedToday: 0,
      requestsPerMinute: 30,
      tokensPerMinute: 60000,
      currentMinuteRequests: 0,
      currentMinuteTokens: 0,
      lastMinuteReset: new Date().toISOString(),
      lastDayReset: new Date().toISOString()
    },
    {
      key: "REPLACE_WITH_YOUR_SECOND_KEY_HERE",  // 👈 Key 2: Paste your second csk-xxxxx key
      name: "Backup Key 1",
      active: true,
      dailyTokenLimit: 1000000,
      tokensUsedToday: 0,
      requestsPerMinute: 30,
      tokensPerMinute: 60000,
      currentMinuteRequests: 0,
      currentMinuteTokens: 0,
      lastMinuteReset: new Date().toISOString(),
      lastDayReset: new Date().toISOString()
    },
    {
      key: "REPLACE_WITH_YOUR_THIRD_KEY_HERE",  // 👈 Key 3: Paste your third csk-xxxxx key
      name: "Backup Key 2",
      active: true,
      dailyTokenLimit: 1000000,
      tokensUsedToday: 0,
      requestsPerMinute: 30,
      tokensPerMinute: 60000,
      currentMinuteRequests: 0,
      currentMinuteTokens: 0,
      lastMinuteReset: new Date().toISOString(),
      lastDayReset: new Date().toISOString()
    }
    // 💡 TIP: Add 2-3 more keys here for better performance!
    // Just copy the block above and paste it here, then update the key value
  ]
};

// ============================================================================
// SERVER LOGIC - Don't modify below unless you know what you're doing
// ============================================================================

function needsDayReset(lastResetStr) {
  const lastReset = new Date(lastResetStr);
  const now = new Date();
  
  return lastReset.getUTCDate() !== now.getUTCDate() ||
         lastReset.getUTCMonth() !== now.getUTCMonth() ||
         lastReset.getUTCFullYear() !== now.getUTCFullYear();
}

function needsMinuteReset(lastResetStr) {
  const lastReset = new Date(lastResetStr);
  const now = new Date();
  const diffMs = now - lastReset;
  return diffMs >= 60000;
}

function resetKeyCounters(keyObj) {
  const now = new Date().toISOString();
  
  if (needsDayReset(keyObj.lastDayReset)) {
    keyObj.tokensUsedToday = 0;
    keyObj.lastDayReset = now;
  }
  
  if (needsMinuteReset(keyObj.lastMinuteReset)) {
    keyObj.currentMinuteRequests = 0;
    keyObj.currentMinuteTokens = 0;
    keyObj.lastMinuteReset = now;
  }
}

function findAvailableKey() {
  let availableKeys = [];

  for (let keyObj of keysData.keys) {
    if (!keyObj.active) continue;

    resetKeyCounters(keyObj);

    const hasRequestCapacity = keyObj.currentMinuteRequests < keyObj.requestsPerMinute;
    const hasTokenCapacity = keyObj.currentMinuteTokens < keyObj.tokensPerMinute;
    const hasDailyCapacity = keyObj.tokensUsedToday < keyObj.dailyTokenLimit;

    if (hasRequestCapacity && hasTokenCapacity && hasDailyCapacity) {
      availableKeys.push(keyObj);
    }
  }

  if (availableKeys.length === 0) return null;

  availableKeys.sort((a, b) => a.tokensUsedToday - b.tokensUsedToday);
  return availableKeys[0];
}

function findKeyByValue(keyValue) {
  return keysData.keys.find(k => k.key === keyValue);
}

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // ROUTE 1: GET /api/cerebras-key
    if (req.method === 'GET' && !req.query.action) {
      const selectedKey = findAvailableKey();

      if (!selectedKey) {
        let nextResetTime = new Date(Date.UTC(
          new Date().getUTCFullYear(),
          new Date().getUTCMonth(),
          new Date().getUTCDate() + 1,
          0, 0, 0
        ));

        for (let keyObj of keysData.keys) {
          if (!keyObj.active) continue;
          const minuteReset = new Date(keyObj.lastMinuteReset);
          minuteReset.setMinutes(minuteReset.getMinutes() + 1);
          if (minuteReset < nextResetTime) {
            nextResetTime = minuteReset;
          }
        }

        return res.status(503).json({ 
          error: 'All API keys exhausted or rate limited',
          nextResetTime: nextResetTime.toISOString(),
          retryAfter: Math.ceil((nextResetTime - new Date()) / 1000)
        });
      }

      console.log(`Providing key: ${selectedKey.name} - Requests: ${selectedKey.currentMinuteRequests}/30, Daily: ${selectedKey.tokensUsedToday}/1M`);

      return res.status(200).json({
        key: selectedKey.key,
        name: selectedKey.name,
        limits: {
          requestsRemaining: selectedKey.requestsPerMinute - selectedKey.currentMinuteRequests,
          tokensRemainingThisMinute: selectedKey.tokensPerMinute - selectedKey.currentMinuteTokens,
          tokensRemainingToday: selectedKey.dailyTokenLimit - selectedKey.tokensUsedToday
        },
        timestamp: new Date().toISOString()
      });
    }

    // ROUTE 2: POST /api/cerebras-key?action=confirm
    if (req.method === 'POST' && req.query.action === 'confirm') {
      const keyValue = req.query.key || req.body?.key;
      const tokensUsed = parseInt(req.query.tokens || req.body?.tokens || 0);
      
      if (!keyValue) {
        return res.status(400).json({ error: 'Key parameter required' });
      }

      if (tokensUsed <= 0) {
        return res.status(400).json({ error: 'Valid tokens count required' });
      }

      const keyObj = findKeyByValue(keyValue);
      
      if (keyObj) {
        resetKeyCounters(keyObj);
        
        keyObj.currentMinuteRequests++;
        keyObj.currentMinuteTokens += tokensUsed;
        keyObj.tokensUsedToday += tokensUsed;
        
        console.log(`✅ Confirmed: ${keyObj.name} - +${tokensUsed} tokens | Daily: ${keyObj.tokensUsedToday}/1M`);
        
        return res.status(200).json({ 
          success: true,
          message: 'Usage confirmed',
          stats: {
            requestsThisMinute: keyObj.currentMinuteRequests,
            tokensThisMinute: keyObj.currentMinuteTokens,
            tokensToday: keyObj.tokensUsedToday
          }
        });
      }

      return res.status(404).json({ error: 'Key not found' });
    }

    // ROUTE 3: POST /api/cerebras-key?action=failure
    if (req.method === 'POST' && req.query.action === 'failure') {
      const keyValue = req.query.key || req.body?.key;
      const errorType = req.query.errorType || req.body?.errorType || 'rate_limit';
      
      if (!keyValue) {
        return res.status(400).json({ error: 'Key parameter required' });
      }

      const keyObj = findKeyByValue(keyValue);
      
      if (keyObj) {
        if (errorType === 'daily_limit') {
          keyObj.tokensUsedToday = keyObj.dailyTokenLimit;
          console.log(`❌ Daily limit hit: ${keyObj.name}`);
        } else if (errorType === 'rate_limit') {
          keyObj.currentMinuteRequests = keyObj.requestsPerMinute;
          keyObj.currentMinuteTokens = keyObj.tokensPerMinute;
          console.log(`❌ Rate limit hit: ${keyObj.name}`);
        } else {
          keyObj.active = false;
          console.log(`❌ Key failed: ${keyObj.name} - deactivated`);
        }
        
        return res.status(200).json({ 
          success: true,
          message: 'Failure recorded, key rotated',
          willRotate: true
        });
      }

      return res.status(404).json({ error: 'Key not found' });
    }

    // ROUTE 4: GET /api/cerebras-key?action=stats
    if (req.method === 'GET' && req.query.action === 'stats') {
      const stats = keysData.keys.map(k => {
        resetKeyCounters(k);
        return {
          name: k.name,
          active: k.active,
          requestsThisMinute: k.currentMinuteRequests,
          tokensThisMinute: k.currentMinuteTokens,
          tokensToday: k.tokensUsedToday,
          dailyLimit: k.dailyTokenLimit
        };
      });

      return res.status(200).json({ stats });
    }

    return res.status(400).json({ 
      error: 'Invalid request',
      usage: {
        getKey: 'GET /api/cerebras-key',
        confirmUsage: 'POST /api/cerebras-key?action=confirm&key=KEY&tokens=COUNT',
        reportFailure: 'POST /api/cerebras-key?action=failure&key=KEY&errorType=rate_limit',
        getStats: 'GET /api/cerebras-key?action=stats'
      }
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

