# Smart Ingest System

## Overview

The smart ingest system leverages existing performance monitoring infrastructure (`diagnostics-commands.js` and `performance.js`) to capture high-value analytics data without duplicating computation work.

## Integration Points

### Existing Performance Systems Used

1. **diagnostics-commands.js**
   - RingBuffer with benchmark history (30 samples)
   - AutoFPS throttling decisions (`setFrameProviderThrottle`)
   - Frame performance sampling (`logFrameBenchmark`)

2. **performance.js** 
   - Device capabilities (`deviceSummary()`)
   - Session error tracking (`addSessionError()`)
   - Health monitoring (`startHealthChecker()`)
   - AutoFPS benchmark data

## Data Captured

### High-Priority Events (for Cloudflare Analytics)

```javascript
// User Actions
'startProcessing' -> {
  category: 'user_action',
  performance: { autoFps, throttle, memory },
  device: { userAgent, cores, memory, screen },
  session: { sessionId, duration }
}

'startCamera' -> {
  category: 'device_init', 
  device: { full device capabilities }
}

// Performance Events  
'setFrameProviderThrottle' -> {
  category: 'performance_auto',
  autoFps: { decision, currentThrottle, fpsMode }
}
```

### Automatic Sampling

- **Performance Samples**: Every 50th frame benchmark (low overhead)
- **Health Reports**: Every 2 minutes if errors > 3 in 5-minute window
- **Error Tracking**: All JS errors and promise rejections

## Benefits

1. **Zero Duplication**: Uses existing benchmark data, device detection, health monitoring
2. **Lightweight**: Only 8 high-value event types, smart sampling
3. **Browser Safe**: "ingest" naming avoids extension conflicts  
4. **Cloudflare Ready**: Structured JSON perfect for analytics pipeline
5. **Console Compatible**: All logs still appear in dev tools and dev panel

## Implementation

The system works by intercepting engine commands and enriching them with context from existing performance systems:

```javascript
const engine = createIngestInterceptor(baseEngine);
setupIngestErrorTracking();
setupIngestHealthReporting(engine);
setupIngestPerformanceSampling(engine);
```

This gives you rich user behavior and performance insights with minimal overhead!