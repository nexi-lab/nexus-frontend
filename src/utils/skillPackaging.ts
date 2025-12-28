import JSZip from 'jszip';

// Type for the FilesAPI interface used in this module
interface FilesAPI {
  read(path: string): Promise<Uint8Array>;
  list(path: string, options?: { recursive?: boolean; details?: boolean }): Promise<Array<{ path: string; isDirectory: boolean }>>;
}

/**
 * Parse skill name from SKILL.md content
 */
export function parseSkillNameFromContent(skillMdContent: string): string | null {
  // Try to parse YAML front matter first
  const yamlMatch = skillMdContent.match(/^---\s*\n([\s\S]*?)\n---/);
  if (yamlMatch) {
    const yamlContent = yamlMatch[1];
    const nameMatch = yamlContent.match(/^name:\s*["']?(.+?)["']?\s*$/m);
    if (nameMatch) {
      return nameMatch[1].trim();
    }
  }

  // Fallback to simple name: pattern
  const nameMatch = skillMdContent.match(/^name:\s*["']?(.+?)["']?\s*$/m);
  if (nameMatch) {
    return nameMatch[1].trim();
  }

  return null;
}

/**
 * Create a skill ZIP package from a directory
 * @param folderPath - Full path to the skill folder
 * @param filesAPI - FilesAPI instance for reading files
 * @returns Base64 encoded ZIP data and the skill name
 */
export async function createSkillZipFromDirectory(
  folderPath: string,
  filesAPI: FilesAPI
): Promise<{ zipBase64: string; skillName: string }> {
  // Read SKILL.md to get the actual skill name
  const skillMdPath = `${folderPath}/SKILL.md`.replace(/\/+/g, '/');
  const skillMdContent = await filesAPI.read(skillMdPath);
  const skillMdText = new TextDecoder().decode(skillMdContent);

  // Parse the skill name from SKILL.md
  const folderName = folderPath.split('/').filter(Boolean).pop() || 'skill';
  const skillName = parseSkillNameFromContent(skillMdText) || folderName;

  // List all files in the directory recursively
  const sourceFiles = await filesAPI.list(folderPath, { recursive: true, details: true });

  // Create ZIP package
  const zip = new JSZip();

  // Add all files to zip with skill name as the root directory
  for (const sourceFile of sourceFiles) {
    if (!sourceFile.isDirectory) {
      const relativePath = sourceFile.path.substring(folderPath.length).replace(/^\//, '');
      const zipPath = `${skillName}/${relativePath}`;
      const content = await filesAPI.read(sourceFile.path);
      zip.file(zipPath, content);
    }
  }

  // Generate ZIP blob and convert to base64
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const arrayBuffer = await zipBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const binary = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join('');
  const zipBase64 = btoa(binary);

  return { zipBase64, skillName };
}

/**
 * Create a skill ZIP package from FileList (browser file input)
 * @param files - FileList from directory input
 * @returns Base64 encoded ZIP data, the skill name, and the created File object
 */
export async function createSkillZipFromFileList(
  files: FileList
): Promise<{ zipBase64: string; skillName: string; zipFile: File }> {
  if (!files || files.length === 0) {
    throw new Error('No files provided');
  }

  const folderName = files[0].webkitRelativePath.split('/')[0] || 'skill-directory';

  // Find and read SKILL.md to get the actual skill name
  let skillMdContent = '';
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.webkitRelativePath.endsWith('/SKILL.md')) {
      skillMdContent = await file.text();
      break;
    }
  }

  // Parse the skill name from SKILL.md
  const skillName = parseSkillNameFromContent(skillMdContent) || folderName;

  // Create ZIP package
  const zip = new JSZip();

  // Add all files to zip, preserving directory structure with skill name as root
  const filePromises: Promise<void>[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const relativePath = file.webkitRelativePath;

    // Remove leading ./ or .\
    let normalizedPath = relativePath.replace(/^\.\//, '').replace(/^\.\\/, '');

    // Replace the folder name with the skill name
    const pathParts = normalizedPath.split('/');
    if (pathParts.length > 0) {
      pathParts[0] = skillName;
      normalizedPath = pathParts.join('/');
    }

    // Only add files (not empty paths)
    if (normalizedPath) {
      filePromises.push(
        file.arrayBuffer().then((content) => {
          zip.file(normalizedPath, content);
        })
      );
    }
  }

  await Promise.all(filePromises);

  // Generate ZIP file
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const zipFile = new File([zipBlob], `${skillName}.skill`, { type: 'application/zip' });

  // Convert to base64
  const arrayBuffer = await zipBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const binary = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join('');
  const zipBase64 = btoa(binary);

  return { zipBase64, skillName, zipFile };
}
