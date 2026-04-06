// services/firestoreService.js
// Reusable Firestore operations for the attendance collection.

const { db } = require('./firebase');

const COLLECTION = 'attendance';

/**
 * Create a new check-in record.
 */
const createCheckIn = async (userId) => {
  const now = new Date();
  const docRef = await db.collection(COLLECTION).add({
    userId,
    checkInTime: now.toISOString(),
    checkOutTime: null,
    totalDuration: null,
    date: now.toISOString().split('T')[0], // YYYY-MM-DD
  });
  const doc = await docRef.get();
  return { id: doc.id, ...doc.data() };
};

/**
 * Find the latest active (unchecked-out) session for a user.
 */
const getActiveSession = async (userId) => {
  const snapshot = await db
    .collection(COLLECTION)
    .where('userId', '==', userId)
    .where('checkOutTime', '==', null)
    .orderBy('checkInTime', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
};

/**
 * Update a record with checkout time and total duration.
 */
const updateCheckOut = async (docId, checkInTime) => {
  const now = new Date();
  const checkIn = new Date(checkInTime);
  const totalDuration = Math.round((now - checkIn) / 60000); // in minutes

  await db.collection(COLLECTION).doc(docId).update({
    checkOutTime: now.toISOString(),
    totalDuration,
  });

  const updated = await db.collection(COLLECTION).doc(docId).get();
  return { id: updated.id, ...updated.data() };
};

/**
 * Get all attendance records for a user sorted by date descending.
 */
const getUserAttendance = async (userId) => {
  const snapshot = await db
    .collection(COLLECTION)
    .where('userId', '==', userId)
    .orderBy('checkInTime', 'desc')
    .get();

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

/**
 * Group raw attendance rows by calendar day (record.date / checkIn date).
 * Sums completed session minutes; open sessions contribute elapsed minutes so far.
 */
const buildDailySummaries = (records) => {
  const now = Date.now();
  const map = new Map();

  for (const r of records) {
    const day =
      r.date || (r.checkInTime ? String(r.checkInTime).split('T')[0] : null);
    if (!day) continue;

    if (!map.has(day)) {
      map.set(day, {
        date: day,
        totalMinutes: 0,
        sessionCount: 0,
        hasOpenSession: false,
        sessions: [],
      });
    }
    const entry = map.get(day);
    entry.sessionCount += 1;
    entry.sessions.push({
      id: r.id,
      checkInTime: r.checkInTime,
      checkOutTime: r.checkOutTime,
      totalDuration: r.totalDuration,
    });

    if (r.checkOutTime != null && typeof r.totalDuration === 'number') {
      entry.totalMinutes += r.totalDuration;
    } else if (r.checkInTime) {
      const mins = Math.max(
        0,
        Math.round((now - new Date(r.checkInTime).getTime()) / 60000)
      );
      entry.totalMinutes += mins;
      entry.hasOpenSession = true;
    }
  }

  for (const entry of map.values()) {
    entry.sessions.sort(
      (a, b) => new Date(b.checkInTime) - new Date(a.checkInTime)
    );
  }

  return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
};

module.exports = {
  createCheckIn,
  getActiveSession,
  updateCheckOut,
  getUserAttendance,
  buildDailySummaries,
};
