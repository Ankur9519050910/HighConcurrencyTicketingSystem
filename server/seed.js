const mongoose = require('mongoose');
const Seat = require('./models/Seat');
const { createClient } = require('redis');

// CONFIG
require('dotenv').config();
const MONGO_URI = process.env.MONGO_URI;
const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const COLS = 10;

const seedDB = async () => {
  try {
    // Connect
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const redisClient = createClient();
    redisClient.on('error', err => console.error('Redis Client Error', err));
    await redisClient.connect();
    console.log('Connected to Redis');
    
    // Delete old datas and indexes
    console.log('Deleting old collections');
    try {
        await Seat.collection.drop(); 
    } catch (e) {
        if (e.code === 26) console.log('   (Collection was already empty)');
        else console.log('   (Note on drop:', e.message, ')');
    }

    await redisClient.flushAll(); // Clear Redis cache

    // Generate Seats
    console.log('Generating new seats...');
    const seats = [];
    ROWS.forEach(row => {
      let tier = 'standard';
      let price = 5000;
      if (['A', 'B'].includes(row)) { tier = 'vip'; price = 12000; }
      else if (['C', 'D', 'E', 'F'].includes(row)) { tier = 'premium'; price = 8000; }

      for (let i = 1; i <= COLS; i++) {
        seats.push({
          seatId: `${row}${i}`,
          row: row,
          number: i,
          tier: tier,
          price: price,
          status: 'available'
        });
      }
    });

    // Insert to Mongo
    await Seat.insertMany(seats);
    console.log(`Seats Built! Created ${seats.length} seats in MongoDB.`);
    
    process.exit();
  } catch (err) {
    console.error('SEED ERROR:', err);
    process.exit(1);
  }
};


seedDB();

