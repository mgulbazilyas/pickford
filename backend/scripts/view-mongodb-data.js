#!/usr/bin/env node

/**
 * MongoDB Data Viewer Script
 * Displays all data from MongoDB collections in the Trakt Proxy application
 *
 * Usage: node scripts/view-mongodb-data.js
 * Environment variables:
 *   MONGODB_URI: MongoDB connection URI (default: mongodb://localhost:27017/trakt-proxy)
 *   MONGODB_DB: Database name (default: trakt-proxy)
 */

require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const { MongoClient } = require('mongodb');

// Configuration
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/trakt-proxy';
const MONGODB_DB = process.env.MONGODB_DB || process.env.MONGO_DB || 'trakt-proxy';

// Collection names and their descriptions
const COLLECTIONS = [
  { name: 'movies', description: 'Cached movie data from Trakt API' },
  { name: 'shows', description: 'Cached TV show data from Trakt API' },
  { name: 'movie_translations', description: 'Movie translations data' },
  { name: 'show_translations', description: 'TV show translations data' },
  { name: 'search_results', description: 'Cached search results' },
  { name: 'lists', description: 'Cached popular/trending lists' },
  { name: 'api_logs', description: 'API request logs' },
  { name: 'users', description: 'User accounts' },
  { name: 'user_sessions', description: 'User authentication sessions' },
  { name: 'movie_comments', description: 'Movie comments and ratings' },
  { name: 'movie_ratings', description: 'Movie ratings (1-10 scale)' },
  { name: 'movie_watchlist', description: 'User movie watchlists' }
];

async function connectToMongoDB() {
  console.log('🔗 Connecting to MongoDB...');
  console.log(`URI: ${MONGODB_URI}`);
  console.log(`Database: ${MONGODB_DB}\n`);

  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(MONGODB_DB);
  return { client, db };
}

