import { Download, Edit, FileText, Loader2, Maximize2, Minimize2, Save, Trash2, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type NexusAPIClient from '../api/client';
import { createFilesAPI } from '../api/files';
import { useDeleteFile, useFileContent, useUpdateFile } from '../hooks/useFiles';
import type { FileInfo } from '../types/file';
import { NexusConnection } from './NexusConnection';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';

const PDFViewer = lazy(() => import('./PDFViewer').then(({ PDFViewer }) => ({ default: PDFViewer })));
type FileKind = 'text' | 'markdown' | 'json' | 'html' | 'image' | 'video' | 'pdf' | 'binary';

function fileKind(file: FileInfo | null): FileKind {
  const extension = file?.name.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(extension)) return 'image';
  if (['mp4', 'webm', 'ogg', 'mov'].includes(extension)) return 'video';
  if (['doc', 'docx', 'xls', 'xlsx', 'xlsm', 'xlsb', 'ppt', 'pptx', 'zip', 'bin', 'exe', 'dll', 'so'].includes(extension)) return 'binary';
  if (extension === 'pdf') return 'pdf';
  if (['md', 'markdown'].includes(extension)) return 'markdown';
  if (['html', 'htm'].includes(extension)) return 'html';
  if (['json', 'jsonl'].includes(extension)) return 'json';
  return 'text';
}

function useObjectURL(bytes: Uint8Array | undefined, mime: string) {
  const [resource, setResource] = useState<{ bytes: Uint8Array; mime: string; url: string } | null>(null);
  useEffect(() => {
    if (!bytes) {
      setResource(null);
      return;
    }
    const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: mime }));
    setResource({ bytes, mime, url });
    return () => URL.revokeObjectURL(url);
  }, [bytes, mime]);
  return resource && resource.bytes === bytes && resource.mime === mime ? resource.url : null;
}

interface FileContentViewerProps {
  file: FileInfo | null;
  onFileDeleted?: (path: string) => void;
}

export function FileContentViewer(props: FileContentViewerProps) {
  return <NexusConnection>{(client) => <Content {...props} client={client} />}</NexusConnection>;
}

function Content({ file, onFileDeleted, client }: FileContentViewerProps & { client: NexusAPIClient }) {
  const files = useMemo(() => createFilesAPI(client), [client]);
  const path = file?.path ?? '';
  const kind = fileKind(file);
  const text = ['text', 'markdown', 'html', 'json'].includes(kind);
  const { data: bytes, isLoading, error } = useFileContent(path, !!file && !file.isDirectory);
  const content = useMemo(() => (bytes && text ? new TextDecoder().decode(bytes) : ''), [bytes, text]);
  const mime =
    file?.type ||
    (kind === 'image' ? `image/${file?.name.split('.').pop()?.toLowerCase() === 'svg' ? 'svg+xml' : file?.name.split('.').pop()?.toLowerCase()}` : 'video/mp4');
  const objectURL = useObjectURL(kind === 'image' || kind === 'video' ? bytes : undefined, mime);
  const [edit, setEdit] = useState<{ path: string; content: string } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [actionError, setActionError] = useState<{ path: string; message: string } | null>(null);
  const update = useUpdateFile();
  const remove = useDeleteFile();
  useEffect(() => {
    setEdit(null);
    setFullscreen(false);
    setActionError(null);
  }, [path]);

  const download = async () => {
    if (!file) return;
    try {
      const current = await files.read(path);
      const url = URL.createObjectURL(new Blob([current as unknown as BlobPart], { type: 'application/octet-stream' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setActionError({ path, message: error instanceof Error ? error.message : 'Unable to download file.' });
    }
  };
  const save = async () => {
    if (!edit || edit.path !== path) return;
    const expected = edit;
    setActionError(null);
    try {
      await update.mutateAsync({ path, content: expected.content });
      setEdit((current) => (current === expected ? null : current));
    } catch (error) {
      setActionError({ path, message: error instanceof Error ? error.message : 'Unable to save file.' });
    }
  };
  const deleteFile = async () => {
    if (!file || !window.confirm(`Are you sure you want to delete ${file.name}?`)) return;
    setActionError(null);
    try {
      await remove.mutateAsync({ path, isDirectory: false });
      onFileDeleted?.(path);
    } catch (error) {
      setActionError({ path, message: error instanceof Error ? error.message : 'Unable to delete file.' });
    }
  };

  if (!file || file.isDirectory)
    return <div className="flex h-full items-center justify-center text-muted-foreground">Select a file to preview its content.</div>;
  const editing = edit?.path === path;
  const render = () => {
    if (isLoading) return <output>Loading file...</output>;
    if (error)
      return (
        <div role="alert">
          <h2>Failed to load file</h2>
          <p>{error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      );
    if (!bytes) return null;
    if (editing && edit)
      return (
        <Textarea
          placeholder="Enter text content..."
          className="h-full min-h-64 font-mono"
          value={edit.content}
          onChange={(event) => setEdit({ path, content: event.target.value })}
        />
      );
    if (kind === 'markdown')
      return (
        <article className="prose max-w-none dark:prose-invert">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </article>
      );
    if (kind === 'html')
      return (
        <div className={fullscreen ? 'fixed inset-0 z-50 bg-background' : 'relative h-full min-h-96'}>
          <Button variant="outline" className="absolute right-2 top-2 z-10 bg-background" onClick={() => setFullscreen(!fullscreen)}>
            {fullscreen ? <Minimize2 className="mr-2 h-4 w-4" /> : <Maximize2 className="mr-2 h-4 w-4" />}
            {fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </Button>
          <iframe
            srcDoc={content}
            title={file.name}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            className="h-full min-h-96 w-full border-0 bg-white"
          />
        </div>
      );
    if (kind === 'image') return objectURL && <img src={objectURL} alt={file.name} className="mx-auto max-h-full max-w-full object-contain" />;
    if (kind === 'video')
      return (
        objectURL && (
          <video src={objectURL} controls className="h-full w-full">
            <track kind="captions" />
          </video>
        )
      );
    if (kind === 'pdf') return <PDFViewer fileData={bytes} onDownload={download} />;
    if (kind === 'binary')
      return (
        <div className="space-y-4 p-6 text-center">
          <FileText className="mx-auto h-12 w-12" />
          <p>Preview unavailable for this file type.</p>
          <Button onClick={download}>Download file</Button>
        </div>
      );
    return <pre className="whitespace-pre-wrap break-words font-mono text-sm">{content}</pre>;
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
        <div>
          <h2 className="break-all font-semibold">{file.name}</h2>
          <span className="text-sm text-muted-foreground">{bytes?.byteLength ?? file.size ?? 0} bytes</span>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button onClick={save} disabled={update.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {update.isPending ? 'Saving...' : 'Save'}
              </Button>
              <Button variant="outline" onClick={() => setEdit(null)} disabled={update.isPending}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </>
          ) : (
            <>
              {text && bytes && !error && (
                <Button variant="outline" onClick={() => setEdit({ path, content })}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              )}
              <Button variant="outline" onClick={download}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
              <Button variant="destructive" onClick={deleteFile} disabled={remove.isPending}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </>
          )}
        </div>
      </header>
      {actionError?.path === path && (
        <p role="alert" className="p-3 text-destructive">
          {actionError.message}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto p-6">
        <Suspense
          fallback={
            <output className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading preview...
            </output>
          }
        >
          {render()}
        </Suspense>
      </div>
    </div>
  );
}
