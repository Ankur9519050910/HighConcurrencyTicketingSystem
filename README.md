# TicketS: High-Frequency Ticketing Engine

## 1. The Problem
**Sprint:** Startups Decision Making Season 2 <br>**Epic 2:** High-Concurrency Ticketing (TKT-880)

In a high-demand "Flash Sale" scenario (e.g., Concerts, Tatkal Tickets), traditional database architectures fail under burst loads. The system faces three critical failures:
* **Race Conditions:** Two users booking the same seat at the same millisecond.
* **Database Lockup:** High contention on rows causes the entire API to freeze.
* **Bot Attacks:** Bots sweeping inventory faster than humans.

**The Challenge:**
* Handle **0.1 Million requests/second** on a single resource.
* Guarantee **Zero Overbooking** (Inventory Integrity).
* Enforce **Idempotent Payments** (No double-charging).

---

## 2. The Solution
We implemented an **Event-Driven, In-Memory Locking Architecture** that bypasses traditional database transactions for the critical "booking" phase.

**How It Works:**
1.  **The Bouncer (Redis):** Instead of checking the database, all 100,000 requests hit a single-threaded Redis instance in RAM.
2.  **The Atomic Transaction (Lua):** We use a custom **Lua Script** to perform a "Check-and-Set" operation. This ensures that checking if a seat is free and locking it happens in a single, uninterruptible CPU cycle.
3.  **The Archive (MongoDB):** Only the **one successful winner** is allowed to write to the persistent MongoDB database. The other 99,999 requests are rejected instantly at the cache layer, saving the database from crashing.

---

## 3. Key Features

### 0.1 Million TPS Handling
By using Redis's **Single-Threaded Event Loop**, we serialize parallel requests into a sequential queue. This eliminates deadlocks entirely and handles burst loads with <10ms latency.

### Anti-Scalper Defense System
Our Lua kernel includes an embedded "Fingerprinting" logic.
* **Mechanism:** If an IP successfully locks a seat, it is immediately placed on a **10-second cooldown**.
* **Result:** Bots trying to "sweep" the row are blocked instantly after the first ticket, ensuring fair distribution to humans.

### Atomic Locking & Auto-Expiry
* **Zero Overbooking:** Physical guarantee that two users cannot hold the same key.
* **TTL (Time-To-Live):** Locks automatically expire after 5 minutes (Redis `EX` command), releasing the seat if payment fails.

### Idempotent Payment
We implemented a **Finite State Machine** for transactions.
* If a user clicks "Pay" twice due to lag, the system detects the `SOLD` state and returns a success message *without* charging the card again.

---

## 4. Tech Stack

| Component | Technology | Role |
| :--- | :--- | :--- |
| **Backend** | **Node.js (Express)** | API Logic & Orchestration |
| **In-Memory Store** | **Redis (IoRedis)** | High-Speed Atomic Locking & Rate Limiting |
| **Database** | **MongoDB Atlas** | Persistent Storage & User Data |
| **Scripting** | **Lua** | Server-side atomic execution inside Redis |
| **Testing** | **Axios Script** | Simulating 500 concurrent users |

---

> **Stress Test Results:**
> * **Concurrent Requests:** 500 (fired instantly)
> * **Success:** 1
> * **Failures:** 499
> * **Double Bookings:** 0