async function displayCollectionData(db, collectionName, description) {
  console.log(`📂 ${collectionName.toUpperCase()}`);
  console.log(`   Description: ${description}`);

  try {
    const collection = db.collection(collectionName);
    const count = await collection.countDocuments();
    console.log(`   Total documents: ${count}`);

    if (count === 0) {
      console.log('   Status: Empty collection\n');
      return;
    }

    // Get sample documents (first 5)
    const sampleDocs = await collection.find({}).limit(5).toArray();

    console.log('   Sample documents:');
    sampleDocs.forEach((doc, index) => {
      console.log(`   ${index + 1}. Document ID: ${doc._id}`);

      // Show key fields based on collection type
      if (collectionName === 'users') {
        console.log(`      Email: ${doc.email}`);
        console.log(`      Username: ${doc.username}`);
        console.log(`      Created: ${doc.createdAt}`);
        console.log(`      Active: ${doc.isActive}`);
      } else if (collectionName === 'movie_comments') {
        console.log(`      Movie ID: ${doc.movieId}`);
        console.log(`      Content: ${doc.content ? doc.content.substring(0, 50) + '...' : 'N/A'}`);
        console.log(`      Likes: ${doc.likes || 0}`);
        console.log(`      Created: ${doc.createdAt}`);
      } else if (collectionName === 'movie_ratings') {
        console.log(`      Movie ID: ${doc.movieId}`);
        console.log(`      Rating: ${doc.rating}/10`);
        console.log(`      Review: ${doc.review ? doc.review.substring(0, 50) + '...' : 'N/A'}`);
        console.log(`      Created: ${doc.createdAt}`);
      } else if (collectionName === 'movie_watchlist') {
        console.log(`      Movie ID: ${doc.movieId}`);
        console.log(`      Priority: ${doc.priority}`);
        console.log(`      Notes: ${doc.notes || 'N/A'}`);
        console.log(`      Created: ${doc.createdAt}`);
      } else if (collectionName === 'api_logs') {
        console.log(`      Method: ${doc.method}`);
        console.log(`      Path: ${doc.path}`);
        console.log(`      IP: ${doc.ip || 'N/A'}`);
        console.log(`      Timestamp: ${doc.createdAt}`);
      } else if (collectionName.includes('movie') || collectionName.includes('show')) {
        console.log(`      Title: ${doc.title || doc.data?.title || 'N/A'}`);
        console.log(`      Year: ${doc.year || doc.data?.year || 'N/A'}`);
        console.log(`      Type: ${doc.type || 'N/A'}`);
        if (doc.traktId) console.log(`      Trakt ID: ${doc.traktId}`);
        console.log(`      Created: ${doc.createdAt}`);
      } else {
        // Generic display for other collections
        const keys = Object.keys(doc).filter(key => !['_id', 'createdAt', 'updatedAt'].includes(key));
        console.log(`      Fields: ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}`);
        console.log(`      Created: ${doc.createdAt}`);
      }
    });

    if (count > 5) {
      console.log(`   ... and ${count - 5} more documents`);
    }

    console.log('');
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}\n`);
  }
}

async function displayDatabaseStats(db) {
  console.log('📊 DATABASE STATISTICS');
  console.log('====================');

  try {
    const stats = await db.stats();
    console.log(`Database: ${stats.db}`);
    console.log(`Collections: ${stats.collections}`);
    console.log(`Documents: ${stats.objects}`);
    console.log(`Data Size: ${(stats.dataSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Index Size: ${(stats.indexSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`Storage Size: ${(stats.storageSize / 1024 / 1024).toFixed(2)} MB`);
    console.log('');
  } catch (error) {
    console.log(`❌ Error getting stats: ${error.message}\n`);
  }
}

async function displayRecentActivity(db) {
  console.log('🕒 RECENT ACTIVITY (Last 24 hours)');
  console.log('===================================');

  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Recent API logs
    const recentLogs = await db.collection('api_logs')
      .find({ createdAt: { $gte: oneDayAgo } })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    console.log(`📡 Recent API Calls: ${recentLogs.length}`);
    recentLogs.slice(0, 5).forEach((log, index) => {
      console.log(`   ${index + 1}. ${log.method} ${log.path} - ${log.ip || 'N/A'} - ${new Date(log.createdAt).toLocaleString()}`);
    });

    // Recent user activity
    const recentComments = await db.collection('movie_comments')
      .find({ createdAt: { $gte: oneDayAgo } })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    const recentRatings = await db.collection('movie_ratings')
      .find({ createdAt: { $gte: oneDayAgo } })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    const recentWatchlist = await db.collection('movie_watchlist')
      .find({ createdAt: { $gte: oneDayAgo } })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    console.log(`\n💬 Recent Comments: ${recentComments.length}`);
    console.log(`⭐ Recent Ratings: ${recentRatings.length}`);
    console.log(`📋 Recent Watchlist Additions: ${recentWatchlist.length}`);

    console.log('');
  } catch (error) {
    console.log(`❌ Error getting recent activity: ${error.message}\n`);
  }
}

async function main() {
  console.log('🎬 MongoDB Data Viewer for Trakt Proxy');
  console.log('========================================\n');

  let client;

  try {
    const { client: mongoClient, db } = await connectToMongoDB();
    client = mongoClient;

    // Display database statistics
    await displayDatabaseStats(db);

    // Display recent activity
    await displayRecentActivity(db);

    // Display all collections data
    console.log('📚 COLLECTION DATA');
    console.log('==================\n');

    for (const collection of COLLECTIONS) {
      await displayCollectionData(db, collection.name, collection.description);
    }

    console.log('✅ Data viewing complete!');

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Make sure MongoDB is running:');
      console.log('   - Using Docker: docker-compose up -d');
      console.log('   - Local MongoDB: sudo systemctl start mongod');
    }
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 MongoDB connection closed');
    }
  }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
  console.log('\n🛑 Script interrupted by user');
  process.exit(0);
});

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, displayCollectionData, displayDatabaseStats };