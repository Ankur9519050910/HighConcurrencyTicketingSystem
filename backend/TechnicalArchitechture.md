graph TD
    %% Actors
    User([📱 User / Client])
    
    %% Components
    subgraph "API Gateway (Node.js)"
        Limit{🛡️ Rate Limiter<br/>(10 req/s per IP)}
        LockAPI[POST /api/lock]
        PayAPI[POST /api/pay]
    end

    subgraph "Redis (In-Memory)"
        LuaScript{{📜 Lua Script Execution<br/>(Atomic Check-and-Set)}}
        RedisLock[(Key: seat:A1<br/>TTL: 5 min)]
        RedisReceipt[(Key: receipt:XYZ<br/>TTL: 24h)]
    end

    subgraph "MongoDB (Persistence)"
        MongoTx{⚡ Transaction Start}
        MongoSeat[(Collection: Seats)]
    end

    %% Flow 1: Booking (Locking)
    User -->|1. Click 'Book'| Limit
    Limit --"🚫 Exceeded"--> User429[Response: 429 Too Many Requests]
    Limit --"✅ Allowed"--> LockAPI
    
    LockAPI -->|2. Exec Lua Script| LuaScript
    LuaScript -->|Check 1: Is Sold/Locked?| RedisLock
    
    RedisLock --"❌ Exists"--> LockFail[Return 0]
    LockFail --> LockAPI
    LockAPI --"⛔"--> User409[Response: 409 Seat Unavailable]

    RedisLock --"✅ Empty"--> LockSuccess[Set Key + TTL<br/>Return 1]
    LockSuccess --> LockAPI
    LockAPI --"🎉"--> User200[Response: 200 Locked!]

    %% Flow 2: Payment
    User -->|3. Click 'Pay'| PayAPI
    PayAPI -->|4. Check Idempotency| RedisReceipt
    
    RedisReceipt --"✅ Found"--> ReturnCached[Return Saved Receipt]
    ReturnCached --> UserSuccess[Response: 200 Ticket Confirmed]

    RedisReceipt --"❌ Not Found"--> CheckLock
    CheckLock[5. Validate Lock Owner] -->|Get 'seat:A1'| RedisLock
    
    RedisLock --"❌ Mismatch/Expired"--> PayFail[Response: 400 Lock Invalid]
    
    RedisLock --"✅ Valid Owner"--> MongoTx
    MongoTx -->|6. Update Status| MongoSeat
    MongoSeat -->|Set 'booked'| MongoTx
    
    MongoTx --"✅ Commit"--> RedisCleanup[7. Redis Cleanup]
    RedisCleanup -->|DEL seat:A1| RedisLock
    RedisCleanup -->|SET receipt:XYZ| RedisReceipt
    
    RedisReceipt --> UserSuccess