const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });
const webpush = require("web-push");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const os = require("os");
const Busboy = require("busboy");
const path = require("path");
const { Storage } = require("@google-cloud/storage");

const serviceAccount = require("./pwagram-fb-key.json");

const storage = new Storage({
  projectId: "pwagram-439bb",
  keyFilename: "pwagram-fb-key.json"
});

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://pwagram-439bb.firebaseio.com/"
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

exports.storePostData = functions.https.onRequest((request, response) => {
  cors(request, response, async () => {
    try {
      const uuid = uuidv4();
      const { fields, upload } = await parseMultipart(request);

      const bucket = storage.bucket("pwagram-439bb.appspot.com");
      const [uploadedFile] = await bucket.upload(upload.file, {
        metadata: {
          contentType: upload.type,
          metadata: {
            firebaseStorageDownloadTokens: uuid
          }
        }
      });

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
        "mailto:bushidocodes@gmail.com",
        "BH1lo34DNnIy__lc7nzIMyDr2tBmGqqoRThEoRzoj2GehQ8Yg4_X2JvkHfX06Vbqxjys6I0fz2mGLu2nkC45S5o",
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
});
