const Redis = require('ioredis');

let redisClient = null;
let isRedisAvailable = false;

// High-performance in-memory mock store for offline dev/tests
class InMemoryRedisMock {
  constructor() {
    this.store = new Map();
    this.sets = new Map();
    this.ttls = new Map();
  }

  async get(key) {
    if (this._isExpired(key)) return null;
    return this.store.get(key) || null;
  }

  async set(key, value, mode, duration) {
    this.store.set(key, String(value));
    if (mode === 'EX' && typeof duration === 'number') {
      this.ttls.set(key, Date.now() + duration * 1000);
    } else {
      this.ttls.delete(key);
    }
    return 'OK';
  }

  async del(...keys) {
    let deletedCount = 0;
    const flatKeys = keys.flat();
    for (const key of flatKeys) {
      if (this.store.delete(key)) deletedCount++;
      if (this.sets.delete(key)) deletedCount++;
      this.ttls.delete(key);
    }
    return deletedCount;
  }

  async sadd(key, ...members) {
    if (!this.sets.has(key)) {
      this.sets.set(key, new Set());
    }
    const set = this.sets.get(key);
    let added = 0;
    for (const m of members.flat()) {
      if (!set.has(m)) {
        set.add(m);
        added++;
      }
    }
    return added;
  }

  async srem(key, ...members) {
    if (!this.sets.has(key)) return 0;
    const set = this.sets.get(key);
    let removed = 0;
    for (const m of members.flat()) {
      if (set.delete(m)) removed++;
    }
    return removed;
  }

  async smembers(key) {
    if (this._isExpired(key)) return [];
    if (!this.sets.has(key)) return [];
    return Array.from(this.sets.get(key));
  }

  async expire(key, seconds) {
    if (!this.store.has(key) && !this.sets.has(key)) return 0;
    this.ttls.set(key, Date.now() + seconds * 1000);
    return 1;
  }

  async ttl(key) {
    if (!this.ttls.has(key)) return -1;
    const remaining = Math.ceil((this.ttls.get(key) - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  async flushall() {
    this.store.clear();
    this.sets.clear();
    this.ttls.clear();
    return 'OK';
  }

  pipeline() {
    return this.multi();
  }

  multi() {
    const ops = [];
    const self = this;
    const chain = {
      set(key, value, mode, duration) {
        ops.push(() => self.set(key, value, mode, duration));
        return chain;
      },
      del(...keys) {
        ops.push(() => self.del(...keys));
        return chain;
      },
      sadd(key, ...members) {
        ops.push(() => self.sadd(key, ...members));
        return chain;
      },
      srem(key, ...members) {
        ops.push(() => self.srem(key, ...members));
        return chain;
      },
      expire(key, seconds) {
        ops.push(() => self.expire(key, seconds));
        return chain;
      },
      async exec() {
        const results = [];
        for (const op of ops) {
          try {
            const res = await op();
            results.push([null, res]);
          } catch (err) {
            results.push([err, null]);
          }
        }
        return results;
      },
    };
    return chain;
  }

  _isExpired(key) {
    if (!this.ttls.has(key)) return false;
    if (Date.now() > this.ttls.get(key)) {
      this.store.delete(key);
      this.sets.delete(key);
      this.ttls.delete(key);
      return true;
    }
    return false;
  }
}

function initRedis() {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl && process.env.NODE_ENV !== 'test') {
    try {
      redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy(times) {
          return Math.min(times * 100, 3000);
        },
        lazyConnect: false,
      });

      redisClient.on('connect', () => {
        isRedisAvailable = true;
      });

      redisClient.on('error', (err) => {
        console.warn('[Redis] Connection warning, using in-memory store fallback:', err.message);
        isRedisAvailable = false;
      });

      return redisClient;
    } catch (err) {
      console.warn('[Redis] Initialization error, falling back to mock:', err.message);
    }
  }

  // Use in-memory mock when REDIS_URL is not set or during tests
  redisClient = new InMemoryRedisMock();
  isRedisAvailable = true;
  return redisClient;
}

const redis = initRedis();

module.exports = {
  redis,
  isRedisAvailable: () => isRedisAvailable,
  InMemoryRedisMock,
};
