import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, query, where, getDocs, doc, updateDoc, Timestamp, orderBy, limit } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json';

const app = express();
app.use(express.json());
const PORT = 3000;

// Initialize Firebase
const appInstance = initializeApp(firebaseConfig);
const db = getFirestore(appInstance, firebaseConfig.firestoreDatabaseId);

// API routes
app.post("/api/scan", async (req, res) => {
  const { eid, actionType } = req.body;
  if (!eid) return res.status(400).json({ error: "EID required" });

  try {
    const timestamp = Timestamp.now();
    const dateStr = new Date().toISOString().split('T')[0];

    // Placeholder logic for token validation as per PCCDTR2026V1.MD
    // Re-scanning check (Anti-spam) should go here.

    // Write to attendance (log)
    await addDoc(collection(db, "attendance"), {
      employee_id: eid,
      action: actionType,
      source: "SCAN",
      timestamp: timestamp,
    });

    if (actionType === 'LOGIN') {
      await addDoc(collection(db, "attendance_sessions"), {
        employee_id: eid,
        login_at: timestamp,
        logout_at: null,
        date: dateStr,
      });
    } else if (actionType === 'LOGOUT') {
      // Find open session
      const q = query(
        collection(db, "attendance_sessions"),
        where("employee_id", "==", eid),
        where("logout_at", "==", null),
        orderBy("login_at", "desc"),
        limit(1)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const sessionDoc = snapshot.docs[0];
        await updateDoc(doc(db, "attendance_sessions", sessionDoc.id), {
          logout_at: timestamp,
        });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Scan error:", error);
    res.status(500).json({ error: "Failed to process scan" });
  }
});

// Vite middleware setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
