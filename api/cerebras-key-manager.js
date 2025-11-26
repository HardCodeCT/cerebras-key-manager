// Cerebras API Key Manager with Per-Minute Rate Limiting
// Deploy to Vercel at: /api/cerebras-key

let keysData = {
  keys: [
    {
      key: "YOUR_CEREBRAS_API_KEY_1",
      name: "Primary Key",
      active: true,
      
      // Daily limits
      dailyTokenLimit: 1000000,
      tokensUsedToday: 0,
      
      // Per-minute limits
      requestsPerMinute: 30,
      tokensPerMinute: 60000,
      
      // Tracking
      currentMinuteRequests: 0,
      currentMinuteTokens: 0,
      lastMinuteReset: new Date().toISOString(),
      lastDayReset: new Date().toISOString()
    },
    {
      key: "YOUR_CEREBRAS_API_KEY_2",
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
      key: "YOUR_CEREBRAS_API_KEY_3",
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
  ]
};

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
  return diffMs >= 60000; // 60 seconds
}

function resetKeyCounters(keyObj) {
  const now = new Date().toISOString();
  
  // Reset daily counters if needed
  if (needsDayReset(keyObj.lastDayReset)) {
    keyObj.tokensUsedToday = 0;
    keyObj.lastDayReset = now;
  }
  
  // Reset per-minute counters if needed
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

    // Reset counters if needed
    resetKeyCounters(keyObj);

    // Check all limits
    const hasRequestCapacity = keyObj.currentMinuteRequests < keyObj.requestsPerMinute;
    const hasTokenCapacity = keyObj.currentMinuteTokens < keyObj.tokensPerMinute;
    const hasDailyCapacity = keyObj.tokensUsedToday < keyObj.dailyTokenLimit;

    if (hasRequestCapacity && hasTokenCapacity && hasDailyCapacity) {
      availableKeys.push(keyObj);
    }
  }

  if (availableKeys.length === 0) return null;

  // Sort by least used (daily tokens)
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
    // ROUTE 1: GET /api/cerebras-key - Get available key
    if (req.method === 'GET' && !req.query.action) {
      const selectedKey = findAvailableKey();

      if (!selectedKey) {
        // Find when next reset occurs
        let nextResetTime = new Date(Date.UTC(
          new Date().getUTCFullYear(),
          new Date().getUTCMonth(),
          new Date().getUTCDate() + 1,
          0, 0, 0
        ));

        // Check if any key will reset within a minute
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
          retryAfter: Math.ceil((nextResetTime - new Date()) / 1000) // seconds
        });
      }

      console.log(`Providing key: ${selectedKey.name} - Requests: ${selectedKey.currentMinuteRequests}/30, Tokens/min: ${selectedKey.currentMinuteTokens}/60000, Daily: ${selectedKey.tokensUsedToday}/1M`);

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

    // ROUTE 2: POST /api/cerebras-key?action=confirm - Confirm usage
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
        // Reset counters if needed
        resetKeyCounters(keyObj);
        
        // Update counters
        keyObj.currentMinuteRequests++;
        keyObj.currentMinuteTokens += tokensUsed;
        keyObj.tokensUsedToday += tokensUsed;
        
        console.log(`✅ Confirmed: ${keyObj.name} - +${tokensUsed} tokens | Daily: ${keyObj.tokensUsedToday}/1M | Requests/min: ${keyObj.currentMinuteRequests}/30`);
        
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

    // ROUTE 3: POST /api/cerebras-key?action=failure - Report rate limit hit
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
          // Max out current minute limits to force rotation
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

    // ROUTE 4: GET /api/cerebras-key?action=stats - Get overall stats
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

    // Invalid request
    return res.status(400).json({ 
      error: 'Invalid request',
      usage: {
        getKey: 'GET /api/cerebras-key',
        confirmUsage: 'POST /api/cerebras-key?action=confirm&key=KEY&tokens=COUNT',
        reportFailure: 'POST /api/cerebras-key?action=failure&key=KEY&errorType=rate_limit|daily_limit|error',
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