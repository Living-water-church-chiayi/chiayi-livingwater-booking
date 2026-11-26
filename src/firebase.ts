import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  disableNetwork,
  enableNetwork,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Initialize Firestore with IndexedDB persistent cache + auto long-polling detection.
// This specifically resolves iOS / Android standalone PWA WebKit hangs where HTTP/2 WebChannel streams freeze on resume.
function createResilientFirestore(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
        experimentalAutoDetectLongPolling: true,
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch (err) {
    console.warn('Persistent Firestore cache unavailable, falling back to memory cache:', err);
    try {
      return initializeFirestore(
        app,
        {
          localCache: memoryLocalCache(),
          experimentalAutoDetectLongPolling: true,
        },
        firebaseConfig.firestoreDatabaseId
      );
    } catch {
      return getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
  }
}

export const db = createResilientFirestore();

let networkResetInFlight: Promise<void> | null = null;

/**
 * Forces Firestore to drop any stale/zombie TCP socket (common after iOS standalone PWA background suspend)
 * and immediately establish a fresh connection.
 */
export async function resetFirestoreNetwork(): Promise<void> {
  if (networkResetInFlight) return networkResetInFlight;

  networkResetInFlight = (async () => {
    try {
      await disableNetwork(db);
      await new Promise((resolve) => window.setTimeout(resolve, 160));
      await enableNetwork(db);
    } catch (err) {
      console.warn('Firestore network reset warning:', err);
      try {
        await enableNetwork(db);
      } catch {
        // ignore
      }
    } finally {
      networkResetInFlight = null;
    }
  })();

  return networkResetInFlight;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
