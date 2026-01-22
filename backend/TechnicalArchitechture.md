# 🏛️ Technical Workflow Architecture

> **System:** FlashSeat High-Frequency Engine
> **Goal:** Handle 100,000 requests/second with Zero Overbooking.

This document outlines the lifecycle of a single booking request, detailing how **Redis (In-Memory)** and **MongoDB (Persistence)** interact to guarantee atomicity.

---

## The Master Flowchart

```mermaid
graph TD
    %% Actors
    User([User / Client])
    
    %% Components
    subgraph "Layer 1: The Shield (Node.js)"
        Limit{Anti-Bot Rate Limiter}
        LockAPI[POST /api/lock]
        PayAPI[POST /api/pay]
        SyncAPI[GET /api/seats]
    end

    subgraph "Layer 2: The Hot Path (Redis RAM)"
        LuaScript{{Lua Script Execution}}
        RedisLock[(Key: seat:A1)]
        RedisReceipt[(Key: receipt:XYZ)]
    end

    subgraph "Layer 3: The Cold Path (MongoDB Disk)"
        MongoSeat[(Collection: Seats)]
    end

    %% Flow 0: Live Sync (The New Feature)
    User -.->|0. Poll Every 1s| SyncAPI
    SyncAPI -.->|Fetch Status| RedisLock
    SyncAPI -.->|Fetch Status| MongoSeat
    SyncAPI -.->|Merged State| User

    %% Flow 1: Booking (Locking)
    User -->|1. Click 'Book'| Limit
    Limit --"Clean"--> LockAPI
    
    LockAPI -->|2. Exec Lua Script| LuaScript
    LuaScript -->|Check & Set| RedisLock
    
    RedisLock --"Winner"--> LockSuccess[Return 1]
    LockSuccess --> LockAPI
    LockAPI --"🎉"--> User

    %% Flow 2: Payment
    User -->|3. Click 'Pay'| PayAPI
    PayAPI -->|4. Idempotency Check| RedisReceipt
    RedisReceipt --"New"--> CheckLock[Validate Lock]
    
    CheckLock -->|Valid| RedisLock
    RedisLock -->|Commit| MongoSeat
    
    MongoSeat -->|Cleanup| RedisLock
    RedisLock -->|Cache Receipt| RedisReceipt
    RedisReceipt --> User
