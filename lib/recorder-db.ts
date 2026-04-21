/**
 * SomosDos Recorder - Offline Persistence Utility
 * Uses IndexedDB to store audio chunks in real-time during recording.
 */

const DB_NAME = "SomosDosRecorderDB"
const STORE_NAME = "recordings"

export interface PendingRecording {
    id: string
    timestamp: number
    chunks: Blob[]
}

export const initDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1)
        request.onupgradeneeded = () => {
            const db = request.result
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "id" })
            }
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

export const saveRecordingSession = async (session: PendingRecording) => {
    const db = await initDB()
    return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite")
        const store = transaction.objectStore(STORE_NAME)
        const request = store.put(session)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
    })
}

export const getAllPendingRecordings = async (): Promise<PendingRecording[]> => {
    const db = await initDB()
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readonly")
        const store = transaction.objectStore(STORE_NAME)
        const request = store.getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

export const deleteRecordingSession = async (id: string) => {
    const db = await initDB()
    return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite")
        const store = transaction.objectStore(STORE_NAME)
        const request = store.delete(id)
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
    })
}
