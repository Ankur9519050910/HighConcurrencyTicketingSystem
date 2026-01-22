
## Technical Workflow Architecture

The core of TicketS is a **Hybrid Locking Engine** that decouples high-speed concurrency controls from durable data storage.

### The Master Flowchart
This diagram represents the exact lifecycle of a request in our system.

```mermaid
graph TD
    %% Actors
    User([User / Client])
    
    %% Components
    subgraph "Layer 1: The Shield (Node.js)"
        Limit{Anti-Bot Rate Limiter<br/>Header-Based Detection}
        LockAPI[POST /api/lock]
        PayAPI[POST /api/pay]
    end

    subgraph "Layer 2: The Hot Path (Redis RAM)"
        LuaScript{{Lua Script Execution<br/>Atomic Check-and-Set}}
        RedisLock[(Key: seat:A1<br/>TTL: 300s)]
        RedisReceipt[(Key: receipt:XYZ<br/>TTL: 24h)]
    end

    subgraph "Layer 3: The Cold Path (MongoDB Disk)"
        MongoTx{Transaction Start}
        MongoSeat[(Collection: Seats)]
    end

    %% Flow 1: Booking (Locking)
    User -->|1. Click 'Book'| Limit
    Limit --"Bot Detected"--> User429[Response: 429 Too Many Requests]
    Limit --"Clean Traffic"--> LockAPI
    
    LockAPI -->|2. Exec Lua Script| LuaScript
    LuaScript -->|Check: Is Sold OR Locked?| RedisLock
    
    RedisLock --"Exists (Collision)"--> LockFail[Return 0]
    LockFail --> LockAPI
    LockAPI --Unavailable--> User409[Response: 409 Seat Unavailable]

    RedisLock --"Empty (Winner)"--> LockSuccess[Set Key + TTL<br/>Return 1]
    LockSuccess --> LockAPI
    LockAPI --available--> User200[Response: 200 Locked! Timer Starts]

    %% Flow 2: Payment
    User -->|3. Click 'Pay'| PayAPI
    PayAPI -->|4. Check Idempotency| RedisReceipt
    
    RedisReceipt --"Receipt Found"--> ReturnCached[Return Saved Receipt]
    ReturnCached --> UserSuccess[Response: 200 Ticket Confirmed]

    RedisReceipt --"New Transaction"--> CheckLock
    CheckLock[5. Validate Lock Owner] -->|Get 'seat:A1'| RedisLock
    
    RedisLock --"Mismatch/Expired"--> PayFail[Response: 400 Lock Invalid]
    
    RedisLock --"Valid Owner"--> MongoTx
    MongoTx -->|6. Update Status| MongoSeat
    MongoSeat -->|Set 'booked'| MongoTx
    
    MongoTx --"Commit"--> RedisCleanup[7. Redis Cleanup]
    RedisCleanup -->|DEL seat:A1| RedisLock
    RedisCleanup -->|SET receipt:XYZ| RedisReceipt
    
    RedisReceipt --> UserSuccess
