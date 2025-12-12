import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { AlertCircle, CheckCircle2, FileIcon, Loader2, Upload, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  useUploadSkill,
  useValidateSkillZip,
  type SkillValidationResponse,
} from '../hooks/useSkills';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';

interface SkillUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type UploadStatus = 'idle' | 'validating' | 'uploading' | 'success' | 'error';

export function SkillUploadDialog({ open, onOpenChange }: SkillUploadDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedTier, setSelectedTier] = useState<'user' | 'system'>('system');
  const [allowOverwrite, setAllowOverwrite] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [validationResult, setValidationResult] = useState<SkillValidationResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { userInfo } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadSkill();
  const validateMutation = useValidateSkillZip();

  // Only show system tier option if user is admin
  const isAdmin = userInfo?.is_admin || false;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.zip') && !file.name.endsWith('.skill')) {
      setErrorMessage('Please select a .zip or .skill file');
      setUploadStatus('error');
      return;
    }

    setSelectedFile(file);
    setUploadStatus('validating');
    setErrorMessage(null);

    // Auto-validate on selection
    try {
      const fileData = await readFileAsBase64(file);
      const result = await validateMutation.mutateAsync({ zipData: fileData });

      setValidationResult(result);
      if (!result.valid) {
        setUploadStatus('error');
        setErrorMessage(result.errors.join('; '));
      } else {
        setUploadStatus('idle');
      }
    } catch (error) {
      setUploadStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Validation failed');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !validationResult?.valid) return;

    setUploadStatus('uploading');

    try {
      const fileData = await readFileAsBase64(selectedFile);

      const result = await uploadMutation.mutateAsync({
        zipData: fileData,
        tier: selectedTier,
        allowOverwrite: allowOverwrite,
      });

      setUploadStatus('success');
      toast.success(
        `Skill${result.imported_skills.length > 1 ? 's' : ''} uploaded successfully: ${result.imported_skills.join(', ')}`
      );

      // Close dialog after short delay
      setTimeout(() => {
        onOpenChange(false);
        handleReset();
      }, 1500);
    } catch (error) {
      setUploadStatus('error');
      const errorMsg = error instanceof Error ? error.message : 'Upload failed';
      setErrorMessage(errorMsg);
      toast.error(`Failed to upload skill: ${errorMsg}`);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setSelectedTier('system');
    setAllowOverwrite(false);
    setUploadStatus('idle');
    setValidationResult(null);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDialogChange = (newOpen: boolean) => {
    if (!newOpen) {
      handleReset();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Skill</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Selection */}
          {!selectedFile ? (
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-2">
                Click to select or drag and drop
              </p>
              <p className="text-xs text-muted-foreground">
                .skill or .zip files only
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,.skill"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
          ) : (
            <>
              {/* File Info */}
              <div className="flex items-center gap-3 p-3 bg-muted rounded">
                <FileIcon className="h-5 w-5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={handleReset} type="button">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Validation Status */}
              {uploadStatus === 'validating' && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Validating skill structure...
                </div>
              )}

              {validationResult && (
                <div
                  className={`p-3 rounded ${
                    validationResult.valid
                      ? 'bg-green-50 dark:bg-green-950'
                      : 'bg-red-50 dark:bg-red-950'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {validationResult.valid ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-600" />
                    )}
                    <p className="text-sm font-medium">
                      {validationResult.valid ? 'Valid skill package' : 'Invalid skill package'}
                    </p>
                  </div>

                  {validationResult.skills_found.length > 0 && (
                    <p className="text-xs mb-2">
                      Found: {validationResult.skills_found.join(', ')}
                    </p>
                  )}

                  {validationResult.errors.length > 0 && (
                    <ul className="text-xs text-red-600 space-y-1">
                      {validationResult.errors.map((err, i) => (
                        <li key={i}>• {err}</li>
                      ))}
                    </ul>
                  )}

                  {validationResult.warnings.length > 0 && (
                    <ul className="text-xs text-orange-600 space-y-1 mt-2">
                      {validationResult.warnings.map((warn, i) => (
                        <li key={i}>• {warn}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Tier Selection */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Storage Location</label>
                <Select
                  value={selectedTier}
                  onValueChange={(v) => setSelectedTier(v as 'user' | 'system')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Personal Skills (My Library)</SelectItem>
                    {isAdmin && <SelectItem value="system">System Skills (Global Library)</SelectItem>}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {selectedTier === 'user'
                    ? 'Only you can access this skill'
                    : 'All users can access this skill'}
                </p>
              </div>

              {/* Overwrite Option */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="overwrite"
                  checked={allowOverwrite}
                  onCheckedChange={(checked) => setAllowOverwrite(checked === true)}
                />
                <Label
                  htmlFor="overwrite"
                  className="text-sm font-normal cursor-pointer leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Overwrite existing skill if it already exists
                </Label>
              </div>

              {/* Error Display */}
              {uploadStatus === 'error' && errorMessage && (
                <div className="p-3 bg-red-50 dark:bg-red-950 rounded">
                  <p className="text-sm text-red-600">{errorMessage}</p>
                </div>
              )}

              {/* Success Display */}
              {uploadStatus === 'success' && (
                <div className="p-3 bg-green-50 dark:bg-green-950 rounded">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <p className="text-sm text-green-600 font-medium">Skill uploaded successfully!</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleDialogChange(false)} type="button">
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={
              !selectedFile ||
              !validationResult?.valid ||
              uploadStatus === 'uploading' ||
              uploadStatus === 'validating'
            }
            type="button"
          >
            {uploadStatus === 'uploading' ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              'Upload Skill'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Helper function to read file as base64
async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      const bytes = new Uint8Array(arrayBuffer);
      const binary = Array.from(bytes)
        .map((b) => String.fromCharCode(b))
        .join('');
      resolve(btoa(binary));
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}
