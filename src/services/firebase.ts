import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, setDoc, increment } from 'firebase/firestore';

let firebaseConfig: any = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  firestoreDatabaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || '(default)'
};

// Cố gắng đọc từ biến môi trường tổng VITE_FIREBASE_JSON nếu được cài đặt
if (import.meta.env.VITE_FIREBASE_JSON) {
  try {
    const rawVal = import.meta.env.VITE_FIREBASE_JSON;
    let parsed: any = {};
    try {
      // Thử parse chuẩn JSON trước
      parsed = JSON.parse(rawVal);
    } catch (err) {
      // Nếu không chuẩn JSON (ví dụ có ngoặc kép đơn, thiếu ngoặc kép khoá...), dùng Regex để trích xuất
      const regex = /([a-zA-Z0-9_]+)\s*:\s*["']([^"']+)["']/g;
      let match;
      while ((match = regex.exec(rawVal)) !== null) {
        parsed[match[1]] = match[2];
      }
    }
    firebaseConfig = { ...firebaseConfig, ...parsed };
  } catch (e) {
    console.error("Lỗi khi xử lý VITE_FIREBASE_JSON", e);
  }
}

try {
  const configFiles = import.meta.glob('../../firebase-applet-config.json', { eager: true });
  if (configFiles && configFiles['../../firebase-applet-config.json']) {
    const loadedConfig = configFiles['../../firebase-applet-config.json'] as any;
    firebaseConfig = loadedConfig.default || loadedConfig;
  }
} catch (e) {
  console.warn("Could not load firebase-applet-config.json, falling back to environment variables.", e);
}

export let db: any = null;
export let auth: any = null;
let app: any = null;

if (firebaseConfig && firebaseConfig.apiKey) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app, firebaseConfig.databaseId || firebaseConfig.firestoreDatabaseId || undefined);
  auth = getAuth(app);
} else {
  console.warn("Firebase configuration is missing or invalid (missing apiKey). Firebase services will not be initialized. Please set up Firebase.");
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection() {
  if (!db) return false;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
      return false;
    }
    // Might be permission denied, which means connection works!
    if(error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
        return true;
    }
    handleFirestoreError(error, OperationType.GET, 'test/connection');
    return false;
  }
}

export const loginWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error("Login error:", error);
    throw error;
  }
};

export const logout = () => signOut(auth);

// Backup all local data to Firebase
export const syncToFirebase = async (uid: string, changedData: any): Promise<string | null> => {
  if (!db || Object.keys(changedData).length === 0) return null;
  try {
    const now = new Date().toISOString();

    const payload: any = {
      dbData: changedData,
      updatedAt: now,
    };

    if (changedData.apiUsage) {
       payload.dailyGeminiCalls = changedData.apiUsage.dailyGeminiCalls || 0;
       payload.recentApiTimestamps = changedData.apiUsage.recentApiTimestamps || [];
    }

    await setDoc(doc(db, 'users', uid), payload, { merge: true });
    console.log(`Synced diff to Firebase. Keys: ${Object.keys(changedData).join(', ')}`);
    return now;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}`);
    return null;
  }
};

export const updateUserMetrics = async (uid: string, data: any) => {
  if (!db) return;
  try {
    await setDoc(doc(db, 'users', uid), data, { merge: true });
  } catch (error) {
    console.error("Failed metrics update", error);
  }
};

export const incrementGlobalApiUsage = async (model: string, amount: number = 1) => {
  if (!db) return;
  try {
    const today = new Date().toISOString().split('T')[0];
    const docRef = doc(db, 'stats', `apiUsage_${today}`);
    let key = "flash";
    if (model === "gemini-3.1-flash-lite-preview" || model === "gemini-3.1-flash-lite") key = "flash_lite";
    else if (model === "gemini-3.5-flash-preview" || model === "gemini-3.5-flash") key = "flash_3_5";
    await setDoc(docRef, { [key]: increment(amount) }, { merge: true });
  } catch (error) {
    console.error("Error incrementing global API usage", error);
  }
};

export const getGlobalApiUsage = async () => {
  if (!db) return { flash_lite: 0, flash: 0, flash_3_5: 0 };
  try {
    const today = new Date().toISOString().split('T')[0];
    const docRef = doc(db, 'stats', `apiUsage_${today}`);
    const snap = await getDocFromServer(docRef);
    if (snap.exists()) {
      return snap.data();
    }
  } catch (error) {
    console.error("Error getting global API usage", error);
  }
  return { flash_lite: 0, flash: 0, flash_3_5: 0 };
};

// Restore from Firebase
export const syncFromFirebase = async (uid: string): Promise<{ data: any, updatedAt: string | null, canSyncQuestions?: boolean } | null> => {
  if (!db) return null;
  try {
    const d = await getDocFromServer(doc(db, 'users', uid));
    if (d.exists()) {
      const data = d.data();
      let parsedData: any = null;
      if (data && data.backupData) {
         try { parsedData = JSON.parse(data.backupData); } catch(e) {}
      }
      if (data && data.dbData) {
         parsedData = { ...(parsedData || {}), ...data.dbData };
      }
      return { 
        data: parsedData, 
        updatedAt: data?.updatedAt || null, 
        canSyncQuestions: data?.canSyncQuestions === true 
      };
    }
    return null;
  } catch (error) {
    console.warn("Could not sync from Firebase", error);
    return null;
  }
};
