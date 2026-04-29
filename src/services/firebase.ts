import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, setDoc } from 'firebase/firestore';

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
  db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
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
