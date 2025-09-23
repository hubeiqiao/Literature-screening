import type { Firestore } from '@google-cloud/firestore';

type DocumentData = Record<string, unknown>;

type SetOptions = {
  merge?: boolean;
};

class InMemoryFirestoreImpl {
  private store = new Map<string, DocumentData>();

  private idCounter = 0;

  collection(path: string) {
    return new CollectionReference(this, path);
  }

  runTransaction<T>(updateFunction: (transaction: Transaction) => Promise<T>): Promise<T> {
    const transaction = new Transaction(this);
    return updateFunction(transaction).then((result) => {
      transaction.commit();
      return result;
    });
  }

  getSnapshot(path: string) {
    const data = this.store.get(path);
    return {
      exists: Boolean(data),
      data: () => (data ? structuredClone(data) : undefined),
    };
  }

  setDocument(path: string, data: DocumentData, options?: SetOptions) {
    const payload = structuredClone(data) as DocumentData;
    if (options?.merge) {
      const existing = this.store.get(path);
      this.store.set(path, { ...(existing ?? {}), ...payload });
      return;
    }
    this.store.set(path, payload);
  }

  generateId(): string {
    this.idCounter += 1;
    return `mock-${this.idCounter}`;
  }

  list(prefix: string) {
    const result: Array<{ path: string; data: DocumentData }> = [];
    for (const [path, data] of this.store.entries()) {
      if (path.startsWith(prefix)) {
        result.push({ path, data: structuredClone(data) });
      }
    }
    return result;
  }
}

class DocumentReference {
  constructor(private readonly root: InMemoryFirestoreImpl, readonly path: string) {}

  get id() {
    const segments = this.path.split('/');
    return segments[segments.length - 1];
  }

  async get() {
    return this.root.getSnapshot(this.path);
  }

  set(data: DocumentData, options?: SetOptions) {
    this.root.setDocument(this.path, data, options);
  }

  collection(path: string) {
    return new CollectionReference(this.root, `${this.path}/${path}`);
  }
}

class CollectionReference {
  constructor(private readonly root: InMemoryFirestoreImpl, private readonly path: string) {}

  doc(id?: string) {
    const identifier = id ?? this.root.generateId();
    return new DocumentReference(this.root, `${this.path}/${identifier}`);
  }

  async add(data: DocumentData) {
    const doc = this.doc();
    this.root.setDocument(doc.path, data);
    return doc;
  }
}

class Transaction {
  private pending: Array<{ doc: DocumentReference; data: DocumentData; options?: SetOptions }> = [];

  constructor(private readonly root: InMemoryFirestoreImpl) {}

  async get(doc: DocumentReference) {
    return this.root.getSnapshot(doc.path);
  }

  set(doc: DocumentReference, data: DocumentData, options?: SetOptions) {
    this.pending.push({ doc, data, options });
  }

  commit() {
    for (const { doc, data, options } of this.pending) {
      this.root.setDocument(doc.path, data, options);
    }
    this.pending = [];
  }
}

export interface InMemoryFirestore {
  firestore: Firestore;
  list(path: string): Array<{ path: string; data: DocumentData }>;
  get(path: string): DocumentData | undefined;
}

export function createInMemoryFirestore(): InMemoryFirestore {
  const impl = new InMemoryFirestoreImpl();

  return {
    firestore: impl as unknown as Firestore,
    list: (path: string) => impl.list(path),
    get: (path: string) => impl.list(path).find((entry) => entry.path === path)?.data,
  };
}
