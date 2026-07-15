import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import webpush from "web-push";
import fs from "node:fs";
import { v4 as uuidv4 } from "uuid";
import os from "node:os";
import Busboy from "busboy";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Storage } from "@google-cloud/storage";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceAccount = JSON.parse(
  fs.readFileSync(path.join(__dirname, "pwagram-fb-key.json"), "utf8")
);

// Firebase coordinates — overridable via env (e.g. functions/.env, see
// .env.example) so a fork can target its own project. Defaults preserve the
// original `pwagram-439bb` backend. None of these are secrets.
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "pwagram-439bb";
const DATABASE_URL =
  process.env.FIREBASE_DATABASE_URL || `https://${PROJECT_ID}.firebaseio.com/`;
const STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || `${PROJECT_ID}.appspot.com`;
// VAPID public key is the (non-secret) pair of VAPID_PRIVATE_KEY.
const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  "BH1lo34DNnIy__lc7nzIMyDr2tBmGqqoRThEoRzoj2GehQ8Yg4_X2JvkHfX06Vbqxjys6I0fz2mGLu2nkC45S5o";

const storage = new Storage({
  projectId: PROJECT_ID,
  keyFilename: "pwagram-fb-key.json"
});

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: DATABASE_URL
});

// Parse a multipart upload from a Cloud Function request, waiting for all
// file write streams to fully flush before resolving (the original code had
// a race where busboy's finish fired before the tmp file was fully written).
function parseMultipart(request) {
  return new Promise((resolve, reject) => {
    const fields = {};
    let upload;
    const writePromises = [];
    const busboy = Busboy({ headers: request.headers });

    busboy.on("file", (name, stream, info) => {
      const { filename, mimeType } = info;
      const safeFilename = uuidv4() + path.extname(path.basename(filename));
      const filepath = path.join(os.tmpdir(), safeFilename);
      upload = { file: filepath, type: mimeType };
      const writeStream = fs.createWriteStream(filepath);
      writePromises.push(
        new Promise((res, rej) => {
          writeStream.on("finish", res);
          writeStream.on("error", rej);
        })
      );
      stream.pipe(writeStream);
    });

    busboy.on("field", (name, val) => {
      fields[name] = val;
    });

    busboy.on("finish", () => {
      Promise.all(writePromises)
        .then(() => resolve({ fields, upload }))
        .catch(reject);
    });

    busboy.on("error", reject);
    busboy.write(request.rawBody);
    busboy.end();
  });
}

export const storePostData = functions.https.onRequest(async (request, response) => {
  response.set('Access-Control-Allow-Origin', '*');
  response.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.set('Access-Control-Allow-Headers', 'Content-Type');
  if (request.method === 'OPTIONS') {
    response.status(204).send('');
    return;
  }

  try {
    const uuid = uuidv4();
    const { fields, upload } = await parseMultipart(request);

    if (!upload) {
      return response.status(400).json({ error: "No file uploaded" });
    }

    const bucket = storage.bucket(STORAGE_BUCKET);
    let uploadedFile;
    try {
      [uploadedFile] = await bucket.upload(upload.file, {
        metadata: {
          contentType: upload.type,
          metadata: {
            firebaseStorageDownloadTokens: uuid
          }
        }
      });
    } finally {
      fs.unlink(upload.file, () => {});
    }

    const imageUrl =
      `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/` +
      `${encodeURIComponent(uploadedFile.name)}?alt=media&token=${uuid}`;

    await admin
      .database()
      .ref("posts")
      .push({
        title: fields.title,
        location: fields.location,
        id: fields.id,
        rawLocation: {
          lat: fields.rawLocationLat,
          lng: fields.rawLocationLng
        },
        image: imageUrl
      });

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:bushidocodes@gmail.com",
      VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const subscriptionsSnap = await admin
      .database()
      .ref("subscriptions")
      .once("value");

    const pushPromises = [];
    subscriptionsSnap.forEach(sub => {
      const pushConfig = {
        endpoint: sub.val().endpoint,
        keys: {
          auth: sub.val().keys.auth,
          p256dh: sub.val().keys.p256dh
        }
      };
      // Swallow per-subscription failures so one stale endpoint can't abort
      // the entire request — the post is already saved at this point.
      pushPromises.push(
        webpush
          .sendNotification(
            pushConfig,
            JSON.stringify({ title: "New Post", content: "New Post added!", openUrl: "/" })
          )
          .catch(() => {})
      );
    });

    await Promise.all(pushPromises);
    response.status(201).json({ message: "Data stored", id: fields.id });
  } catch (err) {
    response.status(500).json({ error: err.message });
  }
});
