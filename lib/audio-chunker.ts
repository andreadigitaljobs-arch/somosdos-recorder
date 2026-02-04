import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'

let ffmpegInstance: FFmpeg | null = null

/**
 * Initialize FFmpeg.wasm
 * This only needs to be called once and will load the WASM binary
 */
export async function initFFmpeg(onProgress?: (progress: number) => void): Promise<FFmpeg> {
    if (ffmpegInstance && ffmpegInstance.loaded) {
        return ffmpegInstance
    }

    const ffmpeg = new FFmpeg()

    // Set up progress callback if provided
    if (onProgress) {
        ffmpeg.on('progress', ({ progress }) => {
            onProgress(progress * 100)
        })
    }

    // Load the core and WASM files from CDN
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd'
    await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    })

    ffmpegInstance = ffmpeg
    return ffmpeg
}

/**
 * Extract audio from a video file
 * @param file - Video or audio file
 * @returns Audio blob in MP3 format
 */
export async function extractAudio(
    file: File,
    onProgress?: (progress: number) => void
): Promise<Blob> {
    const ffmpeg = await initFFmpeg(onProgress)

    // Write input file to FFmpeg virtual filesystem
    const inputName = 'input' + getFileExtension(file.name)
    const outputName = 'output.mp3'

    const arrayBuffer = await file.arrayBuffer()
    await ffmpeg.writeFile(inputName, new Uint8Array(arrayBuffer))

    // Extract audio to MP3 format
    // -i: input file
    // -vn: no video
    // -acodec libmp3lame: use MP3 codec
    // -b:a 128k: audio bitrate 128kbps (good balance of quality/size)
    await ffmpeg.exec(['-i', inputName, '-vn', '-acodec', 'libmp3lame', '-b:a', '128k', outputName])

    // Read output file
    const data = await ffmpeg.readFile(outputName)

    // Clean up
    await ffmpeg.deleteFile(inputName)
    await ffmpeg.deleteFile(outputName)

    // Convert to compatible Uint8Array for Blob
    const uint8Data = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
    return new Blob([uint8Data], { type: 'audio/mpeg' })
}

/**
 * Split audio file into chunks based on duration
 * @param audioBlob - Audio blob to split
 * @param chunkDurationMinutes - Duration of each chunk in minutes (default: 10)
 * @returns Array of audio blobs
 */
export async function splitAudioIntoChunks(
    audioBlob: Blob,
    chunkDurationMinutes: number = 10,
    onProgress?: (progress: number, currentChunk: number, totalChunks: number) => void
): Promise<Blob[]> {
    const ffmpeg = await initFFmpeg()

    const inputName = 'input.mp3'
    const arrayBuffer = await audioBlob.arrayBuffer()
    await ffmpeg.writeFile(inputName, new Uint8Array(arrayBuffer))

    // Get audio duration first
    // We'll parse ffmpeg output to get duration
    let duration = 0
    ffmpeg.on('log', ({ message }) => {
        // Parse duration from log: "Duration: 00:10:30.50"
        const match = message.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/)
        if (match) {
            const hours = parseInt(match[1])
            const minutes = parseInt(match[2])
            const seconds = parseInt(match[3])
            duration = hours * 3600 + minutes * 60 + seconds
        }
    })

    // Probe the file to get duration
    await ffmpeg.exec(['-i', inputName, '-f', 'null', '-'])

    const chunkDurationSeconds = chunkDurationMinutes * 60
    const totalChunks = Math.ceil(duration / chunkDurationSeconds)
    const chunks: Blob[] = []

    // Split into chunks
    for (let i = 0; i < totalChunks; i++) {
        const startTime = i * chunkDurationSeconds
        const outputName = `chunk_${i}.mp3`

        // -ss: start time
        // -t: duration
        // -c copy: copy codec (fast, no re-encoding)
        await ffmpeg.exec([
            '-i', inputName,
            '-ss', String(startTime),
            '-t', String(chunkDurationSeconds),
            '-c', 'copy',
            outputName
        ])

        const data = await ffmpeg.readFile(outputName)
        // Convert to compatible Uint8Array for Blob
        const uint8Data = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
        chunks.push(new Blob([uint8Data], { type: 'audio/mpeg' }))

        await ffmpeg.deleteFile(outputName)

        if (onProgress) {
            onProgress(((i + 1) / totalChunks) * 100, i + 1, totalChunks)
        }
    }

    // Clean up
    await ffmpeg.deleteFile(inputName)

    return chunks
}

/**
 * Process a video/audio file into transcribable chunks
 * This is the main function to use - it handles everything
 */
export async function processFileIntoChunks(
    file: File,
    chunkDurationMinutes: number = 10,
    onProgress?: (stage: string, progress: number, details?: string) => void
): Promise<Blob[]> {
    try {
        // Stage 1: Extract audio (if video)
        onProgress?.('extract', 0, 'Extrayendo audio del archivo...')
        const audioBlob = await extractAudio(file, (progress) => {
            onProgress?.('extract', progress, 'Extrayendo audio...')
        })
        onProgress?.('extract', 100, 'Audio extraído correctamente')

        // Stage 2: Split into chunks
        onProgress?.('split', 0, 'Dividiendo audio en segmentos...')
        const chunks = await splitAudioIntoChunks(
            audioBlob,
            chunkDurationMinutes,
            (progress, current, total) => {
                onProgress?.('split', progress, `Dividiendo en ${total} segmentos...`)
            }
        )
        onProgress?.('split', 100, `${chunks.length} segmentos creados`)

        return chunks
    } catch (error) {
        console.error('Error processing file:', error)
        throw new Error(`Error procesando archivo: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
}

/**
 * Helper to get file extension
 */
function getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.')
    return lastDot !== -1 ? filename.substring(lastDot) : ''
}

/**
 * Check if a file needs chunking based on size
 */
export function shouldUseChunking(file: File, thresholdMB: number = 20): boolean {
    const fileSizeMB = file.size / (1024 * 1024)
    return fileSizeMB > thresholdMB
}
