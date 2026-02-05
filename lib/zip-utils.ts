
import JSZip from "jszip";
import { SupabaseClient } from "@supabase/supabase-js";
import { saveAs } from "file-saver";

interface ImportProgress {
    total: number;
    current: number;
    filename: string;
}

export const exportZip = async (
    spaceId: string,
    rootFolderId: string | null,
    supabase: SupabaseClient,
    onProgress: (status: string) => void
) => {
    onProgress("Analizando estructura...");
    const zip = new JSZip();

    // 1. Fetch all files/folders in the space
    const { data: allItems, error } = await supabase
        .from("files")
        .select("id, name, type, parent_id, storage_path")
        .eq("space_id", spaceId);

    if (error) throw error;
    if (!allItems) return;

    // Map for fast lookup
    const itemMap = new Map(allItems.map(i => [i.id, i]));

    // Helper to build relative path from rootFolderId
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getRelativePath = (item: any): string | null => {
        if (item.id === rootFolderId) return ""; // Base folder itself (shouldn't happen for files)

        // If searching for global root items
        if (!rootFolderId && !item.parent_id) return item.name;

        // Validation: Verify connectivity to root
        let path = item.name;
        let current = item;
        let safety = 0;

        while (safety < 20) {
            if (!current.parent_id) {
                // Reached global root
                if (rootFolderId) return null; // Item is global, but we wanted specific folder
                return path;
            }

            if (current.parent_id === rootFolderId) {
                return path; // Found connection to target root
            }

            const parent = itemMap.get(current.parent_id);
            if (!parent) return null; // Orphaned

            path = `${parent.name}/${path}`;
            current = parent;
            safety++;
        }
        return path;
    };

    const filesToDownload = allItems.filter(i => i.type === 'file' && i.storage_path);
    let processed = 0;
    const totalFiles = filesToDownload.length; // Approximate, filtering happens in loop

    for (const fileItem of filesToDownload) {
        const relPath = getRelativePath(fileItem);
        if (!relPath) continue; // Skip items outside our folder scope

        try {
            onProgress(`Descargando ${Math.round((processed / totalFiles) * 100)}%: ${fileItem.name}`);

            const { data, error } = await supabase.storage
                .from('library_files')
                .download(fileItem.storage_path);

            if (!error && data) {
                zip.file(relPath, data);
            }
        } catch (e) {
            console.error("Skipping file", fileItem.name);
        }
        processed++;
    }

    onProgress("Comprimiendo ZIP...");
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, `backup_${rootFolderId ? 'folder' : 'full'}_${Date.now()}.zip`);
    onProgress("");
};

export const importZip = async (
    file: File,
    spaceId: string,
    rootFolderId: string | null,
    supabase: SupabaseClient,
    onProgress: (progress: ImportProgress) => void
) => {
    const zip = new JSZip();
    const contents = await zip.loadAsync(file);

    // Convert to array to process easier
    const entries = Object.entries(contents.files);
    const total = entries.filter(([_, zipEntry]) => !zipEntry.dir).length;
    let current = 0;

    console.log(`Starting import of ${total} files...`);

    // Get User ID once
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated");
    const userId = user.id;

    // Helper to resolve folder path to DB ID
    // Cache folder paths to avoid redundant DB calls { "path/to/folder": "uuid" }
    const folderCache: Record<string, string> = {};

    const getFolderId = async (pathParts: string[], parentId: string | null): Promise<string | null> => {
        if (pathParts.length === 0) return parentId;

        const currentFolderName = pathParts[0];
        const currentPathKey = parentId ? `${parentId}/${currentFolderName}` : currentFolderName;

        if (folderCache[currentPathKey]) {
            // Recurse
            return getFolderId(pathParts.slice(1), folderCache[currentPathKey]);
        }

        let query = supabase
            .from("files")
            .select("id")
            .eq("space_id", spaceId)
            .eq("name", currentFolderName)
            .eq("type", "folder");

        if (parentId) {
            query = query.eq("parent_id", parentId);
        } else {
            query = query.is("parent_id", null);
        }

        console.log(`Checking folder: ${currentFolderName}, Parent: ${parentId}`);

        const { data, error: fetchError } = await query.maybeSingle();

        if (fetchError) {
            console.error("Error checking folder existence:", fetchError);
            throw fetchError;
        }

        let folderId = data?.id;

        if (!folderId) {
            console.log(`Creating folder: ${currentFolderName}`);
            // Create Folder
            const { data: newFolder, error } = await supabase
                .from("files")
                .insert({
                    name: currentFolderName,
                    type: "folder",
                    space_id: spaceId,
                    parent_id: parentId,
                    user_id: userId
                })
                .select("id")
                .single();

            if (error) {
                console.error("Error creating folder:", error);
                throw error;
            }
            folderId = newFolder.id;
        }

        // Cache and recurse
        folderCache[currentPathKey] = folderId;
        return getFolderId(pathParts.slice(1), folderId);
    };


    // Process sequential to avoid overwhelming DB/Network
    // Could optimize with Promise.all with concurrency limit, but sequential is safer for now.
    for (const [relativePath, zipEntry] of entries) {
        if (zipEntry.dir) continue; // Skip explicit folder entries, we create them on demand

        const parts = relativePath.split('/');
        const fileName = parts.pop()!;
        const folderPathParts = parts;

        // Clean filename (macos artifacts etc)
        if (fileName.startsWith('.') || relativePath.includes('__MACOSX')) continue;

        try {
            // 1. Resolve Parent Folder ID
            // If rootFolderId is provided, all zip content goes inside it.
            const parentId = await getFolderId(folderPathParts, rootFolderId);

            // 2. Read File Data
            const blob = await zipEntry.async("blob");
            const fileObj = new File([blob], fileName);

            // 3. Upload to Storage
            // FIX: Ensure userId is string, and sanitize path safely. 
            // We use a timestamp to avoid duplicates, but keep extension if possible or just blob it.
            const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
            const storagePath = `${userId}/${Date.now()}_${Math.random().toString(36).substring(7)}_${sanitizedName}`;

            const { error: uploadError } = await supabase.storage
                .from('library_files')
                .upload(storagePath, fileObj);

            if (uploadError) throw new Error(`Storage Upload Error: ${uploadError.message}`);

            // 4. Create DB Record
            const { error: dbError } = await supabase
                .from("files")
                .insert({
                    name: fileName,
                    type: "file",
                    size_bytes: blob.size,
                    space_id: spaceId,
                    parent_id: parentId,
                    storage_path: storagePath,
                    user_id: userId
                });

            if (dbError) throw new Error(`DB Insert Error: ${dbError.message}`);

            current++;
            onProgress({ total, current, filename: fileName });

        } catch (err: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const error = err as any;
            console.error(`Failed to import ${relativePath}`, {
                message: error.message || "Unknown error",
                details: error.details,
                hint: error.hint,
                code: error.code,
                fullError: error
            });
            // Continue with other files
        }
    }
};
